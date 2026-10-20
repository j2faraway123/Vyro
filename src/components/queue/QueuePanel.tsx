import { ArrowDown, ArrowUp, GripVertical, ListX, X } from "lucide-react";
import { useState } from "react";
import { formatTime } from "../../lib/format";
import { useLibrary } from "../../store/library";
import { usePlayer } from "../../store/player";
import { Artwork } from "../common/Artwork";
import { Button, Equalizer, IconButton } from "../common/controls";

function contextLabel(context: string | null, lib: ReturnType<typeof useLibrary.getState>): string | null {
  if (!context) return null;
  const [kind, ...rest] = context.split(":");
  const value = rest.join(":");
  if (kind === "album") return lib.albums.get(value)?.title ?? "Album";
  if (kind === "playlist") return lib.playlists.find((p) => p.id === Number(value))?.name ?? "Playlist";
  if (kind === "artist") return value;
  return value || kind;
}

export function QueuePanel() {
  const { queue, index, playing, context, playAt, removeFromQueue, moveInQueue, clearUpcoming } = usePlayer();
  const lib = useLibrary();
  const [drag, setDrag] = useState<number | null>(null);
  const current = queue[index];
  const upcoming = queue.slice(index + 1);
  const from = contextLabel(context, lib);

  if (!queue.length)
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <p className="font-semibold text-fg">Your queue is empty</p>
        <p className="mt-1 text-xs text-fg-2">Play an album or playlist, or use "Add to queue" from any track's menu.</p>
      </div>
    );

  const row = (id: number, qi: number, isCurrent: boolean) => {
    const t = lib.byId.get(id);
    if (!t) return null;
    return (
      <li
        key={`${id}-${qi}`}
        draggable={!isCurrent}
        onDragStart={() => setDrag(qi)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => {
          if (drag !== null && drag !== qi && qi > index) moveInQueue(drag, qi);
          setDrag(null);
        }}
        onDoubleClick={() => playAt(qi)}
        className={`group flex items-center gap-2.5 rounded-vy-sm px-2 py-1.5 transition-colors hover:bg-fg/6 ${drag === qi ? "opacity-40" : ""}`}
      >
        {!isCurrent && <GripVertical size={14} className="shrink-0 cursor-grab text-fg-3 opacity-0 group-hover:opacity-100" aria-hidden />}
        <button type="button" onClick={() => playAt(qi)} aria-label={`Play ${t.title}`} className="shrink-0">
          <Artwork src={t.artwork} className="h-10 w-10" iconSize={14} />
        </button>
        <div className="min-w-0 flex-1">
          <div className={`flex items-center gap-2 truncate text-sm font-semibold ${isCurrent ? "text-accent" : "text-fg"}`}>
            {isCurrent && <Equalizer playing={playing} />}
            <span className="truncate">{t.title}</span>
          </div>
          <div className="truncate text-xs text-fg-2">{t.artist}</div>
        </div>
        {!isCurrent ? (
          <div className="flex items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <IconButton label="Move up" size="sm" disabled={qi <= index + 1} onClick={() => moveInQueue(qi, qi - 1)}>
              <ArrowUp size={14} />
            </IconButton>
            <IconButton label="Move down" size="sm" disabled={qi >= queue.length - 1} onClick={() => moveInQueue(qi, qi + 1)}>
              <ArrowDown size={14} />
            </IconButton>
            <IconButton label={`Remove ${t.title} from queue`} size="sm" onClick={() => removeFromQueue(qi)}>
              <X size={15} />
            </IconButton>
          </div>
        ) : (
          <span className="text-xs text-fg-3 tabular-nums">{formatTime(t.duration)}</span>
        )}
      </li>
    );
  };

  return (
    <div className="vy-scroll -mx-2 h-full px-2 pb-4">
      <h3 className="mb-2 text-xs font-bold tracking-wider text-fg-3 uppercase">Now playing</h3>
      <ul>{current !== undefined && row(current, index, true)}</ul>
      <div className="mt-5 mb-2 flex items-center justify-between">
        <h3 className="text-xs font-bold tracking-wider text-fg-3 uppercase">
          Next up{from ? <span className="font-medium normal-case"> · from {from}</span> : null}
        </h3>
        {upcoming.length > 0 && (
          <Button variant="ghost" className="h-7 px-2.5 text-xs" icon={<ListX size={14} />} onClick={clearUpcoming}>
            Clear
          </Button>
        )}
      </div>
      {upcoming.length ? (
        <ul>{upcoming.slice(0, 300).map((id, i) => row(id, index + 1 + i, false))}</ul>
      ) : (
        <p className="px-2 text-xs text-fg-3">Nothing queued after this track.</p>
      )}
      {upcoming.length > 300 && <p className="px-2 pt-2 text-xs text-fg-3">and {upcoming.length - 300} more</p>}
    </div>
  );
}
