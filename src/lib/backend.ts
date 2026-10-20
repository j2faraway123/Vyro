import type {
  AppInfo,
  Folder,
  Lyrics,
  Play,
  Playlist,
  ScanProgress,
  ShieldConfig,
  ShieldDecision,
  ShieldState,
  Track,
  WebWindowStats,
  YtmState,
} from "./types";

export type BackendEvent =
  | { type: "scan-progress"; payload: ScanProgress }
  | { type: "library-changed"; payload: unknown }
  | { type: "shield-changed"; payload: ShieldState }
  | { type: "shield-stats"; payload: WebWindowStats[] }
  | { type: "files-dropped"; payload: string[] }
  | { type: "ytm-state"; payload: YtmState | null };

export interface Backend {
  /** True in the browser preview (no desktop runtime): demo data only. */
  readonly isPreview: boolean;

  tracks(): Promise<Track[]>;
  folders(): Promise<Folder[]>;
  scanStatus(): Promise<ScanProgress>;
  addFolders(paths: string[]): Promise<void>;
  importFiles(paths: string[]): Promise<void>;
  rescan(force: boolean): Promise<void>;
  removeFolder(id: number): Promise<void>;
  removeTracks(ids: number[]): Promise<void>;

  favorites(): Promise<number[]>;
  setFavorite(trackId: number, favorite: boolean): Promise<void>;
  recordPlay(trackId: number): Promise<void>;
  recentPlays(limit: number): Promise<Play[]>;
  clearHistory(): Promise<void>;

  playlists(): Promise<Playlist[]>;
  createPlaylist(name: string, description: string, trackIds: number[]): Promise<number>;
  updatePlaylist(id: number, name: string, description: string): Promise<void>;
  deletePlaylist(id: number): Promise<void>;
  setPlaylistTracks(id: number, trackIds: number[]): Promise<void>;
  addToPlaylist(id: number, trackIds: number[]): Promise<void>;

  settings(): Promise<Record<string, unknown>>;
  setSetting(key: string, value: unknown): Promise<void>;
  themes(): Promise<unknown[]>;
  saveTheme(theme: object): Promise<void>;
  deleteTheme(id: string): Promise<void>;

  pickFolders(): Promise<string[]>;
  pickAudioFiles(): Promise<string[]>;
  pickImage(): Promise<string | null>;
  /** Returns the chosen theme file's text, or null if cancelled. */
  openThemeFile(): Promise<string | null>;
  /** Returns false if the user cancelled. */
  saveThemeFile(suggestedName: string, json: string): Promise<boolean>;
  importBackground(path: string): Promise<string>;

  lyrics(trackId: number, allowOnline: boolean, refresh?: boolean): Promise<Lyrics>;
  clearLyricsCache(): Promise<void>;

  shieldState(): Promise<ShieldState>;
  shieldSetConfig(config: ShieldConfig): Promise<ShieldState>;
  shieldUpdateLists(force: boolean, only?: string): Promise<{ errors: string[]; state: ShieldState }>;
  shieldAddList(name: string, url: string): Promise<ShieldState>;
  shieldRemoveList(id: string): Promise<ShieldState>;
  shieldTest(url: string, sourceUrl: string, requestType: string): Promise<ShieldDecision>;
  shieldReset(): Promise<ShieldState>;
  webOpen(url: string): Promise<string>;
  webFocus(label: string): Promise<void>;
  webClose(label: string): Promise<void>;
  ytmOpen(): Promise<void>;
  ytmClose(): Promise<void>;
  ytmControl(action: "toggle" | "play" | "pause" | "next" | "prev" | "seek", value?: number): Promise<void>;
  ytmPalette(artworkUrl: string): Promise<string[]>;
  lyricsLookup(title: string, artist: string, album: string, duration: number): Promise<Lyrics>;

  appInfo(): Promise<AppInfo>;
  mediaUrl(track: Track): string;
  fileUrl(path: string): string;
  setFullscreen(on: boolean): Promise<void>;
  subscribe(cb: (e: BackendEvent) => void): () => void;
}

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Normalises errors thrown by invoke (strings) and JS (Error objects). */
export function errorMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return "Something went wrong";
  }
}

let backendPromise: Promise<Backend> | null = null;

export function loadBackend(): Promise<Backend> {
  if (!backendPromise) {
    backendPromise = isTauri
      ? import("./backend-tauri").then((m) => m.createTauriBackend())
      : import("./backend-preview").then((m) => m.createPreviewBackend());
  }
  return backendPromise;
}

let current: Backend | null = null;
export function setBackend(b: Backend) {
  current = b;
}
/** The active backend; available once the app has booted. */
export function backend(): Backend {
  if (!current) throw new Error("Backend not initialised");
  return current;
}
