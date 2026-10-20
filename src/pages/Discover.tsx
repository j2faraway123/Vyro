import { Play, Shuffle } from "lucide-react";
import { useMemo } from "react";
import { AlbumCard, CardRow, Shelf } from "../components/common/Cards";
import { Artwork } from "../components/common/Artwork";
import { Button, Chip } from "../components/common/controls";
import { TrackList } from "../components/common/TrackList";
import { albumBackground } from "../lib/color";
import { greeting, plural } from "../lib/format";
import { albumKey, dailyPick, sortAlbumTracks } from "../lib/library";
import type { Album } from "../lib/types";
import { useLibrary } from "../store/library";
import { usePlayer } from "../store/player";
import { useUi } from "../store/ui";
import { LibraryGate } from "./shared";

function Hero({ album }: { album: Album }) {
  const byId = useLibrary((s) => s.byId);
  const playTracks = usePlayer((s) => s.playTracks);
  const navigate = useUi((s) => s.navigate);
  // Always the dark band: the hero uses white text in both themes.
  const p = album.palette ? albumBackground(album.palette, "dark") : null;
  return (
    <div
      className="vy-enter group relative mb-8 flex items-center gap-6 overflow-hidden rounded-vy-lg border border-line p-6"
      style={{ background: p ? `linear-gradient(120deg, ${p.c1}, ${p.c2} 60%, ${p.c3})` : "linear-gradient(120deg, #2a2a2a, #1c1c1c)" }}
    >
      <button type="button" onClick={() => navigate({ name: "album", key: album.key })} aria-label={`Open ${album.title}`}>
        <Artwork src={album.artwork} className="h-36 w-36 shadow-[0_20px_50px_-15px_rgba(0,0,0,.7)] transition-transform duration-300 group-hover:scale-[1.02]" iconSize={44} rounded="rounded-vy" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-bold tracking-wider text-white/70 uppercase">Jump back in</div>
        <h2 className="mt-1 truncate text-4xl font-extrabold tracking-tight text-white">{album.title}</h2>
        <p className="mt-1 truncate text-white/75">
          {album.artist} · {plural(album.trackIds.length, "track")}
        </p>
        <div className="mt-5 flex gap-2">
          <Button variant="primary" icon={<Play size={16} fill="currentColor" />} onClick={() => playTracks(sortAlbumTracks(album.trackIds, byId), 0, `album:${album.key}`)}>
            Play
          </Button>
          <Button className="border-white/20 bg-white/10 text-white hover:bg-white/20" onClick={() => navigate({ name: "album", key: album.key })}>
            Open album
          </Button>
        </div>
      </div>
    </div>
  );
}

export function Discover() {
  const { tracks, albums, recent, byId } = useLibrary();
  const playTracks = usePlayer((s) => s.playTracks);
  const navigate = useUi((s) => s.navigate);

  const data = useMemo(() => {
    const all = [...albums.values()];
    const recentAlbums: Album[] = [];
    const seen = new Set<string>();
    for (const p of recent) {
      const t = byId.get(p.trackId);
      if (!t) continue;
      const key = albumKey(t);
      if (seen.has(key)) continue;
      seen.add(key);
      const a = albums.get(key);
      if (a) recentAlbums.push(a);
      if (recentAlbums.length >= 12) break;
    }
    const added = all.slice().sort((a, b) => b.addedAt - a.addedAt).slice(0, 12);
    const top = tracks.filter((t) => t.playCount > 0).sort((a, b) => b.playCount - a.playCount).slice(0, 5);
    const monthAgo = Date.now() / 1000 - 30 * 86400;
    const rediscover = dailyPick(all.filter((a) => !a.lastPlayed || a.lastPlayed < monthAgo), 12);
    const genres = [...new Set(tracks.map((t) => t.genre).filter((g): g is string => !!g))].sort().slice(0, 16);
    return { recentAlbums, added, top, rediscover, genres, hero: recentAlbums[0] ?? added[0] };
  }, [albums, recent, byId, tracks]);

  return (
    <LibraryGate>
      <div className="px-3">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-fg">{greeting()}</h1>
            <p className="mt-1 text-sm text-fg-2">
              {plural(tracks.length, "track")} across {plural(albums.size, "album")}
            </p>
          </div>
          <Button icon={<Shuffle size={16} />} onClick={() => playTracks(dailyPick(tracks.map((t) => t.id), tracks.length, String(Math.random())), 0, "library:Shuffle all")}>
            Shuffle all
          </Button>
        </div>
        {data.hero && <Hero album={data.hero} />}
      </div>

      {data.recentAlbums.length > 0 && (
        <Shelf title="Recently played" action={<Button variant="ghost" className="h-8 text-xs" onClick={() => navigate({ name: "recent" })}>Show all</Button>}>
          <CardRow>
            {data.recentAlbums.map((a) => (
              <AlbumCard key={a.key} album={a} />
            ))}
          </CardRow>
        </Shelf>
      )}

      <Shelf title="Recently added" action={<Button variant="ghost" className="h-8 text-xs" onClick={() => navigate({ name: "library", tab: "albums" })}>Library</Button>}>
        <CardRow>
          {data.added.map((a) => (
            <AlbumCard key={a.key} album={a} />
          ))}
        </CardRow>
      </Shelf>

      {data.top.length > 0 && (
        <Shelf title="Your top tracks">
          <div className="px-0">
            <TrackList tracks={data.top} context="discover:Top tracks" meta={(t) => plural(t.playCount, "play")} />
          </div>
        </Shelf>
      )}

      {data.rediscover.length > 0 && (
        <Shelf title="Rediscover">
          <CardRow>
            {data.rediscover.map((a) => (
              <AlbumCard key={a.key} album={a} subtitle={a.lastPlayed ? `${a.artist}` : `${a.artist} · not played yet`} />
            ))}
          </CardRow>
        </Shelf>
      )}

      {data.genres.length > 0 && (
        <Shelf title="Browse by genre">
          <div className="flex flex-wrap gap-2 px-3">
            {data.genres.map((g) => (
              <Chip key={g} onClick={() => navigate({ name: "search", q: g })}>
                {g}
              </Chip>
            ))}
          </div>
        </Shelf>
      )}
    </LibraryGate>
  );
}
