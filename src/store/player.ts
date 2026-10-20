import { create } from "zustand";
import { engine } from "../audio/engine";
import { backend } from "../lib/backend";
import { indexAfterMove, moveItem, nextIndex, prevIndex, shuffleAround } from "../lib/queue";
import type { RepeatMode, Track, YtmState } from "../lib/types";
import { useLibrary } from "./library";
import { useSettings } from "./settings";
import { toast } from "./ui";

/**
 * "ytm": YouTube Music (in its Vyro window) is the active player.
 * "yt": a YouTube video in Vyro's embedded player is the active player.
 */
export type PlaybackSource = "local" | "ytm" | "yt";

/** Id used for the synthesized track that stands for YouTube Music's song. */
export const YTM_TRACK_ID = -1;
/** Id used for the synthesized track of a YouTube video in Vyro's player. */
export const YT_TRACK_ID = -2;

interface Live {
  playing: boolean;
  position: number;
  duration: number;
  /** performance.now() when this report arrived, to extrapolate position. */
  at: number;
}

type YtmLive = YtmState & Live;

export type ExternalAction = "toggle" | "play" | "pause" | "next" | "prev" | "seek";

/** What the embedded YouTube player reports. */
export interface YtReport {
  track: Track;
  playing: boolean;
  position: number;
  duration: number;
}

/** Controls the embedded YouTube player (registered by store/youtube). */
let ytControl: ((action: ExternalAction, value?: number) => void) | null = null;
export function registerYouTubeControl(fn: typeof ytControl) {
  ytControl = fn;
}

interface PlayerState {
  source: PlaybackSource;
  ytm: YtmLive | null;
  ytmTrack: Track | null;
  setYtm: (s: YtmState | null) => void;
  yt: Live | null;
  ytTrack: Track | null;
  /** Reports the embedded YouTube player's state; `activate` makes it the active player. */
  setYt: (s: YtReport | null, activate?: boolean) => void;
  /** Switches back from YouTube or YouTube Music and resumes the local queue. */
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
let extTicker: ReturnType<typeof setInterval> | null = null;
const ytmPalettes = new Map<string, string[]>();

/** Current playback time in seconds for whichever source is active. */
export function playerTime(): number {
  const { source, ytm, yt } = usePlayer.getState();
  const live = source === "ytm" ? ytm : source === "yt" ? yt : null;
  if (live) {
    const t = live.playing ? live.position + (performance.now() - live.at) / 1000 : live.position;
    return live.duration > 0 ? Math.min(t, live.duration) : t;
  }
  return engine.time;
}

/** The page that a synthesized (non-library) track belongs to. */
export function externalRoute(track: Track): { name: "ytm" } | { name: "youtube" } | null {
  if (track.id === YTM_TRACK_ID) return { name: "ytm" };
  if (track.id === YT_TRACK_ID) return { name: "youtube" };
  return null;
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
  const ytmCtl = (action: ExternalAction, value?: number) =>
    backend()
      .ytmControl(action, value)
      .catch((e) => toast(`YouTube Music: ${e}`, "error"));
  const control = (action: ExternalAction, value?: number) => {
    if (get().source === "ytm") void ytmCtl(action, value);
    else ytControl?.(action, value);
  };
  const isYtm = () => get().source === "ytm";
  const isExt = () => get().source !== "local";
  const stopTicker = () => {
    if (extTicker) clearInterval(extTicker);
    extTicker = null;
  };
  /** Pauses the other external player when one of them takes over. */
  const pauseOther = (taking: PlaybackSource) => {
    if (taking !== "ytm" && get().ytm?.playing) void ytmCtl("pause");
    if (taking !== "yt" && get().yt?.playing) ytControl?.("pause");
  };
  const localState = () => {
    const local = trackById(get().queue[get().index]);
    return { source: "local" as const, playing: false, position: engine.time, duration: engine.duration || local?.duration || 0 };
  };
  /** Hands playback back to the local engine (the external player is paused). */
  const takeOver = () => {
    if (!isExt()) return;
    pauseOther("local");
    stopTicker();
    set(localState());
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
  engine.on("play", () => !isExt() && set({ playing: true }));
  engine.on("pause", () => !isExt() && set({ playing: false }));
  engine.on("canplay", () => {
    if (isExt()) return;
    consecutiveErrors = 0;
    set({ loading: false });
  });
  engine.on("loading", () => !isExt() && set({ loading: true }));
  engine.on("duration", () => !isExt() && set({ duration: engine.duration || get().duration }));
  engine.on("time", () => {
    if (isExt()) return;
    const t = engine.time;
    set({ position: t });
    const cur = get().current();
    if (cur && playRecordedFor !== cur.id && (t >= 10 || (engine.duration > 0 && t >= engine.duration / 2))) {
      playRecordedFor = cur.id;
      useLibrary.getState().recordPlay(cur.id);
    }
  });
  engine.on("ended", () => !isExt() && get().next(true));
  engine.on("error", (msg) => {
    if (isExt()) return;
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

  const applyLive = (y: Live) => {
    set({ playing: y.playing, position: y.position, duration: y.duration || get().duration, loading: false, error: null });
    stopTicker();
    extTicker = y.playing ? setInterval(() => isExt() && set({ position: playerTime() }), 250) : null;
  };

  return {
    source: "local",
    ytm: null,
    ytmTrack: null,
    playLocal: () => {
      takeOver();
      get().play();
    },
    yt: null,
    ytTrack: null,
    setYt: (s, activate = false) => {
      if (!s) {
        const was = get().source === "yt";
        if (was) stopTicker();
        set({ yt: null, ytTrack: null });
        if (was) set(localState());
        return;
      }
      const y: Live = { playing: s.playing, position: s.position, duration: s.duration, at: performance.now() };
      set({ yt: y, ytTrack: s.track });
      // Only an explicit play makes it active: a late "playing" report after
      // another source took over must not steal playback back.
      if (get().source !== "yt" && activate) {
        engine.pause();
        pauseOther("yt");
        set({ source: "yt" });
      }
      if (get().source === "yt") applyLive(y);
    },
    setYtm: (s) => {
      if (!s || !s.active) {
        const was = isYtm();
        if (was) stopTicker();
        set({ ytm: null, ytmTrack: null });
        if (was) set(localState());
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
      if (!isYtm() && (s.playing || (get().source === "local" && get().index < 0))) {
        // YouTube Music started playing (or nothing else is loaded): it becomes the active player.
        engine.pause();
        pauseOther("ytm");
        set({ source: "ytm" });
      }
      if (isYtm()) applyLive(live);
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

    current: () => (isYtm() ? get().ytmTrack : get().source === "yt" ? get().ytTrack : trackById(get().queue[get().index])),

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
      if (isExt()) return control("toggle");
      const { index, queue } = get();
      if (index < 0 && queue.length) return load(0, true);
      if (engine.paused) get().play();
      else get().pause();
    },
    play: () => {
      if (isExt()) return control("play");
      if (get().index < 0) return;
      if (!engine.el.src) return load(get().index, true, get().position);
      engine.play().catch((e) => toast(`Couldn't start playback: ${e}`, "error"));
    },
    pause: () => (isExt() ? control("pause") : engine.pause()),
    next: (auto = false) => {
      if (isExt()) return control("next");
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
      if (isExt()) return control("prev");
      const { index, queue, repeat } = get();
      if (engine.time > 3) {
        engine.seek(0);
        return;
      }
      const p = prevIndex(index, queue.length, repeat);
      if (p !== null) load(p, true);
    },
    seek: (t) => {
      if (isExt()) {
        const at = performance.now();
        const { ytm, yt } = get();
        if (isYtm() && ytm) set({ ytm: { ...ytm, position: t, at }, position: t });
        else if (!isYtm() && yt) set({ yt: { ...yt, position: t, at }, position: t });
        return control("seek", t);
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
  const external = usePlayer((s) => (s.source === "ytm" ? s.ytmTrack : s.source === "yt" ? s.ytTrack : null));
  const byId = useLibrary((s) => s.byId);
  if (external) return external;
  return id === undefined ? null : (byId.get(id) ?? null);
}
