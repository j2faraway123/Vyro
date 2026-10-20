import {
  Expand,
  Heart,
  ListMusic,
  Loader2,
  MicVocal,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useState } from "react";
import { formatTime } from "../../lib/format";
import { albumKey } from "../../lib/library";
import { useLibrary } from "../../store/library";
import { useCurrentTrack, usePlayer } from "../../store/player";
import { useSettings } from "../../store/settings";
import { useUi } from "../../store/ui";
import { Artwork } from "../common/Artwork";
import { IconButton, Slider } from "../common/controls";

function Progress() {
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration);
  const seek = usePlayer((s) => s.seek);
  const hasTrack = usePlayer((s) => s.index >= 0);
  const [drag, setDrag] = useState<number | null>(null);
  const shown = drag ?? position;
  return (
    <div className="flex w-full items-center gap-3 text-xs text-fg-3 tabular-nums">
      <span className="w-10 text-right">{formatTime(shown)}</span>
      <Slider
        label="Seek"
        value={Math.min(shown, duration || 0)}
        min={0}
        max={duration || 1}
        step={0.1}
        disabled={!hasTrack}
        format={(v) => `${formatTime(v)} of ${formatTime(duration)}`}
        onChange={(v) => setDrag(v)}
        onCommit={(v) => {
          seek(v);
          setDrag(null);
        }}
      />
      <span className="w-10">{formatTime(duration)}</span>
    </div>
  );
}

export function PlaybackBar() {
  const track = useCurrentTrack();
  const p = usePlayer();
  const favorites = useLibrary((s) => s.favorites);
  const toggleFavorite = useLibrary((s) => s.toggleFavorite);
  const navigate = useUi((s) => s.navigate);
  const setFullscreenLyrics = useUi((s) => s.setFullscreenLyrics);
  const { rightPanel, rightTab } = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  const fav = track ? favorites.has(track.id) : false;
  const VolIcon = p.muted || p.volume === 0 ? VolumeX : p.volume < 0.33 ? Volume : p.volume < 0.7 ? Volume1 : Volume2;
  const openTab = (tab: "lyrics" | "queue") => update(rightPanel && rightTab === tab ? { rightPanel: false } : { rightPanel: true, rightTab: tab });

  return (
    <footer aria-label="Playback" className="vy-panel grid h-[88px] grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] items-center gap-4 px-4">
      {/* Now playing */}
      <div className="flex min-w-0 items-center gap-3">
        {track ? (
          <>
            <button type="button" onClick={() => navigate({ name: "album", key: albumKey(track) })} aria-label={`Go to ${track.album}`} className="shrink-0">
              <Artwork src={track.artwork} className="h-14 w-14 shadow-lg" iconSize={20} />
            </button>
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-fg">{track.title}</div>
              <button
                type="button"
                onClick={() => navigate({ name: "artist", artist: track.albumArtist })}
                className="block max-w-full truncate text-left text-xs text-fg-2 hover:text-fg hover:underline"
              >
                {track.artist}
              </button>
            </div>
            <IconButton label={fav ? "Remove from favorites" : "Add to favorites"} active={fav} size="sm" onClick={() => toggleFavorite(track.id)}>
              <Heart size={17} fill={fav ? "currentColor" : "none"} />
            </IconButton>
          </>
        ) : (
          <div className="text-sm text-fg-3">Nothing playing</div>
        )}
      </div>

      {/* Transport */}
      <div className="flex min-w-0 flex-col items-center gap-1">
        <div className="flex items-center gap-2">
          <IconButton label={p.shuffle ? "Shuffle on" : "Shuffle off"} active={p.shuffle} size="sm" onClick={p.toggleShuffle}>
            <Shuffle size={17} />
          </IconButton>
          <IconButton label="Previous" onClick={p.prev} disabled={p.index < 0}>
            <SkipBack size={19} fill="currentColor" />
          </IconButton>
          <button
            type="button"
            aria-label={p.playing ? "Pause" : "Play"}
            onClick={p.toggle}
            disabled={!p.queue.length}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-fg text-bg shadow-md transition-transform duration-150 hover:scale-105 active:scale-95 disabled:opacity-40"
          >
            {p.loading && p.playing ? (
              <Loader2 size={18} className="animate-spin" />
            ) : p.playing ? (
              <Pause size={18} fill="currentColor" />
            ) : (
              <Play size={18} fill="currentColor" className="ml-0.5" />
            )}
          </button>
          <IconButton label="Next" onClick={() => p.next()} disabled={p.index < 0}>
            <SkipForward size={19} fill="currentColor" />
          </IconButton>
          <IconButton
            label={p.repeat === "off" ? "Repeat off" : p.repeat === "all" ? "Repeat all" : "Repeat one"}
            active={p.repeat !== "off"}
            size="sm"
            onClick={p.cycleRepeat}
          >
            {p.repeat === "one" ? <Repeat1 size={17} /> : <Repeat size={17} />}
          </IconButton>
        </div>
        <Progress />
      </div>

      {/* Extras */}
      <div className="flex items-center justify-end gap-1">
        <IconButton label="Lyrics" active={rightPanel && rightTab === "lyrics"} size="sm" onClick={() => openTab("lyrics")}>
          <MicVocal size={17} />
        </IconButton>
        <IconButton label="Queue" active={rightPanel && rightTab === "queue"} size="sm" onClick={() => openTab("queue")}>
          <ListMusic size={17} />
        </IconButton>
        <IconButton label={p.muted ? "Unmute" : "Mute"} size="sm" onClick={p.toggleMute}>
          <VolIcon size={17} />
        </IconButton>
        <div className="w-28">
          <Slider label="Volume" value={p.muted ? 0 : p.volume} onChange={p.setVolume} format={(v) => `${Math.round(v * 100)}%`} />
        </div>
        <IconButton label="Fullscreen lyrics" size="sm" onClick={() => setFullscreenLyrics(true)} disabled={!track}>
          <Expand size={16} />
        </IconButton>
      </div>
    </footer>
  );
}
