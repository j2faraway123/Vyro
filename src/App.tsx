import { useEffect, useRef, useState } from "react";
import { DynamicBackground } from "./components/background/DynamicBackground";
import { Spinner } from "./components/common/controls";
import { NewPlaylistHost, ShortcutsHelp, Toasts } from "./components/common/Overlays";
import { ScrollContext } from "./components/common/TrackList";
import { TrackMenu } from "./components/common/TrackMenu";
import { NowPlayingPanel } from "./components/layout/NowPlayingPanel";
import { PlaybackBar } from "./components/layout/PlaybackBar";
import { Sidebar } from "./components/layout/Sidebar";
import { TopBar } from "./components/layout/TopBar";
import { FullscreenLyrics } from "./components/lyrics/FullscreenLyrics";
import { useMediaSession } from "./hooks/useMediaSession";
import { useShortcuts } from "./hooks/useShortcuts";
import { errorMessage, loadBackend, setBackend, type Backend } from "./lib/backend";
import { applyTheme } from "./lib/theme";
import { AlbumPage, ArtistPage, FavoritesPage, PlaylistPage, PlaylistsPage, RecentPage } from "./pages/Collections";
import { Discover } from "./pages/Discover";
import { Library } from "./pages/Library";
import { Search } from "./pages/Search";
import { SettingsPage } from "./pages/settings/SettingsPage";
import { WebPage } from "./pages/Web";
import { YouTubePage } from "./pages/YouTube";
import { YouTubeMusicPage } from "./pages/YouTubeMusic";
import { useLibrary } from "./store/library";
import { usePlayer } from "./store/player";
import { useActiveTheme, useSettings } from "./store/settings";
import { useShield } from "./store/shield";
import { toast, useUi } from "./store/ui";

async function boot(b: Backend) {
  setBackend(b);
  const [settings, themes] = await Promise.all([b.settings(), b.themes().catch(() => [])]);
  useSettings.getState().init(settings.app, themes);
  await useLibrary.getState().refresh();
  usePlayer.getState().restore(settings.queue);
  useShield.getState().load();
  b.scanStatus().then((s) => s.running && useLibrary.getState().setScan(s));
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  b.subscribe((e) => {
    switch (e.type) {
      case "scan-progress":
        useLibrary.getState().setScan(e.payload);
        // Show newly imported tracks progressively during long scans.
        if (!refreshTimer && e.payload.running && e.payload.added > 0) {
          refreshTimer = setTimeout(() => {
            refreshTimer = null;
            useLibrary.getState().refresh();
          }, 4000);
        }
        break;
      case "library-changed": {
        useLibrary.getState().refresh();
        const p = e.payload as { added?: number; updated?: number; errors?: string[] } | null;
        if (p && typeof p.added === "number") {
          const errs = p.errors?.length ?? 0;
          toast(`Import finished: ${p.added} added, ${p.updated ?? 0} updated${errs ? `, ${errs} couldn't be read` : ""}`, errs ? "error" : "success");
        }
        break;
      }
      case "shield-changed":
        useShield.getState().setState(e.payload);
        break;
      case "shield-stats":
        useShield.getState().setWindows(e.payload);
        break;
      case "ytm-state":
        usePlayer.getState().setYtm(e.payload);
        break;
      case "files-dropped":
        useLibrary.getState().importDropped(e.payload);
        break;
    }
  });
}

function useThemeEffect() {
  const theme = useActiveTheme();
  const { accent, radius, density } = useSettings((s) => s.settings);
  useEffect(() => {
    applyTheme(theme, { accent, radius: radius ?? undefined, density: density ?? undefined });
  }, [theme, accent, radius, density]);
}

function Page() {
  const route = useUi((s) => s.route);
  switch (route.name) {
    case "discover":
      return <Discover />;
    case "search":
      return <Search q={route.q} />;
    case "library":
      return <Library tab={route.tab} />;
    case "album":
      return <AlbumPage albumKey={route.key} />;
    case "artist":
      return <ArtistPage artist={route.artist} />;
    case "favorites":
      return <FavoritesPage />;
    case "playlists":
      return <PlaylistsPage />;
    case "playlist":
      return <PlaylistPage id={route.id} />;
    case "recent":
      return <RecentPage />;
    case "web":
      return <WebPage />;
    case "ytm":
      return <YouTubeMusicPage />;
    case "youtube":
      return <YouTubePage />;
    case "settings":
      return <SettingsPage section={route.section} />;
  }
}

function Shell() {
  useThemeEffect();
  useShortcuts();
  useMediaSession();
  const { sidebar, rightPanel } = useSettings((s) => s.settings);
  const route = useUi((s) => s.route);
  const [scroller, setScroller] = useState<HTMLElement | null>(null);
  const main = useRef<HTMLElement | null>(null);

  useEffect(() => {
    main.current?.scrollTo({ top: 0 });
  }, [route]);

  const left = sidebar === "hidden" ? "" : sidebar === "collapsed" ? "76px " : "clamp(220px,17vw,272px) ";
  const right = rightPanel ? " clamp(300px,24vw,380px)" : "";

  return (
    <div className="relative h-full">
      <DynamicBackground />
      <div
        className="relative z-10 grid h-full gap-2 p-2"
        style={{ gridTemplateColumns: `${left}minmax(0,1fr)${right}`, gridTemplateRows: "minmax(0,1fr) auto" }}
      >
        {sidebar !== "hidden" && <Sidebar />}
        <main
          ref={(el) => {
            main.current = el;
            setScroller(el);
          }}
          className="vy-panel vy-scroll relative min-h-0"
          aria-label="Content"
        >
          <TopBar />
          <ScrollContext.Provider value={scroller}>
            <div key={route.name === "settings" ? "settings" : JSON.stringify(route)} className="vy-enter px-3 pb-10">
              <Page />
            </div>
          </ScrollContext.Provider>
        </main>
        {rightPanel && <NowPlayingPanel />}
        <div style={{ gridColumn: "1 / -1" }}>
          <PlaybackBar />
        </div>
      </div>
      <TrackMenu />
      <NewPlaylistHost />
      <ShortcutsHelp />
      <FullscreenLyrics />
      <Toasts />
    </div>
  );
}

export default function App() {
  const [state, setState] = useState<"loading" | "ready" | { error: string }>("loading");
  useEffect(() => {
    loadBackend()
      .then(boot)
      .then(() => setState("ready"))
      .catch((e) => setState({ error: errorMessage(e) }));
  }, []);

  if (state === "loading")
    return (
      <div className="flex h-full items-center justify-center bg-bg">
        <Spinner size={28} />
      </div>
    );
  if (typeof state === "object")
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-bg p-8 text-center">
        <h1 className="text-xl font-bold text-fg">Vyro couldn't start</h1>
        <p className="max-w-md text-sm text-fg-2">{state.error}</p>
      </div>
    );
  return <Shell />;
}
