import { create } from "zustand";
import { backend } from "../lib/backend";
import { nextIndex, prevIndex, shuffled } from "../lib/queue";
import type { Track, YtItem } from "../lib/types";
import { command, embedUrl, errorText, listening, parseMessage, skippable, YT_ORIGIN, YtState } from "../lib/yt-embed";
import { registerYouTubeControl, usePlayer, YT_TRACK_ID, type ExternalAction } from "./player";
import { toast, useUi } from "./ui";

// YouTube videos play in YouTube's own embedded player, shown in the
// now-playing panel (or floating in a corner when the panel is hidden).
// YouTube's terms require the player to stay visible and at least 200×200.

interface YouTubeState {
  queue: YtItem[];
  index: number;
  /** Where the queue came from, such as a search or a playlist title. */
  context: string | null;
  playItems: (items: YtItem[], start?: number, context?: string) => void;
  playAt: (index: number) => void;
  next: (auto?: boolean) => void;
  prev: () => void;
  addToQueue: (items: YtItem[]) => void;
  removeFromQueue: (index: number) => void;
  /** Stops the player and clears the YouTube queue. */
  close: () => void;
}

export function ytTrack(item: YtItem, palette: string[] | null): Track {
  return {
    id: YT_TRACK_ID,
    path: `https://www.youtube.com/watch?v=${item.videoId}`,
    title: item.title,
    artist: item.artist,
    album: "",
    albumArtist: item.artist,
    trackNo: null,
    discNo: null,
    year: null,
    genre: null,
    duration: item.duration,
    format: "YouTube",
    bitrate: null,
    sampleRate: null,
    artwork: item.thumbnail,
    palette,
    fileSize: 0,
    mtime: 0,
    addedAt: 0,
    playCount: 0,
    lastPlayed: null,
  };
}

// --- The embedded player -------------------------------------------------

const MIN = 200;
const FLOAT_W = 356;
const FLOAT_H = 200;

let frame: HTMLIFrameElement | null = null;
let ready = false;
let loadedId: string | null = null;
let handshake: ReturnType<typeof setInterval> | null = null;
let placing = 0;
let consecutiveErrors = 0;
const live = { state: YtState.unstarted as number, time: 0, duration: 0 };
const palettes = new Map<string, string[]>();
let lastTrack: { item: YtItem; track: Track } | null = null;

function post(msg: string) {
  frame?.contentWindow?.postMessage(msg, YT_ORIGIN);
}

function current(): YtItem | null {
  const { queue, index } = useYouTube.getState();
  return queue[index] ?? null;
}

function report(activate = false) {
  const item = current();
  if (!item) return;
  const palette = item.thumbnail ? (palettes.get(item.thumbnail) ?? null) : null;
  // Keep the same track object while nothing about it changes.
  if (!lastTrack || lastTrack.item !== item || lastTrack.track.palette !== palette) lastTrack = { item, track: ytTrack(item, palette) };
  usePlayer.getState().setYt(
    {
      track: lastTrack.track,
      playing: live.state === YtState.playing || live.state === YtState.buffering,
      position: live.time,
      duration: live.duration || item.duration,
    },
    activate,
  );
}

function fetchPalette(item: YtItem) {
  const art = item.thumbnail;
  if (!art || palettes.has(art)) return;
  backend()
    .ytmPalette(art)
    .then((p) => {
      palettes.set(art, p);
      if (current()?.thumbnail === art) report();
    })
    .catch(() => {});
}

function syncVolume() {
  const { volume, muted } = usePlayer.getState();
  post(command("setVolume", [Math.round(volume * 100)]));
  post(command(muted ? "mute" : "unMute"));
}

function onMessage(e: MessageEvent) {
  if (!frame || e.source !== frame.contentWindow) return;
  const m = parseMessage(e.origin, e.data);
  if (!m) return;
  if (!ready) {
    ready = true;
    if (handshake) clearInterval(handshake);
    handshake = null;
    for (const ev of ["onReady", "onStateChange", "onError"]) post(command("addEventListener", [ev]));
    syncVolume();
  }
  if (m.kind === "ready") return syncVolume();
  if (m.kind === "error") return onError(m.code);
  if (m.kind === "info" && m.videoId && m.videoId !== loadedId) return;
  const before = live.state;
  if (m.kind === "state") live.state = m.state;
  if (m.kind === "info") {
    if (m.state !== undefined) live.state = m.state;
    if (m.currentTime !== undefined) live.time = m.currentTime;
    if (m.duration !== undefined && m.duration > 0) live.duration = m.duration;
  }
  if (live.state === YtState.playing) consecutiveErrors = 0;
  // Only the active player reports.
  if (usePlayer.getState().source === "yt") report();
  if (live.state === YtState.ended && before !== YtState.ended && usePlayer.getState().source === "yt") useYouTube.getState().next(true);
}

function onError(code: number) {
  const item = current();
  live.state = YtState.unstarted;
  report();
  toast(`${item ? `${item.title}: ` : ""}${errorText(code)}`, "error");
  consecutiveErrors += 1;
  const { index, queue } = useYouTube.getState();
  if (skippable(code) && consecutiveErrors < 3 && index + 1 < queue.length) {
    setTimeout(() => useYouTube.getState().next(false), 800);
  }
}

function ensureFrame(): HTMLIFrameElement {
  if (frame) return frame;
  const f = document.createElement("iframe");
  f.title = "YouTube video player";
  f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
  f.referrerPolicy = "strict-origin-when-cross-origin";
  f.setAttribute("data-yt-player", "");
  Object.assign(f.style, {
    position: "fixed",
    border: "0",
    zIndex: "70",
    borderRadius: "var(--vy-radius, 14px)",
    background: "#000",
    boxShadow: "0 18px 50px -18px rgba(0,0,0,.8)",
    visibility: "hidden",
  });
  f.addEventListener("load", () => {
    ready = false;
    if (handshake) clearInterval(handshake);
    let tries = 0;
    handshake = setInterval(() => {
      if (ready || ++tries > 60) {
        if (handshake) clearInterval(handshake);
        handshake = null;
        return;
      }
      post(listening());
    }, 250);
  });
  document.body.appendChild(f);
  window.addEventListener("message", onMessage);
  usePlayer.subscribe((s, p) => {
    if (s.volume !== p.volume || s.muted !== p.muted) syncVolume();
  });
  frame = f;
  startPlacing();
  return f;
}

/** Keeps the player over the now-playing slot, or floating in a corner. */
function startPlacing() {
  if (placing) return;
  const tick = () => {
    placing = requestAnimationFrame(tick);
    if (!frame) return;
    const active = usePlayer.getState().source === "yt" && !!current();
    if (!active) {
      frame.style.visibility = "hidden";
      frame.style.width = frame.style.height = "1px";
      return;
    }
    const fullscreen = useUi.getState().fullscreenLyrics;
    // Above the fullscreen lyrics overlay (z 80), so the player stays visible.
    const z = fullscreen ? "90" : "70";
    if (frame.style.zIndex !== z) frame.style.zIndex = z;
    const slot = fullscreen ? null : document.querySelector<HTMLElement>("[data-yt-slot]");
    const r = slot?.getBoundingClientRect();
    let x: number, y: number, w: number, h: number;
    if (r && r.width >= MIN && r.height >= MIN - 1) {
      [x, y, w, h] = [r.left, r.top, r.width, r.height];
    } else {
      const bar = document.querySelector<HTMLElement>("footer[aria-label='Playback']")?.getBoundingClientRect();
      w = FLOAT_W;
      h = FLOAT_H;
      x = window.innerWidth - w - 20;
      y = (bar ? bar.top : window.innerHeight) - h - 16;
    }
    const s = frame.style;
    const px = (n: number) => `${Math.round(n)}px`;
    if (s.left !== px(x)) s.left = px(x);
    if (s.top !== px(y)) s.top = px(y);
    if (s.width !== px(w)) s.width = px(w);
    if (s.height !== px(h)) s.height = px(h);
    s.visibility = "visible";
  };
  placing = requestAnimationFrame(tick);
}

function load(item: YtItem) {
  const f = ensureFrame();
  live.state = YtState.unstarted;
  live.time = 0;
  live.duration = item.duration;
  fetchPalette(item);
  if (ready && loadedId) post(command("loadVideoById", [item.videoId, 0]));
  else f.src = embedUrl(item.videoId, window.location.origin);
  loadedId = item.videoId;
  report(true);
}

function control(action: ExternalAction, value?: number) {
  const yt = useYouTube.getState();
  switch (action) {
    case "toggle":
      return control(live.state === YtState.playing || live.state === YtState.buffering ? "pause" : "play");
    case "play": {
      const item = current();
      if (!item) return;
      if (!frame || loadedId !== item.videoId) return load(item);
      if (live.state === YtState.ended) post(command("seekTo", [0, true]));
      return post(command("playVideo"));
    }
    case "pause":
      return post(command("pauseVideo"));
    case "next":
      return yt.next(false);
    case "prev":
      if (live.time > 3) return post(command("seekTo", [0, true]));
      return yt.prev();
    case "seek":
      live.time = value ?? 0;
      return post(command("seekTo", [value ?? 0, true]));
  }
}

registerYouTubeControl(control);

// --- The YouTube queue ---------------------------------------------------

export const useYouTube = create<YouTubeState>((set, get) => ({
  queue: [],
  index: -1,
  context: null,
  playItems: (items, start = 0, context) => {
    if (!items.length) return;
    let queue = items.slice();
    let index = Math.max(0, Math.min(start, items.length - 1));
    if (usePlayer.getState().shuffle && items.length > 1) {
      const first = queue[index];
      queue = [first, ...shuffled(queue.filter((_, i) => i !== index))];
      index = 0;
    }
    consecutiveErrors = 0;
    set({ queue, index, context: context ?? null });
    load(queue[index]);
  },
  playAt: (index) => {
    const item = get().queue[index];
    if (!item) return;
    set({ index });
    load(item);
  },
  next: (auto = false) => {
    const { index, queue } = get();
    const n = nextIndex(index, queue.length, usePlayer.getState().repeat, auto);
    if (n === null) {
      post(command("pauseVideo"));
      return;
    }
    if (n === index) {
      post(command("seekTo", [0, true]));
      post(command("playVideo"));
      return;
    }
    get().playAt(n);
  },
  prev: () => {
    const { index, queue } = get();
    const p = prevIndex(index, queue.length, usePlayer.getState().repeat);
    if (p !== null && p !== index) get().playAt(p);
    else post(command("seekTo", [0, true]));
  },
  addToQueue: (items) => {
    if (!items.length) return;
    const wasEmpty = get().queue.length === 0;
    set((s) => ({ queue: [...s.queue, ...items] }));
    toast(items.length === 1 ? "Added to the YouTube queue" : `Added ${items.length} videos to the YouTube queue`, "success");
    if (wasEmpty) get().playAt(0);
  },
  removeFromQueue: (i) => {
    const { queue, index } = get();
    if (i < 0 || i >= queue.length || i === index) return;
    set({ queue: queue.filter((_, k) => k !== i), index: i < index ? index - 1 : index });
  },
  close: () => {
    post(command("stopVideo"));
    if (frame) frame.src = "about:blank";
    ready = false;
    loadedId = null;
    set({ queue: [], index: -1, context: null });
    usePlayer.getState().setYt(null);
  },
}));
