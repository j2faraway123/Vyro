/**
 * Browser preview backend, used only when Vyro runs in a plain browser
 * (`npm run dev` without Tauri). It serves a small, clearly labelled demo
 * library with synthesized audio so the interface can be developed and tested
 * without the desktop runtime. It cannot read your files, filter web content
 * or fetch lyrics; those require the desktop app.
 */
import type { Backend, BackendEvent } from "./backend";
import type { Lyrics, Play, Playlist, ShieldState, Track } from "./types";
import { DEFAULT_SHIELD_PREVIEW } from "./shield-defaults";

interface DemoAlbum {
  title: string;
  artist: string;
  year: number;
  genre: string;
  colors: [string, string, string];
  tracks: string[];
  root: number; // base frequency for the synth
}

const DEMO: DemoAlbum[] = [
  { title: "Glass Harbor", artist: "Lumen Field", year: 2023, genre: "Ambient", colors: ["#1e6f86", "#0d2b45", "#7fd1c7"], tracks: ["Low Tide Lights", "Harbor Glass", "Northern Pier", "Foghorn Lullaby"], root: 220 },
  { title: "Ember Season", artist: "Ola Varn", year: 2022, genre: "Indie", colors: ["#c2410c", "#4a1d1d", "#fbbf24"], tracks: ["Kindling", "Ember Season", "Smoke Signals", "Last Warm Night"], root: 196 },
  { title: "Velvet Static", artist: "Neon Parish", year: 2024, genre: "Synthwave", colors: ["#a21caf", "#1e1b4b", "#f472b6"], tracks: ["Velvet Static", "Arcade Rain", "Heartline", "Afterglow Drive"], root: 247 },
  { title: "Moss & Marble", artist: "The Quiet Arms", year: 2021, genre: "Folk", colors: ["#3f6212", "#1c1917", "#a3e635"], tracks: ["Moss", "Marble Steps", "Garden Wall", "Evening Bell"], root: 174 },
  { title: "Paper Satellites", artist: "Iris Kade", year: 2020, genre: "Electronic", colors: ["#2563eb", "#0f172a", "#93c5fd"], tracks: ["Paper Satellites", "Orbit Song", "Telemetry", "Reentry"], root: 262 },
  { title: "Saffron Hours", artist: "Mira Sol", year: 2023, genre: "Jazz", colors: ["#d97706", "#292524", "#fde68a"], tracks: ["Saffron Hours", "Blue Room", "Brass Mornings", "Sundown Waltz"], root: 233 },
  { title: "Cold Signal", artist: "Lumen Field", year: 2019, genre: "Ambient", colors: ["#475569", "#020617", "#cbd5e1"], tracks: ["Cold Signal", "Snowfield", "Static Bloom", "Long Wave"], root: 208 },
  { title: "Rose Engine", artist: "Neon Parish", year: 2021, genre: "Synthwave", colors: ["#e11d48", "#2e1065", "#fb7185"], tracks: ["Rose Engine", "Chrome Hearts", "Midnight Mile", "Pulse"], root: 185 },
];

function artSvg(a: DemoAlbum, i: number): string {
  const [c1, c2, c3] = a.colors;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient><radialGradient id="r" cx="${0.3 + (i % 3) * 0.2}" cy="${0.35 + (i % 2) * 0.25}" r="0.6"><stop offset="0" stop-color="${c3}" stop-opacity="0.85"/><stop offset="1" stop-color="${c3}" stop-opacity="0"/></radialGradient></defs><rect width="400" height="400" fill="url(#g)"/><rect width="400" height="400" fill="url(#r)"/><circle cx="${120 + i * 25}" cy="${260 - i * 12}" r="${60 + i * 6}" fill="none" stroke="${c3}" stroke-opacity="0.5" stroke-width="2"/><text x="28" y="370" font-family="sans-serif" font-size="22" font-weight="700" fill="#fff" fill-opacity="0.85">${a.title.replace(/&/g, "&amp;")}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const DURATION = 48;

function buildTracks(): Track[] {
  const out: Track[] = [];
  let id = 1;
  const now = Math.floor(Date.now() / 1000);
  DEMO.forEach((a, ai) => {
    const art = artSvg(a, ai);
    a.tracks.forEach((title, ti) => {
      out.push({
        id: id++,
        path: `demo://${ai}/${ti}`,
        title,
        artist: a.artist,
        album: a.title,
        albumArtist: a.artist,
        trackNo: ti + 1,
        discNo: 1,
        year: a.year,
        genre: a.genre,
        duration: DURATION,
        format: "wav",
        bitrate: 352,
        sampleRate: 22050,
        artwork: art,
        palette: [a.colors[0], a.colors[2], a.colors[1]],
        fileSize: 0,
        mtime: 0,
        addedAt: now - (DEMO.length - ai) * 86400 * 3 - ti,
        playCount: 0,
        lastPlayed: null,
      });
    });
  });
  return out;
}

/** Synthesizes a soft chord progression as a WAV blob URL. */
function synth(root: number, seed: number): string {
  const rate = 22050;
  const n = rate * DURATION;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, n * 2, true);
  const progressions = [
    [0, 5, 7, 3],
    [0, 3, 5, 7],
    [0, 7, 9, 5],
  ];
  const prog = progressions[seed % progressions.length];
  const bar = 4; // seconds per chord
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const chord = prog[Math.floor(t / bar) % prog.length];
    const base = root * 2 ** (chord / 12);
    const local = (t % bar) / bar;
    const env = Math.min(1, local * 8) * (1 - local * 0.6);
    let s = 0;
    for (const [mult, amp] of [
      [1, 0.32],
      [1.25, 0.2],
      [1.5, 0.2],
      [2, 0.08],
    ]) {
      s += Math.sin(2 * Math.PI * base * mult * t) * amp;
    }
    // A gentle arpeggio on top.
    const step = Math.floor(t * 4) % 4;
    const arp = base * [2, 2.5, 3, 2.5][step];
    const arpEnv = 1 - ((t * 4) % 1);
    s += Math.sin(2 * Math.PI * arp * t) * 0.12 * arpEnv * arpEnv;
    const fade = Math.min(1, t / 1.5, (DURATION - t) / 2);
    v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s * env * 0.6 * fade)) * 32767, true);
  }
  return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
}

function demoLyrics(t: Track): Lyrics {
  if (t.id % 4 === 0) return { synced: null, plain: null, instrumental: false, source: "none" };
  if (t.id % 4 === 3)
    return {
      synced: null,
      plain: `${t.title}\n\nThese are plain, unsynchronized demo lyrics.\nThey scroll freely instead of following the music.`,
      instrumental: false,
      source: "embedded",
    };
  const words = [
    "Lights come up across the water",
    "Every color finds its place",
    "I can hear the city turning",
    "Slowly, slowly, into space",
    "",
    `Sing it back, ${t.title.toLowerCase()}`,
    "Hold the moment, let it ring",
    "All the static turns to silver",
    "When the quiet starts to sing",
    "",
    "Fade the edges, keep the glow",
    "Let the low notes carry home",
    "Every echo, every window",
    "Every road I've ever known",
  ];
  const lrc = words.map((w, i) => `[00:${String(3 + i * 3).padStart(2, "0")}.00] ${w}`).join("\n");
  return { synced: lrc, plain: words.join("\n"), instrumental: false, source: "lrclib" };
}

const LS = "vyro-preview:";
const load = <T,>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem(LS + k);
    return v ? (JSON.parse(v) as T) : d;
  } catch {
    return d;
  }
};
const store = (k: string, v: unknown) => {
  try {
    localStorage.setItem(LS + k, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
};

export function createPreviewBackend(): Backend {
  const tracks = buildTracks();
  const audio = new Map<number, string>();
  let favorites = load<number[]>("favorites", []);
  let plays = load<Play[]>("plays", []);
  let playlists = load<Playlist[]>("playlists", []);
  const settings = load<Record<string, unknown>>("settings", {});
  let themes = load<{ id: string }[]>("themes", []);
  const listeners = new Set<(e: BackendEvent) => void>();
  const desktopOnly = () => Promise.reject("This needs the Vyro desktop app; the browser preview uses demo data only.");
  const shield: ShieldState = DEFAULT_SHIELD_PREVIEW;
  const withCounts = () =>
    tracks.map((t) => {
      const p = plays.filter((x) => x.trackId === t.id);
      return { ...t, playCount: p.length, lastPlayed: p[0]?.playedAt ?? null };
    });

  return {
    isPreview: true,
    tracks: async () => withCounts(),
    folders: async () => [],
    scanStatus: async () => ({ running: false, total: 0, processed: 0, added: 0, updated: 0, removed: 0, skipped: 0, current: null, errors: [] }),
    addFolders: desktopOnly,
    importFiles: desktopOnly,
    rescan: desktopOnly,
    removeFolder: desktopOnly,
    removeTracks: desktopOnly,

    favorites: async () => favorites,
    setFavorite: async (id, fav) => {
      favorites = fav ? [id, ...favorites.filter((x) => x !== id)] : favorites.filter((x) => x !== id);
      store("favorites", favorites);
    },
    recordPlay: async (trackId) => {
      plays = [{ trackId, playedAt: Math.floor(Date.now() / 1000) }, ...plays].slice(0, 500);
      store("plays", plays);
    },
    recentPlays: async (limit) => plays.slice(0, limit),
    clearHistory: async () => {
      plays = [];
      store("plays", plays);
    },

    playlists: async () => playlists,
    createPlaylist: async (name, description, trackIds) => {
      if (!name.trim()) throw "Playlist name cannot be empty";
      const id = Math.max(0, ...playlists.map((p) => p.id)) + 1;
      const now = Math.floor(Date.now() / 1000);
      playlists = [{ id, name: name.trim(), description, createdAt: now, updatedAt: now, trackIds }, ...playlists];
      store("playlists", playlists);
      return id;
    },
    updatePlaylist: async (id, name, description) => {
      if (!name.trim()) throw "Playlist name cannot be empty";
      playlists = playlists.map((p) => (p.id === id ? { ...p, name: name.trim(), description } : p));
      store("playlists", playlists);
    },
    deletePlaylist: async (id) => {
      playlists = playlists.filter((p) => p.id !== id);
      store("playlists", playlists);
    },
    setPlaylistTracks: async (id, trackIds) => {
      playlists = playlists.map((p) => (p.id === id ? { ...p, trackIds, updatedAt: Math.floor(Date.now() / 1000) } : p));
      store("playlists", playlists);
    },
    addToPlaylist: async (id, trackIds) => {
      playlists = playlists.map((p) => (p.id === id ? { ...p, trackIds: [...p.trackIds, ...trackIds] } : p));
      store("playlists", playlists);
    },

    settings: async () => settings,
    setSetting: async (k, v) => {
      settings[k] = v;
      store("settings", settings);
    },
    themes: async () => themes,
    saveTheme: async (t) => {
      const theme = t as { id: string };
      themes = [...themes.filter((x) => x.id !== theme.id), theme];
      store("themes", themes);
    },
    deleteTheme: async (id) => {
      themes = themes.filter((x) => x.id !== id);
      store("themes", themes);
    },

    pickFolders: desktopOnly,
    pickAudioFiles: desktopOnly,
    pickImage: desktopOnly,
    openThemeFile: () =>
      new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json,application/json";
        input.onchange = () => {
          const f = input.files?.[0];
          if (!f) return resolve(null);
          f.text().then(resolve, () => resolve(null));
        };
        input.click();
      }),
    saveThemeFile: async (name, json) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      a.download = name;
      a.click();
      return true;
    },
    importBackground: desktopOnly,

    lyrics: async (trackId) => {
      const t = tracks.find((x) => x.id === trackId);
      if (!t) throw "Track not found";
      await new Promise((r) => setTimeout(r, 250));
      return demoLyrics(t);
    },
    clearLyricsCache: async () => {},

    shieldState: async () => shield,
    shieldSetConfig: desktopOnly,
    shieldUpdateLists: desktopOnly,
    shieldAddList: desktopOnly,
    shieldRemoveList: desktopOnly,
    shieldTest: desktopOnly,
    shieldReset: desktopOnly,
    webOpen: desktopOnly,
    webFocus: desktopOnly,
    webClose: desktopOnly,
    ytmOpen: desktopOnly,
    ytmSetBounds: async () => {},
    ytmReload: desktopOnly,
    ytmClose: desktopOnly,
    ytmControl: desktopOnly,
    ytmPalette: desktopOnly,
    lyricsLookup: desktopOnly,

    appInfo: async () => ({ version: "0.1.0", dataDir: "(browser preview)", platform: "browser", formats: ["wav"] }),
    mediaUrl: (t) => {
      let url = audio.get(t.id);
      if (!url) {
        const [ai] = t.path.replace("demo://", "").split("/").map(Number);
        url = synth(DEMO[ai].root, t.id);
        audio.set(t.id, url);
      }
      return url;
    },
    fileUrl: (p) => p,
    setFullscreen: async (on) => {
      if (on) await document.documentElement.requestFullscreen?.().catch(() => {});
      else if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    },
    subscribe: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}
