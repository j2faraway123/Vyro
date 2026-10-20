import { CirclePlay, Info, RotateCw, ShieldAlert, ShieldOff, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { Button, IconButton } from "../components/common/controls";
import { ErrorBanner } from "../components/common/EmptyState";
import { backend, errorMessage, type YtmBounds, type YtmMode } from "../lib/backend";
import { plural } from "../lib/format";
import { useShield } from "../store/shield";
import { useUi } from "../store/ui";

/** Set by debug builds for the automated embedding check (e2e/ytm-embed-check.ps1). */
export const e2eYtm = typeof location !== "undefined" && location.hash === "#e2e-ytm";

/** Whether YouTube Music is open, and how. It survives page changes. */
export const useYtmEmbed = create<{ mode: YtmMode | null; setMode: (m: YtmMode | null) => void }>((set) => ({
  mode: null,
  setMode: (mode) => set({ mode }),
}));

const same = (a: YtmBounds | null, b: YtmBounds | null) =>
  a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height);

/**
 * Sizes `el` to fill the rest of the content panel and, while `active`, keeps
 * the native YouTube Music webview lined up with it: clips the page to the visible part of
 * the panel, and hides it while one of Vyro's own overlays is open (a native
 * webview always draws above the app's HTML).
 */
function useEmbedBounds(el: HTMLDivElement | null, active: boolean) {
  const covered = useUi((s) => s.fullscreenLyrics || s.shortcutsOpen || !!s.trackMenu || !!s.newPlaylist);
  useEffect(() => {
    if (!el) return;
    let raf = 0;
    let last: YtmBounds | null = null;
    let sent = false;
    const send = (b: YtmBounds | null) => {
      if (sent && same(b, last)) return;
      last = b;
      sent = true;
      backend()
        .ytmSetBounds(b)
        .catch(() => {});
    };
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const main = el.closest("main");
      if (!main) return;
      const m = main.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const topInContent = r.top - m.top + main.scrollTop;
      const height = Math.max(320, Math.floor(main.clientHeight - topInContent - 12));
      if (Math.abs(el.offsetHeight - height) > 1) el.style.height = `${height}px`;
      if (!active) return;
      if (covered) return send(null);
      const bar = main.querySelector<HTMLElement>("[data-topbar]")?.getBoundingClientRect();
      const top = Math.max(r.top, bar ? bar.bottom : m.top, m.top);
      const bottom = Math.min(r.bottom, m.bottom);
      const left = Math.max(r.left, m.left);
      const right = Math.min(r.right, m.right);
      send(
        bottom - top < 24 || right - left < 24
          ? null
          : { x: Math.round(left), y: Math.round(top), width: Math.round(right - left), height: Math.round(bottom - top) },
      );
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (active)
        backend()
          .ytmSetBounds(null)
          .catch(() => {});
    };
  }, [el, active, covered]);
}

function ShieldChip() {
  const shield = useShield((s) => s.state);
  const navigate = useUi((s) => s.navigate);
  const on = !!shield?.config.enabled && !!shield.config.youtubeMusic;
  const blocked = shield?.windows.find((w) => w.label === "ytm")?.blocked ?? 0;
  return (
    <button
      type="button"
      onClick={() => navigate({ name: "settings", section: "shield" })}
      title={
        on
          ? "Vyro Shield blocks ad requests and banners here. Ads inside the music stream will probably still play."
          : "Vyro Shield is off for YouTube Music, so ads play as on the website."
      }
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
        on ? "bg-amber-400/15 text-amber-700 hover:bg-amber-400/25 dark:text-amber-300" : "bg-fg/8 text-fg-2 hover:bg-fg/12"
      }`}
    >
      {on ? <ShieldAlert size={14} /> : <ShieldOff size={14} />}
      {on ? `Shield on${blocked > 0 ? ` · ${plural(blocked, "block")}` : ""}` : "Shield off"}
    </button>
  );
}

function GoodToKnow() {
  return (
    <ul className="list-disc space-y-2 pl-5 text-sm text-fg-2">
      <li>
        <strong className="text-fg">Ads.</strong> By default, Vyro Shield leaves YouTube Music alone, so ads play as on the website. A YouTube Music Premium
        subscription removes them. If you opt in to filtering in Shield settings, Shield blocks ad requests and banners here, but it never touches the music stream
        itself, so audio ads between songs will probably still play. Filtering goes against YouTube's terms and may break when YouTube changes its site.
      </li>
      <li>Songs play through YouTube Music itself. Vyro doesn't download, save or record anything, and YouTube songs don't go into your local library.</li>
      <li>
        YouTube Music keeps playing when you go to another page in Vyro. Its queue, likes and playlists are managed in the YouTube Music page. Playing a local
        track pauses it.
      </li>
      <li>Google sometimes refuses sign-in inside embedded browsers. If that happens, YouTube Music still plays without signing in.</li>
      <li>Lyrics are looked up on LRCLIB by title and artist when online lyrics are on.</li>
    </ul>
  );
}

export function YouTubeMusicPage() {
  const { mode, setMode } = useYtmEmbed();
  const open = mode !== null;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState(false);
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  const preview = backend().isPreview;
  const starting = useRef(false);
  useEmbedBounds(frame, mode === "embedded");

  const start = async () => {
    if (!frame || starting.current) return;
    starting.current = true;
    setBusy(true);
    setError(null);
    const r = frame.getBoundingClientRect();
    try {
      setMode(await backend().ytmOpen({ x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      starting.current = false;
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!e2eYtm || !frame || open) return;
    const t = setTimeout(() => {
      start().then(() => setTimeout(() => backend().ytmControl("toggle").catch(() => {}), 8000));
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame]);

  const close = async () => {
    try {
      await backend().ytmClose();
      setMode(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <div className="px-3">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-3xl font-extrabold tracking-tight text-fg">YouTube Music</h1>
        <ShieldChip />
        <IconButton label={info ? "Hide notes" : "Good to know"} active={info} size="sm" onClick={() => setInfo((v) => !v)}>
          <Info size={16} />
        </IconButton>
        {open && (
          <>
            <IconButton label="Reload YouTube Music" size="sm" onClick={() => backend().ytmReload().catch((e) => setError(errorMessage(e)))}>
              <RotateCw size={16} />
            </IconButton>
            <IconButton label="Close YouTube Music (stops playback)" size="sm" onClick={close}>
              <X size={16} />
            </IconButton>
          </>
        )}
      </div>
      {error && (
        <div className="mb-3">
          <ErrorBanner>{error}</ErrorBanner>
        </div>
      )}
      {info && open && (
        <div className="vy-elevated mb-3 rounded-vy p-4">
          <GoodToKnow />
        </div>
      )}

      <div ref={setFrame} className="vy-elevated relative overflow-hidden rounded-vy" style={{ height: 480 }}>
        {mode === "embedded" ? (
          <div className="flex h-full items-center justify-center text-sm text-fg-3">Loading YouTube Music…</div>
        ) : mode === "window" ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
            <CirclePlay size={44} className="shrink-0 text-accent" />
            <p className="max-w-lg text-sm text-fg-2">
              On Linux, YouTube Music opens in its own window, because embedding it in this page isn't supported there. Vyro's playback bar, background and lyrics
              still follow it.
            </p>
            <Button variant="primary" icon={<CirclePlay size={16} />} onClick={start}>
              Show YouTube Music
            </Button>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-5 overflow-auto p-8 text-center">
            <CirclePlay size={44} className="shrink-0 text-accent" />
            <div className="max-w-xl">
              <p className="text-lg font-bold text-fg">Play YouTube Music inside Vyro</p>
              <p className="mt-1 text-sm text-fg-2">
                Sign in and play anything from your account right here. Vyro's playback bar, background, lyrics and media keys follow what's playing.
              </p>
            </div>
            <Button variant="primary" icon={<CirclePlay size={16} />} onClick={start} disabled={busy || preview}>
              Open YouTube Music
            </Button>
            {preview && <span className="text-sm text-fg-3">Available in the desktop app.</span>}
            <div className="max-w-2xl text-left">
              <GoodToKnow />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

