import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { Backend, BackendEvent } from "./backend";
import type { ShieldState } from "./types";

const AUDIO_EXT = ["mp3", "flac", "wav", "m4a", "aac", "ogg", "oga", "opus"];

const asArray = (v: string | string[] | null): string[] => (v === null ? [] : Array.isArray(v) ? v : [v]);

export function createTauriBackend(): Backend {
  return {
    isPreview: false,

    tracks: () => invoke("library_tracks"),
    folders: () => invoke("library_folders"),
    scanStatus: () => invoke("scan_status"),
    addFolders: (paths) => invoke("library_add_folders", { paths }),
    importFiles: (paths) => invoke("library_import_files", { paths }),
    rescan: (force) => invoke("library_rescan", { force }),
    removeFolder: (id) => invoke("library_remove_folder", { id }),
    removeTracks: (ids) => invoke("library_remove_tracks", { ids }),

    favorites: () => invoke("favorites_list"),
    setFavorite: (trackId, favorite) => invoke("favorite_set", { trackId, favorite }),
    recordPlay: (trackId) => invoke("plays_record", { trackId }),
    recentPlays: (limit) => invoke("plays_recent", { limit }),
    clearHistory: () => invoke("plays_clear"),

    playlists: () => invoke("playlists_list"),
    createPlaylist: (name, description, trackIds) => invoke("playlist_create", { name, description, trackIds }),
    updatePlaylist: (id, name, description) => invoke("playlist_update", { id, name, description }),
    deletePlaylist: (id) => invoke("playlist_delete", { id }),
    setPlaylistTracks: (id, trackIds) => invoke("playlist_set_tracks", { id, trackIds }),
    addToPlaylist: (id, trackIds) => invoke("playlist_add_tracks", { id, trackIds }),

    settings: () => invoke("settings_all"),
    setSetting: (key, value) => invoke("settings_set", { key, value }),
    themes: () => invoke("themes_list"),
    saveTheme: (theme) => invoke("theme_save", { theme }),
    deleteTheme: (id) => invoke("theme_delete", { id }),

    pickFolders: async () => asArray(await open({ directory: true, multiple: true, title: "Add music folders" })),
    pickAudioFiles: async () =>
      asArray(
        await open({
          multiple: true,
          title: "Import music files",
          filters: [{ name: "Audio", extensions: AUDIO_EXT }],
        }),
      ),
    pickImage: async () => {
      const p = await open({
        multiple: false,
        title: "Choose a background image",
        filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "webp", "gif", "avif"] }],
      });
      return typeof p === "string" ? p : null;
    },
    openThemeFile: async () => {
      const p = await open({ multiple: false, title: "Import theme", filters: [{ name: "Vyro theme", extensions: ["json"] }] });
      if (typeof p !== "string") return null;
      return invoke<string>("read_theme_file", { path: p });
    },
    saveThemeFile: async (suggestedName, json) => {
      const p = await save({ title: "Export theme", defaultPath: suggestedName, filters: [{ name: "Vyro theme", extensions: ["json"] }] });
      if (!p) return false;
      await invoke("write_theme_file", { path: p, contents: json });
      return true;
    },
    importBackground: (path) => invoke("background_import", { path }),

    lyrics: (trackId, allowOnline, refresh = false) => invoke("lyrics_get", { trackId, allowOnline, refresh }),
    clearLyricsCache: () => invoke("lyrics_clear_cache"),

    shieldState: () => invoke("shield_state"),
    shieldSetConfig: (config) => invoke("shield_set_config", { config }),
    shieldUpdateLists: (force, only) => invoke("shield_update_lists", { force, only: only ?? null }),
    shieldAddList: (name, url) => invoke("shield_add_list", { name, url }),
    shieldRemoveList: (id) => invoke("shield_remove_list", { id }),
    shieldTest: (url, sourceUrl, requestType) => invoke("shield_test", { url, sourceUrl, requestType }),
    shieldReset: () => invoke("shield_reset_defaults"),
    webOpen: (url) => invoke("web_open", { url }),
    webFocus: (label) => invoke("web_focus", { label }),
    webClose: (label) => invoke("web_close", { label }),

    appInfo: () => invoke("app_info"),
    mediaUrl: (track) => convertFileSrc(track.path),
    fileUrl: (path) => convertFileSrc(path),
    setFullscreen: (on) => getCurrentWindow().setFullscreen(on),

    subscribe(cb) {
      const unlisteners: Promise<() => void>[] = [
        listen("scan-progress", (e) => cb({ type: "scan-progress", payload: e.payload } as BackendEvent)),
        listen("library-changed", (e) => cb({ type: "library-changed", payload: e.payload })),
        listen<ShieldState>("shield-changed", (e) => cb({ type: "shield-changed", payload: e.payload })),
        listen("shield-stats", (e) => cb({ type: "shield-stats", payload: e.payload } as BackendEvent)),
        getCurrentWebview().onDragDropEvent((e) => {
          if (e.payload.type === "drop") cb({ type: "files-dropped", payload: e.payload.paths });
        }),
      ];
      return () => unlisteners.forEach((p) => p.then((u) => u()));
    },
  };
}
