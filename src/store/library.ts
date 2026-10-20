import { create } from "zustand";
import { backend, errorMessage } from "../lib/backend";
import { buildAlbums, buildArtists } from "../lib/library";
import type { Album, Artist, Folder, Play, Playlist, ScanProgress, Track } from "../lib/types";
import { toast } from "./ui";

interface LibraryState {
  loaded: boolean;
  loadError: string | null;
  tracks: Track[];
  byId: Map<number, Track>;
  albums: Map<string, Album>;
  artists: Map<string, Artist>;
  folders: Folder[];
  favorites: Set<number>;
  favoriteOrder: number[];
  playlists: Playlist[];
  recent: Play[];
  scan: ScanProgress | null;

  refresh: () => Promise<void>;
  refreshPlaylists: () => Promise<void>;
  refreshRecent: () => Promise<void>;
  setScan: (p: ScanProgress) => void;
  toggleFavorite: (id: number) => Promise<void>;
  setFavorite: (ids: number[], fav: boolean) => Promise<void>;
  recordPlay: (id: number) => Promise<void>;
  addFolders: () => Promise<void>;
  importFiles: (paths?: string[]) => Promise<void>;
  importDropped: (paths: string[]) => Promise<void>;
  rescan: (force?: boolean) => Promise<void>;
  removeFolder: (id: number) => Promise<void>;

  createPlaylist: (name: string, description?: string, trackIds?: number[]) => Promise<number | null>;
  renamePlaylist: (id: number, name: string, description: string) => Promise<void>;
  deletePlaylist: (id: number) => Promise<void>;
  addToPlaylist: (id: number, trackIds: number[]) => Promise<void>;
  setPlaylistTracks: (id: number, trackIds: number[]) => Promise<void>;
}

function derive(tracks: Track[]) {
  const byId = new Map(tracks.map((t) => [t.id, t]));
  const albums = buildAlbums(tracks);
  const artists = buildArtists(tracks, albums);
  return { tracks, byId, albums, artists };
}

const fail = (what: string) => (e: unknown) => {
  toast(`${what}: ${errorMessage(e)}`, "error");
};

export const useLibrary = create<LibraryState>((set, get) => ({
  loaded: false,
  loadError: null,
  tracks: [],
  byId: new Map(),
  albums: new Map(),
  artists: new Map(),
  folders: [],
  favorites: new Set(),
  favoriteOrder: [],
  playlists: [],
  recent: [],
  scan: null,

  refresh: async () => {
    try {
      const b = backend();
      const [tracks, folders, favorites, playlists, recent] = await Promise.all([
        b.tracks(),
        b.folders(),
        b.favorites(),
        b.playlists(),
        b.recentPlays(500),
      ]);
      set({
        ...derive(tracks),
        folders,
        favorites: new Set(favorites),
        favoriteOrder: favorites,
        playlists,
        recent,
        loaded: true,
        loadError: null,
      });
    } catch (e) {
      set({ loaded: true, loadError: errorMessage(e) });
    }
  },
  refreshPlaylists: async () => {
    set({ playlists: await backend().playlists() });
  },
  refreshRecent: async () => {
    set({ recent: await backend().recentPlays(500) });
  },
  setScan: (p) => set({ scan: p }),

  toggleFavorite: async (id) => get().setFavorite([id], !get().favorites.has(id)),
  setFavorite: async (ids, fav) => {
    const prev = get().favorites;
    const next = new Set(prev);
    ids.forEach((id) => (fav ? next.add(id) : next.delete(id)));
    const order = fav ? [...ids.filter((i) => !prev.has(i)), ...get().favoriteOrder] : get().favoriteOrder.filter((i) => !ids.includes(i));
    set({ favorites: next, favoriteOrder: order });
    try {
      for (const id of ids) await backend().setFavorite(id, fav);
    } catch (e) {
      set({ favorites: prev });
      fail("Couldn't update favorites")(e);
    }
  },
  recordPlay: async (id) => {
    try {
      await backend().recordPlay(id);
      const now = Math.floor(Date.now() / 1000);
      const t = get().byId.get(id);
      if (t) {
        const updated = { ...t, playCount: t.playCount + 1, lastPlayed: now };
        const tracks = get().tracks.map((x) => (x.id === id ? updated : x));
        set({ ...derive(tracks), recent: [{ trackId: id, playedAt: now }, ...get().recent].slice(0, 500) });
      }
    } catch {
      /* history is best-effort */
    }
  },

  addFolders: async () => {
    try {
      const paths = await backend().pickFolders();
      if (!paths.length) return;
      await backend().addFolders(paths);
    } catch (e) {
      fail("Couldn't add folder")(e);
    }
  },
  importFiles: async (paths) => {
    try {
      const chosen = paths ?? (await backend().pickAudioFiles());
      if (!chosen.length) return;
      await backend().importFiles(chosen);
    } catch (e) {
      fail("Couldn't import files")(e);
    }
  },
  importDropped: async (paths) => {
    // Folders are added as watched library folders; files are imported directly.
    const audio = /\.(mp3|flac|wav|m4a|aac|ogg|oga|opus)$/i;
    const files = paths.filter((p) => audio.test(p));
    const dirs = paths.filter((p) => !/\.[a-z0-9]{2,5}$/i.test(p));
    try {
      if (dirs.length) await backend().addFolders(dirs);
      else if (files.length) await backend().importFiles(files);
      else toast("Drop audio files or folders to import them", "info");
    } catch (e) {
      fail("Couldn't import")(e);
    }
  },
  rescan: async (force = false) => {
    try {
      await backend().rescan(force);
    } catch (e) {
      fail("Couldn't rescan")(e);
    }
  },
  removeFolder: async (id) => {
    try {
      await backend().removeFolder(id);
      await get().refresh();
    } catch (e) {
      fail("Couldn't remove folder")(e);
    }
  },

  createPlaylist: async (name, description = "", trackIds = []) => {
    try {
      const id = await backend().createPlaylist(name, description, trackIds);
      await get().refreshPlaylists();
      return id;
    } catch (e) {
      fail("Couldn't create playlist")(e);
      return null;
    }
  },
  renamePlaylist: async (id, name, description) => {
    try {
      await backend().updatePlaylist(id, name, description);
      await get().refreshPlaylists();
    } catch (e) {
      fail("Couldn't rename playlist")(e);
    }
  },
  deletePlaylist: async (id) => {
    try {
      await backend().deletePlaylist(id);
      await get().refreshPlaylists();
    } catch (e) {
      fail("Couldn't delete playlist")(e);
    }
  },
  addToPlaylist: async (id, trackIds) => {
    try {
      await backend().addToPlaylist(id, trackIds);
      await get().refreshPlaylists();
      const pl = get().playlists.find((p) => p.id === id);
      toast(`Added ${trackIds.length === 1 ? "1 track" : `${trackIds.length} tracks`} to ${pl?.name ?? "playlist"}`, "success");
    } catch (e) {
      fail("Couldn't add to playlist")(e);
    }
  },
  setPlaylistTracks: async (id, trackIds) => {
    const prev = get().playlists;
    set({ playlists: prev.map((p) => (p.id === id ? { ...p, trackIds } : p)) });
    try {
      await backend().setPlaylistTracks(id, trackIds);
    } catch (e) {
      set({ playlists: prev });
      fail("Couldn't update playlist")(e);
    }
  },
}));
