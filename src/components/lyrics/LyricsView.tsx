import { MicVocal, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLyrics } from "../../hooks/useLyrics";
import { activeLineIndex } from "../../lib/lrc";
import type { Track } from "../../lib/types";
import { playerTime, usePlayer } from "../../store/player";
import { useSettings } from "../../store/settings";
import { useUi } from "../../store/ui";
import { Button } from "../common/controls";

const SOURCE_LABEL: Record<string, string> = {
  sidecar: "From a .lrc file next to the track",
  embedded: "From the file's tags",
  lrclib: "Lyrics from LRCLIB",
};

export function LyricsView({ track, variant = "panel" }: { track: Track | null; variant?: "panel" | "full" }) {
  const { status, lyrics, lines, plain, error, reload } = useLyrics(track);
  const offset = useSettings((s) => s.settings.lyricsOffset);
  const size = useSettings((s) => s.settings.lyricsSize);
  const online = useSettings((s) => s.settings.onlineLyrics);
  const navigate = useUi((s) => s.navigate);
  const seek = usePlayer((s) => s.seek);
  const play = usePlayer((s) => s.play);
  const [active, setActive] = useState(-1);
  const [follow, setFollow] = useState(true);
  const box = useRef<HTMLDivElement>(null);
  const resumeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Track the active line with rAF for tight sync, re-rendering only on change.
  useEffect(() => {
    if (!lines.length) return;
    let raf = 0;
    let last = -2;
    const tick = () => {
      const i = activeLineIndex(lines, playerTime() + offset + 0.15);
      if (i !== last) {
        last = i;
        setActive(i);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [lines, offset]);

  useEffect(() => {
    setFollow(true);
    setActive(-1);
    box.current?.scrollTo({ top: 0 });
  }, [track?.id, track?.title]);

  useEffect(() => {
    if (!follow || !box.current || active < 0) return;
    const el = box.current.querySelector<HTMLElement>(`[data-line="${active}"]`);
    if (!el) return;
    const top = el.offsetTop - box.current.clientHeight * 0.38;
    box.current.scrollTo({ top, behavior: "smooth" });
  }, [active, follow]);

  const pauseFollow = () => {
    if (!lines.length) return;
    setFollow(false);
    clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => setFollow(true), 5000);
  };

  const big = variant === "full";
  const textSize = big ? `calc(${size} * clamp(1.75rem, 3.2vw, 3rem))` : `calc(${size} * 1.35rem)`;

  if (!track)
    return (
      <Centered>
        <MicVocal size={28} className="mb-3 text-fg-3" />
        <p className="text-sm text-fg-2">Play something to see its lyrics here.</p>
      </Centered>
    );

  if (status === "loading" || status === "idle")
    return (
      <div className="space-y-4 p-2" aria-busy="true" aria-label="Loading lyrics">
        {[70, 90, 55, 80, 65].map((w, i) => (
          <div key={i} className="vy-skeleton h-6 rounded-md" style={{ width: `${w}%` }} />
        ))}
      </div>
    );

  if (status === "error")
    return (
      <Centered>
        <p className="mb-1 text-sm font-semibold text-fg">Couldn't load lyrics</p>
        <p className="mb-4 max-w-xs text-xs text-fg-2">{error}</p>
        <Button icon={<RefreshCw size={14} />} onClick={reload}>
          Try again
        </Button>
      </Centered>
    );

  if (lyrics?.instrumental)
    return (
      <Centered>
        <MicVocal size={28} className="mb-3 text-fg-3" />
        <p className="font-semibold text-fg">Instrumental</p>
        <p className="mt-1 text-xs text-fg-2">This track has no vocals.</p>
      </Centered>
    );

  if (!lines.length && !plain.length)
    return (
      <Centered>
        <MicVocal size={28} className="mb-3 text-fg-3" />
        <p className="font-semibold text-fg">No lyrics available</p>
        <p className="mt-1 max-w-xs text-xs leading-relaxed text-fg-2">
          {online
            ? "LRCLIB doesn't have lyrics for this track. You can add a .lrc file with the same name next to the audio file."
            : "Online lyrics are off. Add a .lrc file next to the audio file, or turn on online lyrics."}
        </p>
        <div className="mt-4 flex gap-2">
          {!online && (
            <Button onClick={() => navigate({ name: "settings", section: "lyrics" })} variant="secondary">
              Lyrics settings
            </Button>
          )}
          {online && (
            <Button icon={<RefreshCw size={14} />} onClick={reload} variant="ghost">
              Search again
            </Button>
          )}
        </div>
      </Centered>
    );

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div
        ref={box}
        onWheel={pauseFollow}
        onTouchMove={pauseFollow}
        className={`vy-scroll vy-lyrics-mask relative min-h-0 flex-1 ${big ? "px-[8vw] py-[30vh]" : "px-1 py-[38%]"}`}
        aria-live="off"
      >
        {lines.length ? (
          lines.map((l, i) => (
            <button
              key={i}
              type="button"
              data-line={i}
              onClick={() => {
                seek(Math.max(0, l.time - offset));
                play();
                setFollow(true);
              }}
              aria-current={i === active ? "true" : undefined}
              className={`vy-lyric block w-full py-1.5 text-left leading-tight font-extrabold tracking-tight ${
                i === active ? "active" : i < active ? "past text-fg" : "future text-fg"
              } hover:opacity-90`}
              style={{ fontSize: textSize }}
            >
              {l.text || "♪"}
            </button>
          ))
        ) : (
          <div className="space-y-2">
            <p className="mb-4 text-xs font-semibold tracking-wide text-fg-3 uppercase">Not synced</p>
            {plain.map((l, i) => (
              <p key={i} className="leading-snug font-bold text-fg/85" style={{ fontSize: `calc(${textSize} * 0.8)` }}>
                {l || " "}
              </p>
            ))}
          </div>
        )}
      </div>
      {!follow && lines.length > 0 && (
        <button
          type="button"
          onClick={() => setFollow(true)}
          className="vy-pop absolute bottom-10 left-1/2 -translate-x-1/2 rounded-full bg-fg px-4 py-1.5 text-xs font-bold text-bg shadow-lg"
        >
          Back to current line
        </button>
      )}
      <p className={`shrink-0 pt-2 text-[11px] text-fg-3 ${big ? "px-[8vw] pb-6" : ""}`}>{SOURCE_LABEL[lyrics?.source ?? ""] ?? ""}</p>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full flex-col items-center justify-center px-6 text-center">{children}</div>;
}
