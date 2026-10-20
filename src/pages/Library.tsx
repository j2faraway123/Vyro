import { AlertTriangle, FolderOpen, LayoutGrid, List, RefreshCw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { AlbumCard, ArtistCard, CardGrid } from "../components/common/Cards";
import { Artwork } from "../components/common/Artwork";
import { Button, IconButton, Segmented } from "../components/common/controls";
import { EmptyState } from "../components/common/EmptyState";
import { inputClass } from "../components/common/Overlays";
import { TrackList } from "../components/common/TrackList";
import { backend } from "../lib/backend";
import { formatDuration, plural } from "../lib/format";
import { matches, sortAlbums, sortTracks, type AlbumSort, type TrackSort } from "../lib/library";
import { useLibrary } from "../store/library";
import { useSettings } from "../store/settings";
import { useUi } from "../store/ui";
import { ImportActions, LibraryGate } from "./shared";

type Tab = "albums" | "artists" | "tracks" | "folders";

function ScanStatus() {
  const scan = useLibrary((s) => s.scan);
  if (!scan) return null;
  const pct = scan.total ? Math.round((scan.processed / scan.total) * 100) : 0;
  return (
    <div className="mb-6 rounded-vy border border-line bg-fg/5 p-4" aria-live="polite">
      {scan.running ? (
        <>
          <div className="mb-2 flex justify-between text-sm">
            <span className="font-semibold text-fg">Importing music…</span>
            <span className="text-fg-2 tabular-nums">
              {scan.processed} / {scan.total || "?"}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-fg/10">
            <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
          </div>
          {scan.current && <p className="mt-2 truncate text-xs text-fg-3">{scan.current}</p>}
        </>
      ) : (
        <p className="text-sm text-fg-2">
          Last scan: {scan.added} added, {scan.updated} updated, {scan.removed} removed, {scan.skipped} unchanged.
        </p>
      )}
      {scan.errors.length > 0 && (
        <details className="mt-3 text-xs">
          <summary className="flex cursor-pointer items-center gap-2 font-semibold text-amber-700 dark:text-amber-300">
            <AlertTriangle size={14} /> {plural(scan.errors.length, "file")} couldn't be read
          </summary>
          <ul className="vy-scroll mt-2 max-h-40 space-y-1 text-fg-3">
            {scan.errors.map((e, i) => (
              <li key={i} className="break-all">
                {e}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Folders() {
  const { folders, rescan, removeFolder, scan } = useLibrary();
  const [confirm, setConfirm] = useState<number | null>(null);
  return (
    <div className="px-3">
      <ScanStatus />
      <div className="mb-4 flex flex-wrap gap-2">
        <ImportActions />
        <Button icon={<RefreshCw size={16} />} onClick={() => rescan(false)} disabled={!folders.length || scan?.running}>
          Rescan folders
        </Button>
        <Button variant="ghost" onClick={() => rescan(true)} disabled={!folders.length || scan?.running} title="Re-read tags and artwork for every file">
          Full rescan
        </Button>
      </div>
      {folders.length === 0 ? (
        <EmptyState compact icon={<FolderOpen size={26} />} title="No watched folders">
          Folders you add are rescanned on demand to pick up new, changed and deleted files. Individually imported files stay in the library either way.
        </EmptyState>
      ) : (
        <ul className="space-y-1">
          {folders.map((f) => (
            <li key={f.id} className="flex items-center gap-3 rounded-vy-sm bg-fg/4 px-4 py-3">
              <FolderOpen size={18} className="shrink-0 text-fg-2" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-fg" title={f.path}>
                  {f.path}
                </div>
                <div className="text-xs text-fg-3">{plural(f.trackCount, "track")}</div>
              </div>
              {confirm === f.id ? (
                <>
                  <span className="text-xs text-fg-2">Remove folder and its tracks from Vyro? Files stay on disk.</span>
                  <Button variant="danger" className="h-8" onClick={() => (removeFolder(f.id), setConfirm(null))}>
                    Remove
                  </Button>
                  <Button variant="ghost" className="h-8" onClick={() => setConfirm(null)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <IconButton label={`Remove ${f.path}`} size="sm" onClick={() => setConfirm(f.id)}>
                  <Trash2 size={16} />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Library({ tab: initialTab = "albums" }: { tab?: Tab }) {
  const { tracks, albums, artists } = useLibrary();
  const view = useSettings((s) => s.settings.libraryView);
  const update = useSettings((s) => s.update);
  const replace = useUi((s) => s.replace);
  const tab = initialTab;
  const setTab = (t: Tab) => replace({ name: "library", tab: t });
  const [filter, setFilter] = useState("");
  const [albumSort, setAlbumSort] = useState<AlbumSort>("artist");
  const [trackSort, setTrackSort] = useState<TrackSort>("artist");
  const [desc, setDesc] = useState(false);

  const albumList = useMemo(() => sortAlbums([...albums.values()].filter((a) => matches(filter, a.title, a.artist)), albumSort), [albums, filter, albumSort]);
  const artistList = useMemo(() => [...artists.values()].filter((a) => a.albumKeys.length && matches(filter, a.name)).sort((a, b) => a.name.localeCompare(b.name)), [artists, filter]);
  const trackList = useMemo(() => sortTracks(tracks.filter((t) => matches(filter, t.title, t.artist, t.album, t.genre)), trackSort, desc), [tracks, filter, trackSort, desc]);
  const total = tracks.reduce((n, t) => n + t.duration, 0);

  const sortSelect = (
    <select
      aria-label="Sort by"
      value={tab === "tracks" ? trackSort : albumSort}
      onChange={(e) => (tab === "tracks" ? setTrackSort(e.target.value as TrackSort) : setAlbumSort(e.target.value as AlbumSort))}
      className="h-9 rounded-full border border-line bg-fg/6 px-3 text-sm text-fg outline-none"
    >
      {tab === "tracks" ? (
        <>
          <option value="artist">Artist</option>
          <option value="title">Title</option>
          <option value="album">Album</option>
          <option value="added">Recently added</option>
          <option value="duration">Duration</option>
          <option value="plays">Most played</option>
        </>
      ) : (
        <>
          <option value="artist">Artist</option>
          <option value="title">Title</option>
          <option value="year">Year</option>
          <option value="added">Recently added</option>
          <option value="played">Recently played</option>
        </>
      )}
    </select>
  );

  return (
    <LibraryGate allowEmpty={tab === "folders"}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4 px-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-fg">Library</h1>
          <p className="mt-1 text-sm text-fg-2">
            {plural(tracks.length, "track")} · {plural(albums.size, "album")} · {formatDuration(total)}
          </p>
        </div>
        <Segmented
          label="Library view"
          value={tab}
          onChange={setTab}
          options={[
            { value: "albums", label: "Albums" },
            { value: "artists", label: "Artists" },
            { value: "tracks", label: "Tracks" },
            { value: "folders", label: "Folders" },
          ]}
        />
      </div>

      {tab !== "folders" && (
        <div className="mb-4 flex flex-wrap items-center gap-2 px-3">
          <input className={`${inputClass} h-9 max-w-xs rounded-full`} placeholder={`Filter ${tab}`} aria-label={`Filter ${tab}`} value={filter} onChange={(e) => setFilter(e.target.value)} />
          {tab !== "artists" && sortSelect}
          {tab === "tracks" && (
            <Button variant="ghost" className="h-9" onClick={() => setDesc(!desc)} aria-label="Reverse order">
              {desc ? "Descending" : "Ascending"}
            </Button>
          )}
          {tab === "albums" && (
            <div className="ml-auto flex">
              <IconButton label="Grid view" active={view === "grid"} onClick={() => update({ libraryView: "grid" })}>
                <LayoutGrid size={17} />
              </IconButton>
              <IconButton label="List view" active={view === "list"} onClick={() => update({ libraryView: "list" })}>
                <List size={18} />
              </IconButton>
            </div>
          )}
        </div>
      )}

      {tab === "albums" &&
        (view === "grid" ? (
          <CardGrid>
            {albumList.map((a) => (
              <AlbumCard key={a.key} album={a} subtitle={`${a.artist}${a.year ? ` · ${a.year}` : ""}`} />
            ))}
          </CardGrid>
        ) : (
          <AlbumListView albums={albumList} />
        ))}
      {tab === "artists" && (
        <CardGrid>
          {artistList.map((a) => (
            <ArtistCard key={a.name} artist={a} />
          ))}
        </CardGrid>
      )}
      {tab === "tracks" && <TrackList tracks={trackList} context="library:All tracks" showAdded />}
      {tab === "folders" && <Folders />}
      {tab !== "folders" && filter && albumList.length + artistList.length + trackList.length === 0 && (
        <p className="px-3 py-10 text-center text-sm text-fg-2">Nothing matches "{filter}".</p>
      )}
      {backend().isPreview && tab === "folders" && <p className="px-3 pt-4 text-xs text-fg-3">Folder import needs the desktop app.</p>}
    </LibraryGate>
  );
}

function AlbumListView({ albums }: { albums: ReturnType<typeof sortAlbums> }) {
  const navigate = useUi((s) => s.navigate);
  return (
    <ul className="px-3">
      {albums.map((a) => (
        <li key={a.key}>
          <button type="button" onClick={() => navigate({ name: "album", key: a.key })} className="flex w-full items-center gap-4 rounded-vy-sm p-2 text-left hover:bg-fg/6">
            <Artwork src={a.artwork} className="h-12 w-12" iconSize={18} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-fg">{a.title}</div>
              <div className="truncate text-sm text-fg-2">{a.artist}</div>
            </div>
            <span className="text-sm text-fg-3">{a.year ?? ""}</span>
            <span className="w-20 text-right text-sm text-fg-3">{plural(a.trackIds.length, "track")}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
