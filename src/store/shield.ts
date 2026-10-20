import { create } from "zustand";
import { backend, errorMessage } from "../lib/backend";
import type { ShieldConfig, ShieldState, WebWindowStats } from "../lib/types";
import { toast } from "./ui";

interface ShieldStore {
  state: ShieldState | null;
  updating: boolean;
  lastErrors: string[];
  load: () => Promise<void>;
  setState: (s: ShieldState) => void;
  setWindows: (w: WebWindowStats[]) => void;
  setConfig: (patch: Partial<ShieldConfig>) => Promise<void>;
  updateLists: (force: boolean, only?: string) => Promise<void>;
}

/** A command reply can be older than a "rebuilt" event that arrived first; keep the newer engine. */
function withNewestEngine(prev: ShieldState | null, next: ShieldState): ShieldState {
  if (!prev) return next;
  const a = prev.engine;
  const b = next.engine;
  const prevNewer = a.revision > b.revision || (a.revision === b.revision && b.building && !a.building);
  return prevNewer ? { ...next, engine: a } : next;
}

export const useShield = create<ShieldStore>((set, get) => ({
  state: null,
  updating: false,
  lastErrors: [],
  load: async () => {
    try {
      set({ state: withNewestEngine(get().state, await backend().shieldState()) });
    } catch (e) {
      toast(`Couldn't load Vyro Shield: ${errorMessage(e)}`, "error");
    }
  },
  setState: (s) => set({ state: withNewestEngine(get().state, s) }),
  setWindows: (windows) => {
    const s = get().state;
    if (s) set({ state: { ...s, windows, totalBlocked: Math.max(s.totalBlocked, windows.reduce((n, w) => n + w.blocked, 0)) } });
  },
  setConfig: async (patch) => {
    const s = get().state;
    if (!s) return;
    const config = { ...s.config, ...patch };
    set({ state: { ...s, config } });
    try {
      const next = withNewestEngine(get().state, await backend().shieldSetConfig(config));
      set({ state: next });
      // Switching on (or enabling a list): fetch enabled lists that were never downloaded.
      const relevant = patch.enabled === true || patch.lists !== undefined;
      const missing = next.config.enabled && next.config.lists.some((l) => l.enabled && !next.statuses[l.id]?.downloaded);
      if (relevant && missing && !get().updating) void get().updateLists(false);
    } catch (e) {
      set({ state: s });
      toast(`Couldn't change Vyro Shield settings: ${errorMessage(e)}`, "error");
    }
  },
  updateLists: async (force, only) => {
    set({ updating: true, lastErrors: [] });
    try {
      const r = await backend().shieldUpdateLists(force, only);
      set({ state: withNewestEngine(get().state, r.state), lastErrors: r.errors });
      if (r.errors.length) toast(r.errors[0], "error");
      else toast("Filter lists are up to date", "success");
    } catch (e) {
      const msg = errorMessage(e);
      set({ lastErrors: [msg] });
      toast(msg, "error");
    } finally {
      set({ updating: false });
    }
  },
}));
