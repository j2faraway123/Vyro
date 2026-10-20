import { Heart, History, ListMusic, Pencil, Plus, Shuffle, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Artwork } from "../components/common/Artwork";
import { AlbumCard, CardGrid, Shelf } from "../components/common/Cards";
import { Button, IconButton } from "../components/common/controls";
import { EmptyState } from "../components/common/EmptyState";
import { Modal, PlaylistDialog } from "../components/common/Overlays";
import { BigPlayButton, PageHeader } from "../components/common/PageHeader";
import { TrackList } from "../components/common/TrackList";
import { backend } from "../lib/backend";
import { formatDuration, plural, relativeTime } from "../lib/format";
import { shuffled } from "../lib/queue";
import { sortAlbumTracks, sortAlbums } from "../lib/library";
import type { Track } from "../lib/types";
import { useLibrary } from "../store/library";
import { usePlayer } from "../store/player";
import { useUi } from "../store/ui";
import { Dot, LibraryGate } from "./shared";

function usePlayContext(context: string, ids: number[]) {
  const playTracks = usePlayer((s) => s.playTracks);
  const toggle = usePlayer((s) => s.toggle);
  const active = usePlayer((s) => s.context === context);
  const playing = usePlayer((s) => s.playing);
  return {
    playing: active && playing,
    onPlay: () => (active ? toggle() : playTracks(ids, 0, context)),
    onShuffle: () => playTracks(shuffled(ids), 0, context),
  };
}

function Actions({ ids, context, extra }: { ids: number[]; context: string; extra?: React.ReactNode }) {
  const { playing, onPlay, onShuffle } = usePlayContext(context, ids);
  return (
    <>
      <BigPlayButton label={playing ? "Pause" : "Play"} playing={playing} onClick={onPlay} />
      <IconButton label="Shuffle play" size="lg" onClick={onShuffle} disabled={!ids.length}>
        <Shuffle size={22} />
      </IconButton>
      {extra}
    </>
  );
}

export function AlbumPage({ albumKey }: { albumKey: string }) {
  const { albums, byId, artists } = useLibrary();
  const navigate = useUi((s) => s.navigate);
  const album = albums.get(albumKey);
  const tracks = useMemo(() => (album ? sortAlbumTracks(album.trackIds, byId).map((id) => byId.get(id)!) : []), [album, byId]);
  if (!album)
    return (
      <LibraryGate>
        <EmptyState icon={<ListMusic size={26} />} title="Album not found">
          It may have been removed from your library.
        </EmptyState>
      </LibraryGate>
    );
  const more = (artists.get(album.artist)?.albumKeys ?? []).filter((k) => k !== album.key).map((k) => albums.get(k)!).filter(Boolean);
  const discs = new Set(tracks.map((t) => t.discNo ?? 1)).size;
  return (
    <LibraryGate>
      <PageHeader
        kind="Album"
        title={album.title}
        palette={album.palette}
        art={<Artwork src={album.artwork} alt={`${album.title} cover`} className="h-52 w-52 shadow-[0_24px_60px_-20px_rgba(0,0,0,.8)]" iconSize={56} rounded="rounded-vy" />}
        meta={
          <>
            <button type="button" className="font-bold text-fg hover:underline" onClick={() => navigate({ name: "artist", artist: album.artist })}>
              {album.artist}
            </button>
            {album.year && (
              <>
                <Dot /> {album.year}
              </>
            )}
            <Dot /> {plural(tracks.length, "track")}
            <Dot /> {formatDuration(album.duration)}
            {album.genres[0] && (
              <>
                <Dot /> {album.genres[0]}
              </>
            )}
          </>
        }
        actions={<Actions ids={tracks.map((t) => t.id)} context={`album:${album.key}`} />}
      />
      <TrackList tracks={tracks} context={`album:${album.key}`} showAlbum={false} showArt={false} meta={discs > 1 ? (t) => `Disc ${t.discNo ?? 1}` : undefined} />
      {more.length > 0 && (
        <div className="mt-10">
          <Shelf title={`More by ${album.artist}`}>
            <CardGrid>
              {sortAlbums(more, "year").map((a) => (
                <AlbumCard key={a.key} album={a} subtitle={a.year ? String(a.year) : "Album"} />
              ))}
            </CardGrid>
          </Shelf>
        </div>
      )}
    </LibraryGate>
  );
}

export function ArtistPage({ artist: name }: { artist: string }) {
  const { artists, albums, byId } = useLibrary();
  const artist = artists.get(name);
  const tracks = useMemo(() => (artist ? artist.trackIds.map((id) => byId.get(id)!).filter(Boolean) : []), [artist, byId]);
  const popular = useMemo(() => tracks.slice().sort((a, b) => b.playCount - a.playCount || a.title.localeCompare(b.title)).slice(0, 5), [tracks]);
  if (!artist)
    return (
      <LibraryGate>
        <EmptyState icon={<ListMusic size={26} />} title="Artist not found" />
      </LibraryGate>
    );
  const artistAlbums = sortAlbums(artist.albumKeys.map((k) => albums.get(k)!).filter(Boolean), "year");
  return (
    <LibraryGate>
      <PageHeader
        kind="Artist"
        title={artist.name}
        palette={artist.palette}
        art={<Artwork src={artist.artwork} className="h-48 w-48 shadow-2xl" iconSize={50} rounded="rounded-full" />}
        meta={
          <>
            {plural(artistAlbums.length, "album")} <Dot /> {plural(tracks.length, "track")}
          </>
        }
        actions={<Actions ids={tracks.map((t) => t.id)} context={`artist:${artist.name}`} />}
      />
      <Shelf title="Popular in your library">
        <TrackList tracks={popular} context={`artist:${artist.name}`} meta={(t) => plural(t.playCount, "play")} />
      </Shelf>
      <Shelf title="Discography">
        <CardGrid>
          {artistAlbums.map((a) => (
            <AlbumCard key={a.key} album={a} subtitle={a.year ? String(a.year) : "Album"} />
          ))}
        </CardGrid>
      </Shelf>
    </LibraryGate>
  );
}

export function FavoritesPage() {
  const { favoriteOrder, byId } = useLibrary();
  const tracks = favoriteOrder.map((id) => byId.get(id)).filter((t): t is Track => !!t);
  return (
    <LibraryGate>
      <PageHeader
        kind="Collection"
        title="Favorites"
        art={
          <div className="flex h-44 w-44 items-center justify-center rounded-vy bg-gradient-to-br from-accent to-fuchsia-700 shadow-2xl">
            <Heart size={64} fill="white" className="text-white" />
          </div>
        }
        meta={plural(tracks.length, "track")}
        actions={tracks.length ? <Actions ids={tracks.map((t) => t.id)} context="favorites:Favorites" /> : undefined}
      />
      {tracks.length ? (
        <TrackList tracks={tracks} context="favorites:Favorites" />
      ) : (
        <EmptyState icon={<Heart size={26} />} title="No favorites yet">
          Tap the heart next to any track, or press Shift+F while it's playing.
        </EmptyState>
      )}
    </LibraryGate>
  );
}

export function PlaylistsPage() {
  const { playlists, byId } = useLibrary();
  const navigate = useUi((s) => s.navigate);
  const openNew = useUi((s) => s.openNewPlaylist);
  return (
    <LibraryGate allowEmpty>
      <div className="mb-6 flex items-end justify-between px-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-fg">Playlists</h1>
          <p className="mt-1 text-sm text-fg-2">{plural(playlists.length, "playlist")}</p>
        </div>
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => openNew()}>
          New playlist
        </Button>
      </div>
      {playlists.length === 0 ? (
        <EmptyState icon={<ListMusic size={26} />} title="No playlists yet" actions={<Button onClick={() => openNew()}>Create playlist</Button>}>
          Playlists are saved in Vyro's local database and survive restarts and rescans.
        </EmptyState>
      ) : (
        <CardGrid>
          {playlists.map((p) => {
            const arts = [...new Set(p.trackIds.map((id) => byId.get(id)?.artwork).filter(Boolean))].slice(0, 4) as string[];
            return (
              <button key={p.id} type="button" onClick={() => navigate({ name: "playlist", id: p.id })} className="vy-enter rounded-vy p-3 text-left transition-colors hover:bg-fg/6">
                <div className="mb-3 grid aspect-square grid-cols-2 overflow-hidden rounded-vy bg-elevated shadow-[0_10px_30px_-12px_rgba(0,0,0,.7)]">
                  {arts.length >= 4 ? (
                    arts.map((a) => <Artwork key={a} src={a} className="h-full w-full" rounded="rounded-none" />)
                  ) : (
                    <Artwork src={arts[0]} className="col-span-2 row-span-2 h-full w-full" rounded="rounded-none" iconSize={40} />
                  )}
                </div>
                <div className="truncate font-bold text-fg">{p.name}</div>
                <div className="mt-0.5 text-sm text-fg-2">{plural(p.trackIds.length, "track")}</div>
              </button>
            );
          })}
        </CardGrid>
      )}
    </LibraryGate>
  );
}

export function PlaylistPage({ id }: { id: number }) {
  const { playlists, byId, renamePlaylist, deletePlaylist, setPlaylistTracks } = useLibrary();
  const navigate = useUi((s) => s.navigate);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const pl = playlists.find((p) => p.id === id);
  if (!pl)
    return (
      <EmptyState icon={<ListMusic size={26} />} title="Playlist not found">
        It may have been deleted.
      </EmptyState>
    );
  const tracks = pl.trackIds.map((t) => byId.get(t)).filter((t): t is Track => !!t);
  const firstArt = tracks.find((t) => t.artwork);
  return (
    <>
      <PageHeader
        kind="Playlist"
        title={pl.name}
        description={pl.description}
        palette={firstArt?.palette}
        art={<Artwork src={firstArt?.artwork} className="h-48 w-48 shadow-2xl" iconSize={50} rounded="rounded-vy" />}
        meta={
          <>
            {plural(tracks.length, "track")} <Dot /> {formatDuration(tracks.reduce((n, t) => n + t.duration, 0))} <Dot /> updated {relativeTime(pl.updatedAt)}
          </>
        }
        actions={
          <Actions
            ids={tracks.map((t) => t.id)}
            context={`playlist:${pl.id}`}
            extra={
              <>
                <IconButton label="Edit details" size="lg" onClick={() => setEditing(true)}>
                  <Pencil size={19} />
                </IconButton>
                <IconButton label="Delete playlist" size="lg" onClick={() => setConfirmDelete(true)}>
                  <Trash2 size={19} />
                </IconButton>
              </>
            }
          />
        }
      />
      {tracks.length ? (
        <>
          <p className="mb-2 px-3 text-xs text-fg-3">Drag rows to reorder. Right-click a track to remove it.</p>
          <TrackList
            tracks={tracks}
            context={`playlist:${pl.id}`}
            playlistId={pl.id}
            onReorder={(from, to) => {
              const ids = pl.trackIds.slice();
              const [x] = ids.splice(from, 1);
              ids.splice(to, 0, x);
              setPlaylistTracks(pl.id, ids);
            }}
          />
        </>
      ) : (
        <EmptyState icon={<ListMusic size={26} />} title="This playlist is empty" actions={<Button onClick={() => navigate({ name: "library", tab: "tracks" })}>Browse tracks</Button>}>
          Use "Add to playlist" from any track's menu (right-click or ⋯).
        </EmptyState>
      )}
      {editing && (
        <PlaylistDialog
          title="Edit playlist"
          initial={{ name: pl.name, description: pl.description }}
          onClose={() => setEditing(false)}
          onSubmit={async (name, description) => {
            await renamePlaylist(pl.id, name, description);
            setEditing(false);
          }}
        />
      )}
      {confirmDelete && (
        <Modal
          title="Delete playlist?"
          onClose={() => setConfirmDelete(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={async () => {
                  await deletePlaylist(pl.id);
                  navigate({ name: "playlists" });
                }}
              >
                Delete
              </Button>
            </>
          }
        >
          <p className="text-sm text-fg-2">"{pl.name}" will be deleted. The tracks stay in your library.</p>
        </Modal>
      )}
    </>
  );
}

export function RecentPage() {
  const { recent, byId, refreshRecent } = useLibrary();
  const [confirm, setConfirm] = useState(false);
  const items = recent.map((p) => ({ p, t: byId.get(p.trackId) })).filter((x): x is { p: (typeof recent)[number]; t: Track } => !!x.t);
  const tracks = items.map((x) => x.t);
  return (
    <LibraryGate>
      <div className="mb-6 flex items-end justify-between px-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-fg">Recently Played</h1>
          <p className="mt-1 text-sm text-fg-2">Tracks count as played after 10 seconds or halfway through.</p>
        </div>
        {items.length > 0 && (
          <Button variant="ghost" onClick={() => setConfirm(true)}>
            Clear history
          </Button>
        )}
      </div>
      {items.length ? (
        <TrackList tracks={tracks} context="recent:Recently played" meta={(_, i) => relativeTime(items[i].p.playedAt)} />
      ) : (
        <EmptyState icon={<History size={26} />} title="Nothing played yet">
          Your listening history will appear here.
        </EmptyState>
      )}
      {confirm && (
        <Modal
          title="Clear listening history?"
          onClose={() => setConfirm(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirm(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={async () => {
                  await backend().clearHistory();
                  await refreshRecent();
                  setConfirm(false);
                }}
              >
                Clear
              </Button>
            </>
          }
        >
          <p className="text-sm text-fg-2">This removes the Recently Played list. Play counts on tracks are kept.</p>
        </Modal>
      )}
    </LibraryGate>
  );
}
