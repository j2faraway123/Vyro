import { useCallback, useEffect, useMemo, useState } from "react";
import { backend, errorMessage } from "../lib/backend";
import { parseLrc, type LyricLine } from "../lib/lrc";
import type { Lyrics, Track } from "../lib/types";
import { useSettings } from "../store/settings";

export type LyricsStatus = "idle" | "loading" | "ready" | "error";

const memo = new Map<number, Lyrics>();

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
  const [state, setState] = useState<{ id: number | null; status: LyricsStatus; lyrics: Lyrics | null; error: string | null }>({
    id: null,
    status: "idle",
    lyrics: null,
    error: null,
  });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!track) {
      setState({ id: null, status: "idle", lyrics: null, error: null });
      return;
    }
    const cached = nonce === 0 ? memo.get(track.id) : undefined;
    if (cached) {
      setState({ id: track.id, status: "ready", lyrics: cached, error: null });
      return;
    }
    let cancelled = false;
    setState({ id: track.id, status: "loading", lyrics: null, error: null });
    backend()
      .lyrics(track.id, online, nonce > 0)
      .then((l) => {
        memo.set(track.id, l);
        if (!cancelled) setState({ id: track.id, status: "ready", lyrics: l, error: null });
      })
      .catch((e) => {
        if (!cancelled) setState({ id: track.id, status: "error", lyrics: null, error: errorMessage(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [track, online, nonce]);

  const lines = useMemo(() => (state.lyrics?.synced ? parseLrc(state.lyrics.synced) : []), [state.lyrics]);
  const plain = useMemo(
    () => (!lines.length && state.lyrics?.plain ? state.lyrics.plain.split(/\r?\n/) : []),
    [lines.length, state.lyrics],
  );
  const reload = useCallback(() => {
    if (track) memo.delete(track.id);
    setNonce((n) => n + 1);
  }, [track]);

  return { status: state.status, lyrics: state.lyrics, lines, plain, error: state.error, reload };
}
