// The YouTube embedded player's postMessage protocol, without YouTube's
// iframe_api script: Vyro never runs remote code in its own window.

export const YT_ORIGIN = "https://www.youtube.com";

/** Player states reported by the embedded player. */
export const YtState = { unstarted: -1, ended: 0, playing: 1, paused: 2, buffering: 3, cued: 5 } as const;

export function embedUrl(videoId: string, origin: string): string {
  const q = new URLSearchParams({
    enablejsapi: "1",
    autoplay: "1",
    playsinline: "1",
    rel: "0",
    origin,
    widget_referrer: origin,
  });
  return `${YT_ORIGIN}/embed/${encodeURIComponent(videoId)}?${q}`;
}

export function command(func: string, args: unknown[] = []): string {
  return JSON.stringify({ event: "command", func, args, id: 1, channel: "widget" });
}

export const listening = () => JSON.stringify({ event: "listening", id: 1, channel: "widget" });

export type YtMessage =
  | { kind: "ready" }
  | { kind: "info"; currentTime?: number; duration?: number; state?: number; videoId?: string }
  | { kind: "state"; state: number }
  | { kind: "error"; code: number };

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** Parses a message from the embedded player; null for anything else. */
export function parseMessage(origin: string, data: unknown): YtMessage | null {
  if (origin !== YT_ORIGIN && origin !== "https://www.youtube-nocookie.com") return null;
  let m: unknown = data;
  if (typeof data === "string") {
    try {
      m = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (!m || typeof m !== "object") return null;
  const { event, info } = m as { event?: unknown; info?: unknown };
  if (event === "onReady") return { kind: "ready" };
  if (event === "onStateChange" && num(info) !== undefined) return { kind: "state", state: info as number };
  if (event === "onError") return { kind: "error", code: num(info) ?? 0 };
  if ((event === "infoDelivery" || event === "initialDelivery") && info && typeof info === "object") {
    const i = info as Record<string, unknown>;
    const vd = i.videoData as Record<string, unknown> | undefined;
    return {
      kind: "info",
      currentTime: num(i.currentTime),
      duration: num(i.duration),
      state: num(i.playerState),
      videoId: typeof vd?.video_id === "string" ? vd.video_id : undefined,
    };
  }
  return null;
}

/** A readable reason for an embedded player error code. */
export function errorText(code: number): string {
  switch (code) {
    case 2:
      return "YouTube couldn't open this video.";
    case 5:
      return "This video can't play in Vyro's player.";
    case 100:
      return "This video was removed or made private.";
    case 101:
    case 150:
      return "The owner doesn't allow this video to play outside YouTube.";
    case 153:
      return "YouTube refused the player on this system.";
    default:
      return `YouTube's player stopped (error ${code}).`;
  }
}

/** Errors that only affect one video, so the queue can move on. */
export const skippable = (code: number) => code === 2 || code === 5 || code === 100 || code === 101 || code === 150;
