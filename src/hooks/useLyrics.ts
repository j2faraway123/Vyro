import { useCallback, useEffect, useMemo, useState } from "react";
import { backend, errorMessage } from "../lib/backend";
import { parseLrc, type LyricLine } from "../lib/lrc";
import type { Lyrics, Track } from "../lib/types";
import { useSettings } from "../store/settings";

export type LyricsStatus = "idle" | "loading" | "ready" | "error";

const memo = new Map<string, Lyrics>();

/** YouTube Music songs have no library id, so they are keyed by their metadata. */
const keyOf = (t: Track) => (t.id < 0 ? `ytm:${t.title}\u0000${t.artist}\u0000${t.album}` : String(t.id));

export interface LyricsResult {
  status: LyricsStatus;
  lyrics: Lyrics | null;
  lines: LyricLine[];
  plain: string[];
  error: string | null;
  reload: () => void;
}

export function useLyrics(track: Track | null): LyricsResult {
  const online = useSettings((s) => s.settings.onlineLyrics);
  const key = track ? keyOf(track) : null;
  // A YouTube song's duration can arrive a moment after its title.
  const ready = !track || track.id >= 0 || track.duration > 0;
  const [state, setState] = useState<{ id: string | null; status: LyricsStatus; lyrics: Lyrics | null; error: string | null }>({
    id: null,
    status: "idle",
    lyrics: null,
    error: null,
  });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!track || !key) {
      setState({ id: null, status: "idle", lyrics: null, error: null });
      return;
    }
    const cached = nonce === 0 ? memo.get(key) : undefined;
    if (cached) {
      setState({ id: key, status: "ready", lyrics: cached, error: null });
      return;
    }
    let cancelled = false;
    setState({ id: key, status: "loading", lyrics: null, error: null });
    if (!ready) return;
    if (track.id < 0 && !online) {
      setState({ id: key, status: "ready", lyrics: { synced: null, plain: null, instrumental: false, source: "none" }, error: null });
      return;
    }
    const req =
      track.id < 0
        ? backend().lyricsLookup(track.title, track.artist, track.album, track.duration)
        : backend().lyrics(track.id, online, nonce > 0);
    req
      .then((l) => {
        memo.set(key, l);
        if (!cancelled) setState({ id: key, status: "ready", lyrics: l, error: null });
      })
      .catch((e) => {
        if (!cancelled) setState({ id: key, status: "error", lyrics: null, error: errorMessage(e) });
      });
    return () => {
      cancelled = true;
    };
    // The track object changes on every palette update; the key is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready, online, nonce]);

  const lines = useMemo(() => (state.lyrics?.synced ? parseLrc(state.lyrics.synced) : []), [state.lyrics]);
  const plain = useMemo(
    () => (!lines.length && state.lyrics?.plain ? state.lyrics.plain.split(/\r?\n/) : []),
    [lines.length, state.lyrics],
  );
  const reload = useCallback(() => {
    if (key) memo.delete(key);
    setNonce((n) => n + 1);
  }, [key]);

  return { status: state.status, lyrics: state.lyrics, lines, plain, error: state.error, reload };
}
