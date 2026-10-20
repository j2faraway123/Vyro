import { Expand, Heart, PanelRightClose } from "lucide-react";
import { useRef } from "react";
import { formatBytes, formatTime, relativeTime } from "../../lib/format";
import { albumKey } from "../../lib/library";
import type { Track } from "../../lib/types";
import { useLibrary } from "../../store/library";
import { useCurrentTrack } from "../../store/player";
import { useSettings } from "../../store/settings";
import { useUi } from "../../store/ui";
import { Artwork } from "../common/Artwork";
import { IconButton, Segmented } from "../common/controls";
import { LyricsView } from "../lyrics/LyricsView";
import { QueuePanel } from "../queue/QueuePanel";

function TiltArt({ track }: { track: Track | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const parallax = useSettings((s) => s.settings.background.effects.parallax && !s.settings.background.performanceMode);
  return (
    <div
      ref={ref}
      onPointerMove={(e) => {
        if (!parallax || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        ref.current.style.transform = `perspective(700px) rotateY(${x * 8}deg) rotateX(${-y * 8}deg) scale(1.01)`;
      }}
      onPointerLeave={() => ref.current && (ref.current.style.transform = "")}
      className="transition-transform duration-300 ease-out will-change-transform"
    >
      <Artwork
        key={track?.id ?? "none"}
        src={track?.artwork}
        alt={track ? `${track.album} cover` : ""}
        className="vy-enter aspect-square w-full shadow-[0_24px_60px_-20px_rgba(0,0,0,.75)]"
        iconSize={56}
        rounded="rounded-vy"
      />
    </div>
  );
}

function Details({ track }: { track: Track }) {
  const rows: [string, string | null][] = [
    ["Album", track.album],
    ["Album artist", track.albumArtist],
    ["Year", track.year ? String(track.year) : null],
    ["Genre", track.genre],
    ["Track", track.trackNo ? `${track.trackNo}${track.discNo && track.discNo > 1 ? ` (disc ${track.discNo})` : ""}` : null],
    ["Length", formatTime(track.duration)],
    ["Format", track.format.toUpperCase()],
    ["Bitrate", track.bitrate ? `${track.bitrate} kbps` : null],
    ["Sample rate", track.sampleRate ? `${(track.sampleRate / 1000).toFixed(1)} kHz` : null],
    ["File size", track.fileSize ? formatBytes(track.fileSize) : null],
    ["Plays", String(track.playCount)],
    ["Last played", track.lastPlayed ? relativeTime(track.lastPlayed) : null],
  ];
  return (
    <div className="vy-scroll h-full pr-1">
      <dl className="text-sm">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 border-b border-line py-2">
              <dt className="text-fg-3">{k}</dt>
              <dd className="truncate text-right font-medium text-fg">{v}</dd>
            </div>
          ))}
      </dl>
      {track.palette && (
        <div className="mt-4">
          <div className="mb-2 text-xs font-semibold text-fg-3">Artwork palette</div>
          <div className="flex gap-1.5">
            {track.palette.map((c) => (
              <span key={c} title={c} className="h-6 w-6 rounded-full ring-1 ring-line" style={{ background: c }} />
            ))}
          </div>
        </div>
      )}
      <p className="mt-4 text-[11px] break-all text-fg-3 select-text">{track.path}</p>
    </div>
  );
}

export function NowPlayingPanel() {
  const track = useCurrentTrack();
  const tab = useSettings((s) => s.settings.rightTab);
  const update = useSettings((s) => s.update);
  const favorites = useLibrary((s) => s.favorites);
  const toggleFavorite = useLibrary((s) => s.toggleFavorite);
  const navigate = useUi((s) => s.navigate);
  const setFullscreen = useUi((s) => s.setFullscreenLyrics);
  const fav = track ? favorites.has(track.id) : false;

  return (
    <aside aria-label="Now playing" className="vy-panel flex min-h-0 flex-col overflow-hidden p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-fg">Now playing</h2>
        <div className="flex">
          <IconButton label="Fullscreen lyrics" size="sm" onClick={() => setFullscreen(true)} disabled={!track}>
            <Expand size={16} />
          </IconButton>
          <IconButton label="Hide panel" size="sm" onClick={() => update({ rightPanel: false })}>
            <PanelRightClose size={17} />
          </IconButton>
        </div>
      </div>

      <div className={`${tab === "lyrics" ? "mx-auto w-[62%]" : "mx-auto w-[46%]"} transition-all duration-300`}>
        <TiltArt track={track} />
      </div>

      <div className="mt-4 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {track ? (
            <>
              <button type="button" onClick={() => navigate(track.id < 0 ? { name: "ytm" } : { name: "album", key: albumKey(track) })} className="block max-w-full truncate text-left text-lg leading-tight font-extrabold text-fg hover:underline">
                {track.title}
              </button>
              <button
                type="button"
                onClick={() => navigate(track.id < 0 ? { name: "ytm" } : { name: "artist", artist: track.albumArtist })}
                className="block max-w-full truncate text-left text-sm text-fg-2 hover:text-fg hover:underline"
              >
                {track.artist}
              </button>
            </>
          ) : (
            <p className="text-sm text-fg-3">Nothing playing</p>
          )}
        </div>
        {track && track.id >= 0 && (
          <IconButton label={fav ? "Remove from favorites" : "Add to favorites"} active={fav} onClick={() => toggleFavorite(track.id)}>
            <Heart size={19} fill={fav ? "currentColor" : "none"} />
          </IconButton>
        )}
      </div>

      <div className="mt-4 mb-3">
        <Segmented
          label="Panel view"
          size="sm"
          value={tab}
          onChange={(v) => update({ rightTab: v })}
          options={[
            { value: "lyrics", label: "Lyrics" },
            { value: "queue", label: "Queue" },
            { value: "details", label: "Details" },
          ]}
        />
      </div>

      <div className="min-h-0 flex-1">
        {tab === "lyrics" && <LyricsView track={track} />}
        {tab === "queue" && <QueuePanel />}
        {tab === "details" && (track ? <Details track={track} /> : <p className="text-sm text-fg-3">Nothing playing</p>)}
      </div>
    </aside>
  );
}
