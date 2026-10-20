import { create } from "zustand";
import { engine } from "../audio/engine";
import { backend } from "../lib/backend";
import { indexAfterMove, moveItem, nextIndex, prevIndex, shuffleAround } from "../lib/queue";
import type { RepeatMode, Track, YtmState } from "../lib/types";
import { useLibrary } from "./library";
import { useSettings } from "./settings";
import { toast } from "./ui";

/** "ytm": YouTube Music (in its Vyro window) is the active player. */
export type PlaybackSource = "local" | "ytm";

/** Id used for the synthesized track that stands for YouTube Music's song. */
export const YTM_TRACK_ID = -1;

interface YtmLive extends YtmState {
  /** performance.now() when this report arrived, to extrapolate position. */
  at: number;
}

interface PlayerState {
  source: PlaybackSource;
  ytm: YtmLive | null;
  ytmTrack: Track | null;
  setYtm: (s: YtmState | null) => void;
  /** Switches back from YouTube Music and resumes the local queue. */
  playLocal: () => void;
  queue: number[];
  /** The queue in its original (unshuffled) order. */
  original: number[];
  index: number;
  context: string | null;
  playing: boolean;
  loading: boolean;
  position: number;
  duration: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  error: string | null;

  current: () => Track | null;
  playTracks: (ids: number[], start?: number, context?: string) => void;
  playAt: (index: number) => void;
  toggle: () => void;
  play: () => void;
  pause: () => void;
  next: (auto?: boolean) => void;
  prev: () => void;
  seek: (t: number) => void;
  seekBy: (dt: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  addToQueue: (ids: number[]) => void;
  playNext: (ids: number[]) => void;
  removeFromQueue: (index: number) => void;
  moveInQueue: (from: number, to: number) => void;
  clearUpcoming: () => void;
  restore: (saved: unknown) => void;
}

// Records a play once per track load after 10 s or half the track.
let playRecordedFor: number | null = null;
let consecutiveErrors = 0;

function trackById(id: number | undefined): Track | null {
  return id === undefined ? null : (useLibrary.getState().byId.get(id) ?? null);
}

function ytmTrackFor(y: YtmState, palette: string[] | null): Track {
  return {
    id: YTM_TRACK_ID,
    path: "youtube-music:",
    title: y.title || "YouTube Music",
    artist: y.artist || "",
    album: y.album || "",
    albumArtist: y.artist || "",
    trackNo: null,
    discNo: null,
    year: null,
    genre: null,
    duration: y.duration,
    format: "YouTube Music",
    bitrate: null,
    sampleRate: null,
    artwork: y.artwork,
    palette,
    fileSize: 0,
    mtime: 0,
    addedAt: 0,
    playCount: 0,
    lastPlayed: null,
  };
}

const ytmKey = (y: YtmState) => [y.title, y.artist, y.album, y.artwork, Math.round(y.duration)].join("\u0000");
let ytmTicker: ReturnType<typeof setInterval> | null = null;
const ytmPalettes = new Map<string, string[]>();

/** Current playback time in seconds for whichever source is active. */
export function playerTime(): number {
  const { source, ytm } = usePlayer.getState();
  if (source === "ytm" && ytm) {
    const t = ytm.playing ? ytm.position + (performance.now() - ytm.at) / 1000 : ytm.position;
    return ytm.duration > 0 ? Math.min(t, ytm.duration) : t;
  }
  return engine.time;
}

let queueSaveTimer: ReturnType<typeof setTimeout> | null = null;
function saveQueue() {
  if (queueSaveTimer) clearTimeout(queueSaveTimer);
  queueSaveTimer = setTimeout(() => {
    const s = usePlayer.getState();
    backend()
      .setSetting("queue", {
        queue: s.queue.slice(0, 5000),
        original: s.original.slice(0, 5000),
        index: s.index,
        position: Math.floor(engine.time),
        context: s.context,
      })
      .catch(() => {});
  }, 800);
}

function persistPlayback(patch: Partial<{ volume: number; muted: boolean; shuffle: boolean; repeat: RepeatMode }>) {
  useSettings.getState().update(patch);
}

export const usePlayer = create<PlayerState>((set, get) => {
  const ytm = (action: "toggle" | "play" | "pause" | "next" | "prev" | "seek", value?: number) =>
    backend()
      .ytmControl(action, value)
      .catch((e) => toast(`YouTube Music: ${e}`, "error"));
  const isYtm = () => get().source === "ytm";
  /** Hands playback back to the local engine (YouTube Music is paused). */
  const takeOver = () => {
    if (!isYtm()) return;
    if (get().ytm?.playing) void ytm("pause");
    if (ytmTicker) clearInterval(ytmTicker);
    ytmTicker = null;
    const local = trackById(get().queue[get().index]);
    set({ source: "local", playing: false, position: engine.time, duration: engine.duration || local?.duration || 0 });
  };

  const load = (index: number, autoplay: boolean, startAt = 0) => {
    takeOver();
    const { queue } = get();
    const track = trackById(queue[index]);
    if (!track) {
      engine.stop();
      set({ index, playing: false, position: 0, duration: 0 });
      return;
    }
    playRecordedFor = null;
    set({ index, position: startAt, duration: track.duration, error: null, loading: true });
    engine.load(backend().mediaUrl(track), startAt);
    if (autoplay) {
      engine.play().catch((e) => set({ error: String(e), playing: false }));
    }
    saveQueue();
  };

  // Wire engine events once.
  engine.on("play", () => !isYtm() && set({ playing: true }));
  engine.on("pause", () => !isYtm() && set({ playing: false }));
  engine.on("canplay", () => {
    if (isYtm()) return;
    consecutiveErrors = 0;
    set({ loading: false });
  });
  engine.on("loading", () => !isYtm() && set({ loading: true }));
  engine.on("duration", () => !isYtm() && set({ duration: engine.duration || get().duration }));
  engine.on("time", () => {
    if (isYtm()) return;
    const t = engine.time;
    set({ position: t });
    const cur = get().current();
    if (cur && playRecordedFor !== cur.id && (t >= 10 || (engine.duration > 0 && t >= engine.duration / 2))) {
      playRecordedFor = cur.id;
      useLibrary.getState().recordPlay(cur.id);
    }
  });
  engine.on("ended", () => !isYtm() && get().next(true));
  engine.on("error", (msg) => {
    const cur = get().current();
    if (!cur) return;
    consecutiveErrors += 1;
    set({ error: String(msg), playing: false, loading: false });
    toast(`${cur.title}: ${msg}`, "error");
    // Skip to the next track, but stop if everything is failing.
    if (consecutiveErrors < 3 && get().index + 1 < get().queue.length) {
      setTimeout(() => get().next(false), 600);
    }
  });

  const applyYtm = (y: YtmLive) => {
    set({ playing: y.playing, position: y.position, duration: y.duration || get().duration, loading: false, error: null });
    if (ytmTicker) clearInterval(ytmTicker);
    ytmTicker = y.playing ? setInterval(() => isYtm() && set({ position: playerTime() }), 250) : null;
  };

  return {
    source: "local",
    ytm: null,
    ytmTrack: null,
    playLocal: () => {
      takeOver();
      get().play();
    },
    setYtm: (s) => {
      if (!s || !s.active) {
        if (ytmTicker) clearInterval(ytmTicker);
        ytmTicker = null;
        const wasYtm = isYtm();
        set({ ytm: null, ytmTrack: null, ...(wasYtm ? { source: "local" as const, playing: false, position: engine.time, duration: engine.duration || get().current()?.duration || 0 } : {}) });
        return;
      }
      const live: YtmLive = { ...s, at: performance.now() };
      const prev = get().ytm;
      if (!prev || ytmKey(prev) !== ytmKey(s) || !get().ytmTrack) {
        const known = s.artwork ? (ytmPalettes.get(s.artwork) ?? null) : null;
        set({ ytmTrack: ytmTrackFor(s, known) });
        const art = s.artwork;
        if (art && !known) {
          backend()
            .ytmPalette(art)
            .then((p) => {
              ytmPalettes.set(art, p);
              const cur = get().ytm;
              if (cur && cur.artwork === art) set({ ytmTrack: ytmTrackFor(cur, p) });
            })
            .catch(() => {});
        }
      }
      set({ ytm: live });
      if (!isYtm() && (s.playing || get().index < 0)) {
        // YouTube Music started playing (or nothing local is loaded): it becomes the active player.
        engine.pause();
        set({ source: "ytm" });
      }
      if (isYtm()) applyYtm(live);
    },
    queue: [],
    original: [],
    index: -1,
    context: null,
    playing: false,
    loading: false,
    position: 0,
    duration: 0,
    volume: 0.8,
    muted: false,
    shuffle: false,
    repeat: "off",
    error: null,

    current: () => (isYtm() ? get().ytmTrack : trackById(get().queue[get().index])),

    playTracks: (ids, start = 0, context) => {
      if (!ids.length) return;
      const original = ids.slice();
      let queue = ids.slice();
      let index = Math.max(0, Math.min(start, ids.length - 1));
      if (get().shuffle) [queue, index] = shuffleAround(queue, index);
      set({ queue, original, context: context ?? null });
      load(index, true);
    },
    playAt: (index) => {
      if (index < 0 || index >= get().queue.length) return;
      load(index, true);
    },
    toggle: () => {
      if (isYtm()) return void ytm("toggle");
      const { index, queue } = get();
      if (index < 0 && queue.length) return load(0, true);
      if (engine.paused) get().play();
      else get().pause();
    },
    play: () => {
      if (isYtm()) return void ytm("play");
      if (get().index < 0) return;
      if (!engine.el.src) return load(get().index, true, get().position);
      engine.play().catch((e) => toast(`Couldn't start playback: ${e}`, "error"));
    },
    pause: () => (isYtm() ? void ytm("pause") : engine.pause()),
    next: (auto = false) => {
      if (isYtm()) return void ytm("next");
      const { index, queue, repeat } = get();
      const n = nextIndex(index, queue.length, repeat, auto);
      if (n === null) {
        engine.pause();
        engine.seek(0);
        set({ position: 0, playing: false });
        return;
      }
      if (n === index && auto) {
        engine.seek(0);
        engine.play();
        playRecordedFor = null;
        return;
      }
      load(n, true);
    },
    prev: () => {
      if (isYtm()) return void ytm("prev");
      const { index, queue, repeat } = get();
      if (engine.time > 3) {
        engine.seek(0);
        return;
      }
      const p = prevIndex(index, queue.length, repeat);
      if (p !== null) load(p, true);
    },
    seek: (t) => {
      if (isYtm()) {
        const y = get().ytm;
        if (y) set({ ytm: { ...y, position: t, at: performance.now() }, position: t });
        return void ytm("seek", t);
      }
      engine.seek(t);
      set({ position: t });
    },
    seekBy: (dt) => get().seek(Math.max(0, playerTime() + dt)),
    setVolume: (v) => {
      const volume = Math.max(0, Math.min(1, v));
      engine.setVolume(volume, false);
      set({ volume, muted: false });
      persistPlayback({ volume, muted: false });
    },
    toggleMute: () => {
      const muted = !get().muted;
      engine.setVolume(get().volume, muted);
      set({ muted });
      persistPlayback({ muted });
    },
    toggleShuffle: () => {
      const { shuffle, queue, original, index } = get();
      const cur = queue[index];
      if (!shuffle) {
        const [q, i] = shuffleAround(queue, index);
        set({ shuffle: true, queue: q, index: i, original: original.length ? original : queue });
      } else {
        const base = original.length ? original : queue;
        // Keep tracks added while shuffled.
        const extra = queue.filter((id) => !base.includes(id));
        const restored = [...base, ...extra];
        set({ shuffle: false, queue: restored, index: Math.max(0, restored.indexOf(cur)) });
      }
      persistPlayback({ shuffle: !shuffle });
      saveQueue();
    },
    cycleRepeat: () => {
      const order: RepeatMode[] = ["off", "all", "one"];
      const repeat = order[(order.indexOf(get().repeat) + 1) % order.length];
      set({ repeat });
      persistPlayback({ repeat });
    },
    addToQueue: (ids) => {
      if (!ids.length) return;
      const wasEmpty = get().queue.length === 0;
      set((s) => ({ queue: [...s.queue, ...ids], original: [...s.original, ...ids] }));
      toast(ids.length === 1 ? "Added to queue" : `Added ${ids.length} tracks to queue`, "success");
      if (wasEmpty) load(0, false);
      saveQueue();
    },
    playNext: (ids) => {
      if (!ids.length) return;
      const { queue, index, original } = get();
      if (!queue.length) return get().playTracks(ids, 0);
      const q = [...queue.slice(0, index + 1), ...ids, ...queue.slice(index + 1)];
      const curId = queue[index];
      const oi = original.indexOf(curId);
      const o = oi >= 0 ? [...original.slice(0, oi + 1), ...ids, ...original.slice(oi + 1)] : [...original, ...ids];
      set({ queue: q, original: o });
      toast(ids.length === 1 ? "Playing next" : `${ids.length} tracks playing next`, "success");
      saveQueue();
    },
    removeFromQueue: (i) => {
      const { queue, index } = get();
      if (i < 0 || i >= queue.length) return;
      const removed = queue[i];
      const q = queue.filter((_, k) => k !== i);
      const original = get().original.slice();
      const oi = original.indexOf(removed);
      if (oi >= 0) original.splice(oi, 1);
      set({ queue: q, original });
      if (i < index) set({ index: index - 1 });
      else if (i === index) {
        if (q.length === 0) {
          engine.stop();
          set({ index: -1, playing: false, position: 0 });
        } else load(Math.min(index, q.length - 1), get().playing);
      }
      saveQueue();
    },
    moveInQueue: (from, to) => {
      const { queue, index } = get();
      set({ queue: moveItem(queue, from, to), index: indexAfterMove(index, from, to) });
      saveQueue();
    },
    clearUpcoming: () => {
      const { queue, index } = get();
      set({ queue: queue.slice(0, index + 1), original: queue.slice(0, index + 1) });
      saveQueue();
    },
    restore: (saved) => {
      const s = useSettings.getState().settings;
      engine.setVolume(s.volume, s.muted);
      set({ volume: s.volume, muted: s.muted, shuffle: s.shuffle, repeat: s.repeat });
      if (!s.resumePlayback || !saved || typeof saved !== "object") return;
      const q = saved as { queue?: number[]; original?: number[]; index?: number; position?: number; context?: string };
      const byId = useLibrary.getState().byId;
      const queue = (q.queue ?? []).filter((id) => byId.has(id));
      if (!queue.length) return;
      const original = (q.original ?? queue).filter((id) => byId.has(id));
      const index = Math.min(Math.max(0, q.index ?? 0), queue.length - 1);
      set({ queue, original, context: q.context ?? null });
      load(index, false, q.position ?? 0);
    },
  };
});

export function useCurrentTrack(): Track | null {
  const id = usePlayer((s) => s.queue[s.index]);
  const ytmTrack = usePlayer((s) => (s.source === "ytm" ? s.ytmTrack : null));
  const byId = useLibrary((s) => s.byId);
  if (ytmTrack) return ytmTrack;
  return id === undefined ? null : (byId.get(id) ?? null);
}
