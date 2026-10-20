/**
 * Thin wrapper around a single HTMLAudioElement. Playback uses the WebView's
 * own decoders (WebView2/Chromium on Windows: MP3, FLAC, WAV, AAC/M4A, Ogg
 * Vorbis, Opus; ALAC in M4A is not supported by Chromium). Local files are
 * served through Tauri's asset protocol, which supports range requests, so
 * seeking works without loading whole files.
 */
export type EngineEvent = "play" | "pause" | "ended" | "time" | "duration" | "error" | "loading" | "canplay";

async function readAsBlobUrl(src: string): Promise<string> {
  const res = await fetch(src);
  if (!res.ok) throw new Error(res.status === 403 ? "not in an allowed folder" : `HTTP ${res.status}`);
  return URL.createObjectURL(await res.blob());
}

class AudioEngine {
  readonly el: HTMLAudioElement;
  private handlers = new Map<EngineEvent, Set<(detail?: unknown) => void>>();
  private loadToken = 0;
  private blobUrl: string | null = null;
  private ready: Promise<void> = Promise.resolve();

  constructor() {
    this.el = new Audio();
    this.el.preload = "auto";
    const e = this.el;
    e.addEventListener("play", () => this.emit("play"));
    e.addEventListener("pause", () => this.emit("pause"));
    e.addEventListener("ended", () => this.emit("ended"));
    e.addEventListener("timeupdate", () => this.emit("time"));
    e.addEventListener("durationchange", () => this.emit("duration"));
    e.addEventListener("waiting", () => this.emit("loading"));
    e.addEventListener("canplay", () => this.emit("canplay"));
    e.addEventListener("error", () => this.emit("error", describeError(e.error)));
  }

  on(ev: EngineEvent, fn: (detail?: unknown) => void): () => void {
    if (!this.handlers.has(ev)) this.handlers.set(ev, new Set());
    this.handlers.get(ev)!.add(fn);
    return () => this.handlers.get(ev)?.delete(fn);
  }

  private emit(ev: EngineEvent, detail?: unknown) {
    this.handlers.get(ev)?.forEach((fn) => fn(detail));
  }

  load(src: string, startAt = 0) {
    const token = ++this.loadToken;
    if (!src.startsWith("asset:")) {
      this.ready = Promise.resolve();
      this.setSource(src, startAt);
      return;
    }
    this.el.pause();
    this.emit("loading");
    this.ready = readAsBlobUrl(src).then(
      (url) => {
        if (token !== this.loadToken) return URL.revokeObjectURL(url);
        this.setSource(url, startAt);
        this.blobUrl = url;
      },
      (e) => {
        if (token === this.loadToken) this.emit("error", `This file can't be read (${e instanceof Error ? e.message : String(e)})`);
      },
    );
  }

  private releaseBlob() {
    if (this.blobUrl) URL.revokeObjectURL(this.blobUrl);
    this.blobUrl = null;
  }

  private setSource(src: string, startAt: number) {
    this.releaseBlob();
    this.el.src = src;
    if (startAt > 0) {
      const seek = () => {
        this.el.currentTime = startAt;
        this.el.removeEventListener("loadedmetadata", seek);
      };
      this.el.addEventListener("loadedmetadata", seek);
    }
    this.el.load();
  }

  async play(): Promise<void> {
    const token = this.loadToken;
    await this.ready;
    if (token !== this.loadToken) return;
    try {
      await this.el.play();
    } catch (e) {
      // AbortError happens when a new src interrupts play(); not a real failure.
      if ((e as DOMException)?.name !== "AbortError") throw e;
    }
  }

  pause() {
    this.el.pause();
  }

  stop() {
    this.loadToken++;
    this.el.pause();
    this.el.removeAttribute("src");
    this.el.load();
    this.releaseBlob();
  }

  get time() {
    return this.el.currentTime || 0;
  }

  get duration() {
    return Number.isFinite(this.el.duration) ? this.el.duration : 0;
  }

  get paused() {
    return this.el.paused;
  }

  seek(t: number) {
    if (!Number.isFinite(t)) return;
    this.el.currentTime = Math.max(0, Math.min(t, this.duration || t));
  }

  setVolume(v: number, muted: boolean) {
    // Perceptual curve: slider position squared.
    this.el.volume = Math.max(0, Math.min(1, v * v));
    this.el.muted = muted;
  }
}

function describeError(err: MediaError | null): string {
  switch (err?.code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return "Playback was aborted";
    case MediaError.MEDIA_ERR_NETWORK:
      return "The file could not be read (was it moved or deleted?)";
    case MediaError.MEDIA_ERR_DECODE:
      return "The file is damaged or uses an unsupported codec";
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return "This file can't be played (missing, moved, or an unsupported format)";
    default:
      return "Playback failed";
  }
}

export const engine = new AudioEngine();
