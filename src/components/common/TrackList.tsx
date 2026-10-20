import { useVirtualizer } from "@tanstack/react-virtual";
import { Clock3, Heart, MoreHorizontal, Play } from "lucide-react";
import { createContext, useContext, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { formatTime, relativeTime } from "../../lib/format";
import type { Track } from "../../lib/types";
import { useLibrary } from "../../store/library";
import { usePlayer } from "../../store/player";
import { useUi } from "../../store/ui";
import { albumKey } from "../../lib/library";
import { Artwork } from "./Artwork";
import { Equalizer } from "./controls";

/** The main content scroller, so long lists can virtualize against it. */
export const ScrollContext = createContext<HTMLElement | null>(null);

interface Props {
  tracks: Track[];
  /** Label for "Playing from …" in the queue. */
  context: string;
  showAlbum?: boolean;
  showArt?: boolean;
  showAdded?: boolean;
  /** Extra column, e.g. "played 2 hr ago". */
  meta?: (t: Track, index: number) => string;
  playlistId?: number;
  numbered?: boolean;
  onReorder?: (from: number, to: number) => void;
}

export function TrackList({ tracks, context, showAlbum = true, showArt = true, showAdded, meta, playlistId, numbered = true, onReorder }: Props) {
  const scroller = useContext(ScrollContext);
  const listRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [anchor, setAnchor] = useState<number | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const favorites = useLibrary((s) => s.favorites);
  const toggleFavorite = useLibrary((s) => s.toggleFavorite);
  const currentId = usePlayer((s) => s.queue[s.index]);
  const playing = usePlayer((s) => s.playing && s.source === "local");
  const playTracks = usePlayer((s) => s.playTracks);
  const openMenu = useUi((s) => s.openTrackMenu);
  const navigate = useUi((s) => s.navigate);

  useLayoutEffect(() => {
    if (!listRef.current || !scroller) return;
    const update = () => {
      const a = listRef.current!.getBoundingClientRect().top;
      const b = scroller.getBoundingClientRect().top;
      setOffset(a - b + scroller.scrollTop);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(scroller);
    return () => ro.disconnect();
  }, [scroller]);

  const rowHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--vy-row")) || 56;
  const virtualizer = useVirtualizer({
    count: tracks.length,
    getScrollElement: () => scroller,
    estimateSize: () => rowHeight,
    overscan: 12,
    scrollMargin: offset,
  });

  const ids = tracks.map((t) => t.id);
  const play = (i: number) => playTracks(ids, i, context);

  const onRowClick = (e: MouseEvent, i: number) => {
    const id = tracks[i].id;
    if (e.shiftKey && anchor !== null) {
      const [a, b] = [Math.min(anchor, i), Math.max(anchor, i)];
      setSelected(new Set(ids.slice(a, b + 1)));
    } else if (e.ctrlKey || e.metaKey) {
      const next = new Set(selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSelected(next);
      setAnchor(i);
    } else {
      setSelected(new Set([id]));
      setAnchor(i);
    }
  };

  const onMenu = (e: MouseEvent, i: number) => {
    e.preventDefault();
    e.stopPropagation();
    const id = tracks[i].id;
    const sel = selected.has(id) ? ids.filter((x) => selected.has(x)) : [id];
    if (!selected.has(id)) setSelected(new Set([id]));
    openMenu({ x: e.clientX, y: e.clientY, trackIds: sel, playlist: playlistId !== undefined ? { id: playlistId, index: i } : undefined });
  };

  const cols = `${numbered ? "2.5rem " : ""}minmax(0,1.6fr) ${showAlbum ? "minmax(0,1fr) " : ""}${showAdded || meta ? "8.5rem " : ""}2.25rem 3.5rem 2.25rem`;

  return (
    <div role="grid" aria-label={context} aria-rowcount={tracks.length} className="text-sm">
      <div role="row" className="grid items-center gap-3 border-b border-line px-3 pb-2 text-xs font-semibold tracking-wider text-fg-3 uppercase" style={{ gridTemplateColumns: cols }}>
        {numbered && <span className="text-right">#</span>}
        <span>Title</span>
        {showAlbum && <span>Album</span>}
        {(showAdded || meta) && <span>{meta ? "" : "Added"}</span>}
        <span />
        <span className="flex justify-end">
          <Clock3 size={14} aria-label="Duration" />
        </span>
        <span />
      </div>
      <div ref={listRef} className="relative mt-1" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((v) => {
          const t = tracks[v.index];
          const isCurrent = t.id === currentId;
          const isSel = selected.has(t.id);
          const fav = favorites.has(t.id);
          return (
            <div
              key={`${t.id}-${v.index}`}
              role="row"
              aria-selected={isSel}
              tabIndex={0}
              draggable={!!onReorder}
              onDragStart={() => setDragFrom(v.index)}
              onDragOver={(e) => onReorder && e.preventDefault()}
              onDrop={() => {
                if (onReorder && dragFrom !== null && dragFrom !== v.index) onReorder(dragFrom, v.index);
                setDragFrom(null);
              }}
              onClick={(e) => onRowClick(e, v.index)}
              onDoubleClick={() => play(v.index)}
              onKeyDown={(e) => {
                if (e.key === "Enter") play(v.index);
                if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
                  const r = (e.target as HTMLElement).getBoundingClientRect();
                  openMenu({ x: r.left + 40, y: r.bottom, trackIds: [t.id], playlist: playlistId !== undefined ? { id: playlistId, index: v.index } : undefined });
                }
              }}
              onContextMenu={(e) => onMenu(e, v.index)}
              className={`group absolute top-0 left-0 grid w-full items-center gap-3 rounded-vy-sm px-3 transition-colors duration-100 ${
                isSel ? "bg-fg/12" : "hover:bg-fg/6"
              }`}
              style={{ gridTemplateColumns: cols, height: v.size, transform: `translateY(${v.start - virtualizer.options.scrollMargin}px)` }}
            >
              {numbered && (
                <span className="relative flex h-full items-center justify-end text-fg-3 tabular-nums">
                  <span className={`group-hover:invisible ${isCurrent ? "text-accent" : ""}`}>
                    {isCurrent ? <Equalizer playing={playing} /> : v.index + 1}
                  </span>
                  <button
                    type="button"
                    aria-label={`Play ${t.title}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      play(v.index);
                    }}
                    className="invisible absolute right-0 text-fg group-hover:visible"
                  >
                    <Play size={15} fill="currentColor" />
                  </button>
                </span>
              )}
              <div className="flex min-w-0 items-center gap-3">
                {showArt && <Artwork src={t.artwork} className="h-10 w-10 shrink-0" iconSize={16} rounded="rounded-[calc(var(--vy-radius-sm)*0.7)]" />}
                <div className="min-w-0">
                  <div className={`truncate font-semibold ${isCurrent ? "text-accent" : "text-fg"}`}>{t.title}</div>
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate({ name: "artist", artist: t.albumArtist });
                    }}
                    className="block max-w-full truncate text-left text-fg-2 hover:text-fg hover:underline"
                  >
                    {t.artist}
                  </button>
                </div>
              </div>
              {showAlbum && (
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate({ name: "album", key: albumKey(t) });
                  }}
                  className="truncate text-left text-fg-2 hover:text-fg hover:underline"
                >
                  {t.album}
                </button>
              )}
              {(showAdded || meta) && <span className="truncate text-fg-3">{meta ? meta(t, v.index) : relativeTime(t.addedAt)}</span>}
              <button
                type="button"
                aria-label={fav ? `Remove ${t.title} from favorites` : `Add ${t.title} to favorites`}
                aria-pressed={fav}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavorite(t.id);
                }}
                className={`flex justify-center transition-opacity ${fav ? "text-accent" : "text-fg-3 opacity-0 group-hover:opacity-100 hover:text-fg focus-visible:opacity-100"}`}
              >
                <Heart size={16} fill={fav ? "currentColor" : "none"} />
              </button>
              <span className="text-right text-fg-3 tabular-nums">{formatTime(t.duration)}</span>
              <button
                type="button"
                aria-label={`More options for ${t.title}`}
                onClick={(e) => onMenu(e, v.index)}
                className="flex justify-center text-fg-3 opacity-0 group-hover:opacity-100 hover:text-fg focus-visible:opacity-100"
              >
                <MoreHorizontal size={18} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
