import { Search as SearchIcon } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { AlbumCard, ArtistCard, CardGrid, Shelf } from "../components/common/Cards";
import { Artwork } from "../components/common/Artwork";
import { Chip } from "../components/common/controls";
import { EmptyState } from "../components/common/EmptyState";
import { TrackList } from "../components/common/TrackList";
import { matches, searchTracks } from "../lib/library";
import { useLibrary } from "../store/library";
import { useUi } from "../store/ui";
import { LibraryGate } from "./shared";

type Filter = "all" | "tracks" | "albums" | "artists" | "playlists";

export function Search({ q = "" }: { q?: string }) {
  const { tracks, albums, artists, playlists, byId } = useLibrary();
  const navigate = useUi((s) => s.navigate);
  const [filter, setFilter] = useState<Filter>("all");
  const query = useDeferredValue(q.trim());

  const results = useMemo(() => {
    if (!query) return null;
    return {
      tracks: searchTracks(tracks, query),
      albums: [...albums.values()].filter((a) => matches(query, a.title, a.artist, a.genres.join(" "))),
      artists: [...artists.values()].filter((a) => matches(query, a.name)),
      playlists: playlists.filter((p) => matches(query, p.name, p.description)),
    };
  }, [query, tracks, albums, artists, playlists]);

  const genres = useMemo(() => [...new Set(tracks.map((t) => t.genre).filter(Boolean) as string[])].sort(), [tracks]);

  return (
    <LibraryGate>
      <div className="px-3">
        <h1 className="mb-4 text-3xl font-extrabold tracking-tight text-fg">Search</h1>
        {results && (
          <div className="mb-6 flex gap-2" role="toolbar" aria-label="Filter results">
            {(["all", "tracks", "albums", "artists", "playlists"] as Filter[]).map((f) => (
              <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
                {f[0].toUpperCase() + f.slice(1)}
              </Chip>
            ))}
          </div>
        )}
      </div>

      {!results && (
        <div className="px-3">
          <p className="mb-4 text-sm text-fg-2">Type in the search box above. Every word must match a title, artist, album or genre.</p>
          {genres.length > 0 && (
            <>
              <h2 className="mb-3 text-lg font-bold text-fg">Genres</h2>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
                {genres.slice(0, 24).map((g, i) => {
                  const sample = tracks.find((t) => t.genre === g && t.artwork);
                  return (
                    <button
                      key={g}
                      type="button"
                      onClick={() => navigate({ name: "search", q: g })}
                      className="group relative h-24 overflow-hidden rounded-vy p-4 text-left text-lg font-extrabold text-white transition-transform hover:scale-[1.02]"
                      style={{ background: sample?.palette?.[0] ?? `hsl(${(i * 47) % 360} 45% 32%)` }}
                    >
                      <span className="relative z-10 drop-shadow">{g}</span>
                      {sample && <Artwork src={sample.artwork} className="absolute -right-3 -bottom-3 h-20 w-20 rotate-[20deg] shadow-xl" rounded="rounded-md" />}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {results &&
        (results.tracks.length + results.albums.length + results.artists.length + results.playlists.length === 0 ? (
          <EmptyState icon={<SearchIcon size={26} />} title={`No results for "${query}"`}>
            Check the spelling, or try fewer words.
          </EmptyState>
        ) : (
          <>
            {(filter === "all" || filter === "tracks") && results.tracks.length > 0 && (
              <Shelf title={`Tracks${filter === "all" ? "" : ` (${results.tracks.length})`}`}>
                <TrackList tracks={filter === "all" ? results.tracks.slice(0, 8) : results.tracks} context={`search:${query}`} />
              </Shelf>
            )}
            {(filter === "all" || filter === "albums") && results.albums.length > 0 && (
              <Shelf title="Albums">
                <CardGrid>
                  {(filter === "all" ? results.albums.slice(0, 12) : results.albums).map((a) => (
                    <AlbumCard key={a.key} album={a} />
                  ))}
                </CardGrid>
              </Shelf>
            )}
            {(filter === "all" || filter === "artists") && results.artists.length > 0 && (
              <Shelf title="Artists">
                <CardGrid>
                  {(filter === "all" ? results.artists.slice(0, 12) : results.artists).map((a) => (
                    <ArtistCard key={a.name} artist={a} />
                  ))}
                </CardGrid>
              </Shelf>
            )}
            {(filter === "all" || filter === "playlists") && results.playlists.length > 0 && (
              <Shelf title="Playlists">
                <div className="space-y-1 px-3">
                  {results.playlists.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => navigate({ name: "playlist", id: p.id })}
                      className="flex w-full items-center gap-3 rounded-vy-sm p-2 text-left hover:bg-fg/6"
                    >
                      <Artwork src={byId.get(p.trackIds[0])?.artwork} className="h-12 w-12" iconSize={18} />
                      <div>
                        <div className="font-semibold text-fg">{p.name}</div>
                        <div className="text-xs text-fg-2">{p.trackIds.length} tracks</div>
                      </div>
                    </button>
                  ))}
                </div>
              </Shelf>
            )}
          </>
        ))}
    </LibraryGate>
  );
}
