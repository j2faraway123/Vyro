import { DEFAULT_BACKGROUND, sanitizeBackground, type BackgroundSettings } from "./backgrounds";
import type { RepeatMode } from "./types";

export interface AppSettings {
  version: 1;
  themeId: string;
  accent: string | null; // null = theme accent
  radius: number | null; // null = theme radius
  density: "comfortable" | "compact" | null; // null = theme density
  sidebar: "expanded" | "collapsed" | "hidden";
  rightPanel: boolean;
  rightTab: "lyrics" | "queue" | "details";
  background: BackgroundSettings;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  resumePlayback: boolean;
  onlineLyrics: boolean;
  lyricsOffset: number; // seconds, applied to synced lyrics
  lyricsSize: number; // 0.8-1.6
  libraryView: "grid" | "list";
}

export const DEFAULT_SETTINGS: AppSettings = {
  version: 1,
  themeId: "vyro-dark",
  accent: null,
  radius: null,
  density: null,
  sidebar: "expanded",
  rightPanel: true,
  rightTab: "lyrics",
  background: DEFAULT_BACKGROUND,
  volume: 0.8,
  muted: false,
  shuffle: false,
  repeat: "off",
  resumePlayback: true,
  onlineLyrics: true,
  lyricsOffset: 0,
  lyricsSize: 1,
  libraryView: "grid",
};

const num = (v: unknown, lo: number, hi: number, d: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const oneOf = <T extends string>(v: unknown, options: readonly T[], d: T): T =>
  options.includes(v as T) ? (v as T) : d;

/** Merges stored settings over defaults so new versions add keys safely. */
export function loadSettings(stored: unknown): AppSettings {
  const s = (stored && typeof stored === "object" ? stored : {}) as Partial<AppSettings>;
  const d = DEFAULT_SETTINGS;
  return {
    version: 1,
    themeId: typeof s.themeId === "string" ? s.themeId : d.themeId,
    accent: typeof s.accent === "string" && /^#[0-9a-f]{6}$/i.test(s.accent) ? s.accent : null,
    radius: s.radius === null || s.radius === undefined ? null : num(s.radius, 0, 32, 16),
    density: s.density === "compact" || s.density === "comfortable" ? s.density : null,
    sidebar: oneOf(s.sidebar, ["expanded", "collapsed", "hidden"] as const, d.sidebar),
    rightPanel: bool(s.rightPanel, d.rightPanel),
    rightTab: oneOf(s.rightTab, ["lyrics", "queue", "details"] as const, d.rightTab),
    background: sanitizeBackground(s.background),
    volume: num(s.volume, 0, 1, d.volume),
    muted: bool(s.muted, d.muted),
    shuffle: bool(s.shuffle, d.shuffle),
    repeat: oneOf(s.repeat, ["off", "all", "one"] as const, d.repeat),
    resumePlayback: bool(s.resumePlayback, d.resumePlayback),
    onlineLyrics: bool(s.onlineLyrics, d.onlineLyrics),
    lyricsOffset: num(s.lyricsOffset, -10, 10, 0),
    lyricsSize: num(s.lyricsSize, 0.8, 1.6, 1),
    libraryView: oneOf(s.libraryView, ["grid", "list"] as const, d.libraryView),
  };
}
