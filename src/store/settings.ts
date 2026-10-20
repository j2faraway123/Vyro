import { create } from "zustand";
import { backend, errorMessage } from "../lib/backend";
import { DEFAULT_SETTINGS, loadSettings, type AppSettings } from "../lib/settings";
import { BUILTIN_THEMES, validateTheme, type VyroTheme } from "../lib/theme";
import { toast } from "./ui";

interface SettingsState {
  settings: AppSettings;
  customThemes: VyroTheme[];
  loaded: boolean;
  init: (stored: unknown, themes: unknown[]) => void;
  update: (patch: Partial<AppSettings> | ((s: AppSettings) => Partial<AppSettings>)) => void;
  updateBackground: (patch: Partial<AppSettings["background"]>) => void;
  installTheme: (theme: VyroTheme) => Promise<void>;
  removeTheme: (id: string) => Promise<void>;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function persist(s: AppSettings) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    backend()
      .setSetting("app", s)
      .catch((e) => toast(`Couldn't save settings: ${errorMessage(e)}`, "error"));
  }, 400);
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  customThemes: [],
  loaded: false,
  init: (stored, themes) => {
    const customThemes = themes.map((t) => validateTheme(t).theme).filter((t): t is VyroTheme => !!t);
    set({ settings: loadSettings(stored), customThemes, loaded: true });
  },
  update: (patch) => {
    const cur = get().settings;
    const next = { ...cur, ...(typeof patch === "function" ? patch(cur) : patch) };
    set({ settings: next });
    persist(next);
  },
  updateBackground: (patch) => get().update((s) => ({ background: { ...s.background, ...patch } })),
  installTheme: async (theme) => {
    await backend().saveTheme(theme);
    set((s) => ({ customThemes: [...s.customThemes.filter((t) => t.id !== theme.id), theme] }));
  },
  removeTheme: async (id) => {
    await backend().deleteTheme(id);
    set((s) => ({ customThemes: s.customThemes.filter((t) => t.id !== id) }));
    if (get().settings.themeId === id) get().update({ themeId: DEFAULT_SETTINGS.themeId });
  },
}));

export function allThemes(custom: VyroTheme[]): VyroTheme[] {
  return [...BUILTIN_THEMES, ...custom];
}

export function useActiveTheme(): VyroTheme {
  const themeId = useSettings((s) => s.settings.themeId);
  const custom = useSettings((s) => s.customThemes);
  return allThemes(custom).find((t) => t.id === themeId) ?? BUILTIN_THEMES[0];
}
