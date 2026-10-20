import { describe, expect, it } from "vitest";
import { command, embedUrl, errorText, parseMessage, skippable, YT_ORIGIN } from "../yt-embed";

describe("yt-embed", () => {
  it("builds an embed URL with the JS API enabled for our origin", () => {
    const u = new URL(embedUrl("dQw4w9WgXcQ", "http://tauri.localhost"));
    expect(u.origin).toBe(YT_ORIGIN);
    expect(u.pathname).toBe("/embed/dQw4w9WgXcQ");
    expect(u.searchParams.get("enablejsapi")).toBe("1");
    expect(u.searchParams.get("origin")).toBe("http://tauri.localhost");
  });

  it("encodes commands like YouTube's iframe API does", () => {
    expect(JSON.parse(command("seekTo", [12, true]))).toEqual({ event: "command", func: "seekTo", args: [12, true], id: 1, channel: "widget" });
  });

  it("ignores messages from other origins and junk", () => {
    expect(parseMessage("https://evil.example", JSON.stringify({ event: "onReady" }))).toBeNull();
    expect(parseMessage(YT_ORIGIN, "not json")).toBeNull();
    expect(parseMessage(YT_ORIGIN, JSON.stringify({ event: "somethingElse" }))).toBeNull();
  });

  it("parses player state, info and errors", () => {
    expect(parseMessage(YT_ORIGIN, JSON.stringify({ event: "onReady" }))).toEqual({ kind: "ready" });
    expect(parseMessage(YT_ORIGIN, JSON.stringify({ event: "onStateChange", info: 1 }))).toEqual({ kind: "state", state: 1 });
    expect(parseMessage(YT_ORIGIN, JSON.stringify({ event: "onError", info: 150 }))).toEqual({ kind: "error", code: 150 });
    expect(
      parseMessage(YT_ORIGIN, JSON.stringify({ event: "infoDelivery", info: { currentTime: 3.5, duration: 200, playerState: 2, videoData: { video_id: "abc" } } })),
    ).toEqual({ kind: "info", currentTime: 3.5, duration: 200, state: 2, videoId: "abc" });
    expect(parseMessage(YT_ORIGIN, JSON.stringify({ event: "infoDelivery", info: { volume: 50 } }))).toEqual({
      kind: "info",
      currentTime: undefined,
      duration: undefined,
      state: undefined,
      videoId: undefined,
    });
  });

  it("explains errors and knows which ones to skip", () => {
    expect(errorText(150)).toMatch(/outside YouTube/);
    expect(skippable(101)).toBe(true);
    expect(skippable(153)).toBe(false);
  });
});
