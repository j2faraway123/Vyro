import { Minimize2, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useEffect } from "react";
import { backend } from "../../lib/backend";
import { formatTime } from "../../lib/format";
import { useCurrentTrack, usePlayer } from "../../store/player";
import { useUi } from "../../store/ui";
import { Artwork, artUrl } from "../common/Artwork";
import { IconButton, Slider } from "../common/controls";
import { LyricsView } from "./LyricsView";

export function FullscreenLyrics() {
  const open = useUi((s) => s.fullscreenLyrics);
  const setOpen = useUi((s) => s.setFullscreenLyrics);
  const track = useCurrentTrack();
  const p = usePlayer();

  useEffect(() => {
    if (!open) return;
    backend().setFullscreen(true).catch(() => {});
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      backend().setFullscreen(false).catch(() => {});
    };
  }, [open, setOpen]);

  if (!open) return null;
  const art = artUrl(track?.artwork);

  return (
    <div role="dialog" aria-modal="true" aria-label="Fullscreen lyrics" className="vy-pop fixed inset-0 z-[80] flex flex-col overflow-hidden bg-bg">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="vy-bg-layer vy-gradient-pan" style={{ background: "linear-gradient(135deg, var(--bg-c1), var(--bg-c2), var(--bg-c3))" }} />
        <div className="vy-blob b1" />
        <div className="vy-blob b2" />
        {art && (
          <div className="vy-art-bg" style={{ backgroundImage: `url("${art}")`, filter: "blur(110px) saturate(1.6)", opacity: 0.45 }} />
        )}
        <div className="vy-bg-layer bg-bg/45" />
      </div>

      <header className="relative z-10 flex items-center gap-4 px-8 pt-6">
        <Artwork src={track?.artwork} className="h-14 w-14 shadow-xl" iconSize={20} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-extrabold text-fg">{track?.title ?? "Nothing playing"}</div>
          <div className="truncate text-sm text-fg-2">{track ? `${track.artist} · ${track.album}` : ""}</div>
        </div>
        <IconButton label="Exit fullscreen lyrics" onClick={() => setOpen(false)}>
          <Minimize2 size={20} />
        </IconButton>
      </header>

      <div className="relative z-10 min-h-0 flex-1">
        <LyricsView track={track} variant="full" />
      </div>

      <footer className="relative z-10 mx-auto flex w-full max-w-2xl flex-col items-center gap-2 px-8 pb-8">
        <div className="flex items-center gap-3">
          <IconButton label="Previous" onClick={p.prev}>
            <SkipBack size={20} fill="currentColor" />
          </IconButton>
          <button
            type="button"
            aria-label={p.playing ? "Pause" : "Play"}
            onClick={p.toggle}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-fg text-bg transition-transform hover:scale-105"
          >
            {p.playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
          </button>
          <IconButton label="Next" onClick={() => p.next()}>
            <SkipForward size={20} fill="currentColor" />
          </IconButton>
        </div>
        <div className="flex w-full items-center gap-3 text-xs text-fg-2 tabular-nums">
          <span className="w-10 text-right">{formatTime(p.position)}</span>
          <Slider label="Seek" value={Math.min(p.position, p.duration || 0)} max={p.duration || 1} step={0.1} onChange={p.seek} />
          <span className="w-10">{formatTime(p.duration)}</span>
        </div>
      </footer>
    </div>
  );
}
