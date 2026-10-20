import { useEffect } from "react";
import { artUrl } from "../components/common/Artwork";
import { usePlayer, useCurrentTrack } from "../store/player";

/**
 * Publishes now-playing metadata to the OS media controls (on Windows,
 * WebView2 forwards the Media Session API to the system media overlay and
 * hardware media keys).
 */
export function useMediaSession() {
  const track = useCurrentTrack();
  const playing = usePlayer((s) => s.playing);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    if (!track) {
      ms.metadata = null;
      return;
    }
    const art = artUrl(track.artwork);
    ms.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album,
      artwork: art ? [{ src: art, sizes: "512x512" }] : [],
    });
  }, [track]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = playing ? "playing" : "paused";
  }, [playing]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    const p = () => usePlayer.getState();
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", () => p().play()],
      ["pause", () => p().pause()],
      ["nexttrack", () => p().next()],
      ["previoustrack", () => p().prev()],
      ["seekto", (d) => d.seekTime !== undefined && p().seek(d.seekTime)],
      ["seekforward", () => p().seekBy(10)],
      ["seekbackward", () => p().seekBy(-10)],
    ];
    for (const [a, h] of handlers) {
      try {
        ms.setActionHandler(a, h);
      } catch {
        /* action unsupported */
      }
    }
    return () => handlers.forEach(([a]) => {
      try {
        ms.setActionHandler(a, null);
      } catch {
        /* ignore */
      }
    });
  }, []);
}
