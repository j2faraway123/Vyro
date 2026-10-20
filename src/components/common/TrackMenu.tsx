import { Disc3, Heart, HeartOff, ListEnd, ListPlus, ListStart, Mic2, Plus, Trash2, User } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { albumKey } from "../../lib/library";
import { useLibrary } from "../../store/library";
import { usePlayer } from "../../store/player";
import { useUi } from "../../store/ui";

function Item({ icon, children, onClick, danger }: { icon: ReactNode; children: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-vy-sm px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-fg/10 focus-visible:bg-fg/10 focus-visible:outline-none ${
        danger ? "text-red-600 dark:text-red-300" : "text-fg"
      }`}
    >
      <span className="text-fg-2">{icon}</span>
      {children}
    </button>
  );
}

/** Context menu for one or more tracks (right click or the ⋯ button). */
export function TrackMenu() {
  const menu = useUi((s) => s.trackMenu);
  const close = useUi((s) => s.closeTrackMenu);
  const navigate = useUi((s) => s.navigate);
  const openNewPlaylist = useUi((s) => s.openNewPlaylist);
  const { byId, favorites, playlists, setFavorite, addToPlaylist, setPlaylistTracks } = useLibrary();
  const { playNext, addToQueue } = usePlayer();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [showPlaylists, setShowPlaylists] = useState(false);

  useLayoutEffect(() => {
    if (!menu || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({
      x: Math.min(menu.x, window.innerWidth - r.width - 8),
      y: Math.min(menu.y, window.innerHeight - r.height - 8),
    });
    setShowPlaylists(false);
    ref.current.querySelector<HTMLElement>("[role=menuitem]")?.focus();
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && close();
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("blur", close);
    };
  }, [menu, close]);

  if (!menu) return null;
  const ids = menu.trackIds;
  const first = byId.get(ids[0]);
  const allFav = ids.every((id) => favorites.has(id));
  const run = (fn: () => void) => () => {
    fn();
    close();
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Track options"
      className="vy-pop vy-panel fixed z-50 w-64 p-1.5 shadow-[var(--vy-shadow)]"
      style={{ left: pos.x, top: pos.y, ["--panel-alpha" as string]: "94%" }}
    >
      {ids.length > 1 && <div className="px-3 pt-1.5 pb-2 text-xs font-semibold text-fg-3">{ids.length} tracks selected</div>}
      {!showPlaylists ? (
        <>
          <Item icon={<ListStart size={16} />} onClick={run(() => playNext(ids))}>
            Play next
          </Item>
          <Item icon={<ListEnd size={16} />} onClick={run(() => addToQueue(ids))}>
            Add to queue
          </Item>
          <Item icon={<ListPlus size={16} />} onClick={() => setShowPlaylists(true)}>
            Add to playlist…
          </Item>
          <Item icon={allFav ? <HeartOff size={16} /> : <Heart size={16} />} onClick={run(() => setFavorite(ids, !allFav))}>
            {allFav ? "Remove from favorites" : "Add to favorites"}
          </Item>
          {menu.playlist && (
            <Item
              danger
              icon={<Trash2 size={16} />}
              onClick={run(() => {
                const pl = playlists.find((p) => p.id === menu.playlist!.id);
                if (!pl) return;
                const drop = new Set(ids);
                const next = ids.length > 1 ? pl.trackIds.filter((id) => !drop.has(id)) : pl.trackIds.filter((_, i) => i !== menu.playlist!.index);
                setPlaylistTracks(pl.id, next);
              })}
            >
              Remove from this playlist
            </Item>
          )}
          {first && ids.length === 1 && (
            <>
              <div className="my-1 h-px bg-line" />
              <Item icon={<Disc3 size={16} />} onClick={run(() => navigate({ name: "album", key: albumKey(first) }))}>
                Go to album
              </Item>
              <Item icon={<User size={16} />} onClick={run(() => navigate({ name: "artist", artist: first.albumArtist }))}>
                Go to artist
              </Item>
              <div className="truncate px-3 py-1.5 text-[11px] text-fg-3" title={first.path}>
                <Mic2 size={11} className="mr-1 inline" aria-hidden />
                {first.format.toUpperCase()}
                {first.bitrate ? ` · ${first.bitrate} kbps` : ""}
                {first.sampleRate ? ` · ${(first.sampleRate / 1000).toFixed(1)} kHz` : ""}
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <Item icon={<Plus size={16} />} onClick={run(() => openNewPlaylist(ids))}>
            New playlist
          </Item>
          <div className="my-1 h-px bg-line" />
          <div className="vy-scroll max-h-64">
            {playlists.length === 0 && <div className="px-3 py-2 text-sm text-fg-3">No playlists yet</div>}
            {playlists.map((p) => (
              <Item key={p.id} icon={<ListPlus size={16} />} onClick={run(() => addToPlaylist(p.id, ids))}>
                <span className="truncate">{p.name}</span>
              </Item>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
