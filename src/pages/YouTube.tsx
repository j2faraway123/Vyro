import { Info, KeyRound, ListMusic, ListPlus, Play, Search, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { create } from "zustand";
import { Artwork } from "../components/common/Artwork";
import { Button, Equalizer, IconButton, Spinner } from "../components/common/controls";
import { ErrorBanner } from "../components/common/EmptyState";
import { inputClass } from "../components/common/Overlays";
import { backend, errorMessage } from "../lib/backend";
import { formatTime, plural } from "../lib/format";
import type { YtItem, YtStatus } from "../lib/types";
import { usePlayer } from "../store/player";
import { useUi } from "../store/ui";
import { useYouTube } from "../store/youtube";

const CONSOLE_URL = "https://console.cloud.google.com/apis/library/youtube.googleapis.com";

/** Whether a YouTube API key is saved; shared by the page and Settings. */
export const useYtKey = create<{ status: YtStatus | null; load: () => Promise<void>; set: (s: YtStatus) => void }>((set) => ({
  status: null,
  load: async () => {
    try {
      set({ status: await backend().ytStatus() });
    } catch {
      set({ status: { hasKey: false, keyHint: null } });
    }
  },
  set: (status) => set({ status }),
}));

/** The last search or playlist, kept while you visit other pages. */
interface Browse {
  kind: "search" | "playlist";
  /** The query or playlist link. */
  input: string;
  title: string;
  items: YtItem[];
  nextPage: string | null;
  hidden: number;
}
const useBrowse = create<{ browse: Browse | null; set: (b: Browse | null) => void }>((set) => ({ browse: null, set: (browse) => set({ browse }) }));

export function YouTubeKeyForm() {
  const status = useYtKey((s) => s.status);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = backend().isPreview;

  const save = async (value: string | null) => {
    setBusy(true);
    setError(null);
    try {
      useYtKey.getState().set(await backend().ytSetKey(value));
      setKey("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 text-sm">
      {status?.hasKey ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-fg-2">
            Key saved, ending in <span className="font-mono font-semibold text-fg">…{status.keyHint}</span>.
          </span>
          <Button variant="ghost" icon={<Trash2 size={15} />} onClick={() => save(null)} disabled={busy}>
            Remove key
          </Button>
        </div>
      ) : (
        <ol className="list-decimal space-y-1.5 pl-5 text-fg-2">
          <li>
            Sign in to Google Cloud Console and create a project (it's free):{" "}
            <span className="font-mono text-xs break-all text-fg select-text">{CONSOLE_URL}</span>
          </li>
          <li>Enable "YouTube Data API v3" for that project.</li>
          <li>Under APIs & Services → Credentials, choose Create credentials → API key, and copy it.</li>
          <li>Paste it below. Vyro checks it with YouTube, then keeps it on this computer only.</li>
        </ol>
      )}
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (key.trim()) void save(key.trim());
        }}
      >
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          aria-label="YouTube API key"
          placeholder={status?.hasKey ? "Paste a new key to replace it" : "Paste your API key"}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          className={`${inputClass} max-w-md flex-1 font-mono`}
          disabled={preview}
        />
        <Button type="submit" variant="primary" icon={<KeyRound size={15} />} loading={busy} disabled={busy || !key.trim() || preview}>
          {status?.hasKey ? "Replace key" : "Save key"}
        </Button>
      </form>
      {preview && <p className="text-fg-3">Available in the desktop app.</p>}
      {error && <ErrorBanner>{error}</ErrorBanner>}
    </div>
  );
}

function ResultRow({ item, index, items, context }: { item: YtItem; index: number; items: YtItem[]; context: string }) {
  const current = useYouTube((s) => s.queue[s.index]?.videoId);
  const isYt = usePlayer((s) => s.source === "yt");
  const playing = usePlayer((s) => s.playing);
  const active = isYt && current === item.videoId;
  const { playItems, addToQueue } = useYouTube.getState();
  return (
    <li
      onDoubleClick={() => playItems(items, index, context)}
      className={`group flex items-center gap-3 rounded-vy-sm px-2 py-2 transition-colors hover:bg-fg/6 ${active ? "bg-fg/6" : ""}`}
    >
      <button type="button" onClick={() => playItems(items, index, context)} aria-label={`Play ${item.title}`} className="relative shrink-0">
        <Artwork src={item.thumbnail} className="aspect-video w-28" iconSize={18} />
        <span className="absolute inset-0 flex items-center justify-center rounded-vy-sm bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100">
          <Play size={20} fill="currentColor" />
        </span>
      </button>
      <div className="min-w-0 flex-1">
        <div className={`flex items-center gap-2 text-sm font-semibold ${active ? "text-accent" : "text-fg"}`}>
          {active && <Equalizer playing={playing} />}
          <span className="truncate" title={item.rawTitle}>
            {item.title}
          </span>
        </div>
        <div className="truncate text-xs text-fg-2">
          {item.artist}
          {item.channel && item.channel !== item.artist ? <span className="text-fg-3"> · {item.channel}</span> : null}
        </div>
      </div>
      <span className="text-xs text-fg-3 tabular-nums">{item.duration > 0 ? formatTime(item.duration) : ""}</span>
      <span className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <IconButton label={`Add ${item.title} to the queue`} size="sm" onClick={() => addToQueue([item])}>
          <ListPlus size={16} />
        </IconButton>
      </span>
    </li>
  );
}

export function YouTubePage() {
  const status = useYtKey((s) => s.status);
  const browse = useBrowse((s) => s.browse);
  const setBrowse = useBrowse((s) => s.set);
  const navigate = useUi((s) => s.navigate);
  const [query, setQuery] = useState(browse?.kind === "search" ? browse.input : "");
  const [link, setLink] = useState(browse?.kind === "playlist" ? browse.input : "");
  const [busy, setBusy] = useState<"search" | "playlist" | "more" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!useYtKey.getState().status) void useYtKey.getState().load();
  }, []);

  const run = async (kind: "search" | "playlist", input: string, more = false) => {
    setBusy(more ? "more" : kind);
    setError(null);
    try {
      const page = more ? (browse?.nextPage ?? null) : null;
      const b = useBrowse.getState().browse;
      if (kind === "search") {
        const r = await backend().ytSearch(input, page);
        const items = more && b ? [...b.items, ...r.items] : r.items;
        setBrowse({ kind, input, title: `Results for "${input}"`, items, nextPage: r.nextPage, hidden: (more && b ? b.hidden : 0) + r.hidden });
      } else {
        const r = await backend().ytPlaylist(input, page);
        const items = more && b ? [...b.items, ...r.page.items] : r.page.items;
        setBrowse({ kind, input, title: r.title || "Playlist", items, nextPage: r.page.nextPage, hidden: (more && b ? b.hidden : 0) + r.page.hidden });
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const submit = (kind: "search" | "playlist") => (e: FormEvent) => {
    e.preventDefault();
    const v = (kind === "search" ? query : link).trim();
    if (v) void run(kind, v);
  };

  return (
    <div className="px-3 pb-10">
      <h1 className="text-3xl font-extrabold tracking-tight text-fg">YouTube</h1>
      <p className="mt-1 mb-6 max-w-2xl text-sm text-fg-2">
        Search YouTube and play songs right here in Vyro, with artwork colours, lyrics and your queue. Videos play through YouTube's official player in the
        now-playing panel.
      </p>

      {!status ? (
        <Spinner />
      ) : !status.hasKey ? (
        <div className="vy-elevated max-w-3xl rounded-vy p-5">
          <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-fg">
            <KeyRound size={18} /> Connect Vyro to YouTube
          </h2>
          <p className="mb-4 text-sm text-fg-2">
            Vyro searches YouTube with your own free YouTube Data API key. It takes a few minutes to set up once, and the free allowance covers about 100
            searches a day.
          </p>
          <YouTubeKeyForm />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            <form onSubmit={submit("search")} className="flex min-w-[18rem] flex-[2] gap-2" role="search">
              <div className="relative flex-1">
                <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" />
                <input
                  type="search"
                  aria-label="Search YouTube"
                  placeholder="Search songs, artists or albums on YouTube"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className={`${inputClass} pl-9`}
                />
              </div>
              <Button type="submit" variant="primary" loading={busy === "search"} disabled={!query.trim() || !!busy}>
                Search
              </Button>
            </form>
            <form onSubmit={submit("playlist")} className="flex min-w-[16rem] flex-1 gap-2">
              <input
                aria-label="YouTube playlist link"
                placeholder="Or paste a playlist link"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                className={inputClass}
              />
              <Button type="submit" icon={<ListMusic size={15} />} loading={busy === "playlist"} disabled={!link.trim() || !!busy}>
                Open
              </Button>
            </form>
          </div>

          {error && (
            <div className="mt-4">
              <ErrorBanner>{error}</ErrorBanner>
            </div>
          )}

          {browse && (
            <section className="mt-6" aria-label={browse.title}>
              <div className="mb-2 flex flex-wrap items-center gap-3">
                <h2 className="min-w-0 flex-1 truncate text-lg font-bold text-fg">{browse.title}</h2>
                {browse.items.length > 0 && (
                  <Button variant="primary" icon={<Play size={15} fill="currentColor" />} onClick={() => useYouTube.getState().playItems(browse.items, 0, browse.title)}>
                    Play all
                  </Button>
                )}
              </div>
              {browse.items.length === 0 ? (
                <p className="text-sm text-fg-3">Nothing that can play in Vyro was found.</p>
              ) : (
                <ul>
                  {browse.items.map((item, i) => (
                    <ResultRow key={`${item.videoId}-${i}`} item={item} index={i} items={browse.items} context={browse.title} />
                  ))}
                </ul>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-fg-3">
                {browse.nextPage && (
                  <Button variant="ghost" loading={busy === "more"} disabled={!!busy} onClick={() => run(browse.kind, browse.input, true)}>
                    Load more
                  </Button>
                )}
                {browse.hidden > 0 && <span>{plural(browse.hidden, "video")} left out because their owners don't allow playback outside YouTube.</span>}
              </div>
            </section>
          )}
        </>
      )}

      <div className="mt-10 max-w-2xl space-y-3 text-sm text-fg-2">
        <h2 className="flex items-center gap-2 font-bold text-fg">
          <Info size={16} /> Good to know
        </h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-fg">Ads.</strong> YouTube may show its ads in the player, as on any site with a YouTube video. Vyro Shield doesn't touch
            YouTube's player.
          </li>
          <li>
            YouTube's terms ask that its player stays visible while it plays, so it takes the place of the album art in the now-playing panel, or floats in a
            corner when the panel is closed.
          </li>
          <li>Some videos can't play outside YouTube because their owners turned that off. Vyro leaves them out of results and skips them in the queue.</li>
          <li>Each search uses about 1% of the free daily allowance of your key. Playlists and playback use almost none.</li>
          <li>
            Your likes, library and personal mixes live in your YouTube account. To use them, open the{" "}
            <button type="button" className="font-semibold text-accent hover:underline" onClick={() => navigate({ name: "ytm" })}>
              YouTube Music website
            </button>{" "}
            in its own Vyro window.
          </li>
        </ul>
        {status?.hasKey && (
          <Button variant="ghost" icon={<KeyRound size={15} />} onClick={() => navigate({ name: "settings", section: "youtube" })}>
            Change the API key
          </Button>
        )}
      </div>
    </div>
  );
}
