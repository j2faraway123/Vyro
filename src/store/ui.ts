import { create } from "zustand";

export type Route =
  | { name: "discover" }
  | { name: "search"; q?: string }
  | { name: "library"; tab?: "albums" | "artists" | "tracks" | "folders" }
  | { name: "album"; key: string }
  | { name: "artist"; artist: string }
  | { name: "favorites" }
  | { name: "playlists" }
  | { name: "playlist"; id: number }
  | { name: "recent" }
  | { name: "web" }
  | { name: "settings"; section?: SettingsSection };

export type SettingsSection = "appearance" | "background" | "shield" | "playback" | "lyrics" | "library" | "shortcuts" | "about";

export interface Toast {
  id: number;
  kind: "info" | "success" | "error";
  text: string;
}

export interface TrackMenuState {
  x: number;
  y: number;
  trackIds: number[];
  /** Present when the menu was opened from a playlist, enabling "Remove from playlist". */
  playlist?: { id: number; index: number };
}

interface UiState {
  route: Route;
  back: Route[];
  forward: Route[];
  navigate: (r: Route) => void;
  replace: (r: Route) => void;
  goBack: () => void;
  goForward: () => void;

  toasts: Toast[];
  toast: (text: string, kind?: Toast["kind"]) => void;
  dismissToast: (id: number) => void;

  fullscreenLyrics: boolean;
  setFullscreenLyrics: (v: boolean) => void;
  shortcutsOpen: boolean;
  setShortcutsOpen: (v: boolean) => void;
  trackMenu: TrackMenuState | null;
  openTrackMenu: (m: TrackMenuState) => void;
  closeTrackMenu: () => void;
  newPlaylist: { trackIds: number[] } | null;
  openNewPlaylist: (trackIds?: number[]) => void;
  closeNewPlaylist: () => void;
  searchFocusTick: number;
  focusSearch: () => void;
}

let toastId = 0;
const same = (a: Route, b: Route) => JSON.stringify(a) === JSON.stringify(b);

export const useUi = create<UiState>((set, get) => ({
  route: { name: "discover" },
  back: [],
  forward: [],
  navigate: (r) => {
    const { route, back } = get();
    if (same(r, route)) return;
    set({ route: r, back: [...back.slice(-49), route], forward: [] });
  },
  replace: (r) => set({ route: r }),
  goBack: () => {
    const { back, route, forward } = get();
    if (!back.length) return;
    set({ route: back[back.length - 1], back: back.slice(0, -1), forward: [route, ...forward] });
  },
  goForward: () => {
    const { back, route, forward } = get();
    if (!forward.length) return;
    set({ route: forward[0], forward: forward.slice(1), back: [...back, route] });
  },

  toasts: [],
  toast: (text, kind = "info") => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, text }] }));
    setTimeout(() => get().dismissToast(id), kind === "error" ? 7000 : 3500);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  fullscreenLyrics: false,
  setFullscreenLyrics: (v) => set({ fullscreenLyrics: v }),
  shortcutsOpen: false,
  setShortcutsOpen: (v) => set({ shortcutsOpen: v }),
  trackMenu: null,
  openTrackMenu: (m) => set({ trackMenu: m }),
  closeTrackMenu: () => set({ trackMenu: null }),
  newPlaylist: null,
  openNewPlaylist: (trackIds = []) => set({ newPlaylist: { trackIds } }),
  closeNewPlaylist: () => set({ newPlaylist: null }),
  searchFocusTick: 0,
  focusSearch: () => set((s) => ({ searchFocusTick: s.searchFocusTick + 1 })),
}));

export const toast = (text: string, kind?: Toast["kind"]) => useUi.getState().toast(text, kind);
