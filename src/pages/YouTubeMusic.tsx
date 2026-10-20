import { CirclePlay, Info, Pause, Play, Settings2, ShieldAlert, ShieldOff, SkipBack, SkipForward, X } from "lucide-react";
import { useState } from "react";
import { Artwork } from "../components/common/Artwork";
import { Button, IconButton } from "../components/common/controls";
import { ErrorBanner } from "../components/common/EmptyState";
import { backend, errorMessage } from "../lib/backend";
import { formatTime, plural } from "../lib/format";
import { usePlayer } from "../store/player";
import { useShield } from "../store/shield";
import { useUi } from "../store/ui";

export function YouTubeMusicPage() {
  const ytm = usePlayer((s) => s.ytm);
  const track = usePlayer((s) => s.ytmTrack);
  const source = usePlayer((s) => s.source);
  const position = usePlayer((s) => s.position);
  const { toggle, next, prev } = usePlayer.getState();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const preview = backend().isPreview;
  const shield = useShield((s) => s.state);
  const navigate = useUi((s) => s.navigate);
  const shieldOn = !!shield?.config.enabled && !!shield.config.youtubeMusic;
  const blocked = shield?.windows.find((w) => w.label === "ytm")?.blocked ?? 0;

  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      await backend().ytmOpen();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const active = source === "ytm" && ytm;

  return (
    <div className="px-3">
      <h1 className="text-3xl font-extrabold tracking-tight text-fg">YouTube Music</h1>
      <p className="mt-1 mb-6 max-w-2xl text-sm text-fg-2">
        Sign in to YouTube Music in its own Vyro window and play anything from your account. While it plays, Vyro shows the song with its artwork colours,
        lyrics and controls, and your media keys control it.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" icon={<CirclePlay size={16} />} onClick={open} disabled={busy || preview}>
          {ytm ? "Show YouTube Music" : "Open YouTube Music"}
        </Button>
        {ytm && (
          <Button variant="ghost" icon={<X size={15} />} onClick={() => backend().ytmClose().catch((e) => setError(errorMessage(e)))}>
            Close window
          </Button>
        )}
        {preview && <span className="text-sm text-fg-3">Available in the desktop app.</span>}
      </div>
      {error && (
        <div className="mt-4">
          <ErrorBanner>{error}</ErrorBanner>
        </div>
      )}

      {track && ytm && (
        <div className="vy-elevated mt-6 flex items-center gap-4 rounded-vy p-4">
          <Artwork src={track.artwork} className="h-20 w-20 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold tracking-wider text-fg-3 uppercase">{active ? "Now playing" : "Paused in YouTube Music"}</div>
            <div className="truncate text-lg font-bold text-fg">{track.title}</div>
            <div className="truncate text-sm text-fg-2">{[track.artist, track.album].filter(Boolean).join(" · ")}</div>
            {active && ytm.duration > 0 && (
              <div className="mt-1 text-xs text-fg-3 tabular-nums">
                {formatTime(position)} / {formatTime(ytm.duration)}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            <IconButton label="Previous" onClick={() => (active ? prev() : backend().ytmControl("prev"))}>
              <SkipBack size={18} />
            </IconButton>
            <IconButton label={ytm.playing ? "Pause" : "Play"} onClick={() => (active ? toggle() : backend().ytmControl("toggle"))}>
              {ytm.playing ? <Pause size={20} /> : <Play size={20} />}
            </IconButton>
            <IconButton label="Next" onClick={() => (active ? next() : backend().ytmControl("next"))}>
              <SkipForward size={18} />
            </IconButton>
          </div>
        </div>
      )}

      <div className="vy-elevated mt-6 flex items-center gap-4 rounded-vy p-4">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${shieldOn ? "bg-amber-400/20 text-amber-600 dark:text-amber-300" : "bg-fg/8 text-fg-3"}`}>
          {shieldOn ? <ShieldAlert size={20} /> : <ShieldOff size={20} />}
        </div>
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-bold text-fg">{shieldOn ? "Vyro Shield is filtering this window" : "Vyro Shield is off for YouTube Music"}</div>
          <div className="mt-0.5 text-fg-2">
            {shieldOn
              ? `Ad requests and ad banners are blocked where your lists match. Ads inside the music stream will probably still play.${blocked > 0 ? ` ${plural(blocked, "request")} blocked.` : ""}`
              : shield?.config.youtubeMusic
                ? "The YouTube Music option is on, but Shield's master switch is off."
                : "Ads play as they do on the website. You can opt in to filtering in Shield settings."}
          </div>
        </div>
        <Button variant="ghost" icon={<Settings2 size={15} />} onClick={() => navigate({ name: "settings", section: "shield" })}>
          Shield settings
        </Button>
      </div>

      <div className="mt-8 max-w-2xl space-y-3 text-sm text-fg-2">
        <h2 className="flex items-center gap-2 font-bold text-fg">
          <Info size={16} /> Good to know
        </h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-fg">Ads.</strong> By default, Vyro Shield leaves the YouTube Music window alone, so ads play as on the website. A YouTube Music
            Premium subscription removes them. If you opt in to filtering, Shield blocks ad requests and banners there, but it never touches the music stream itself,
            so audio ads between songs will probably still play. Filtering goes against YouTube's terms and may break when YouTube changes its site.
          </li>
          <li>Songs play through YouTube Music itself. Vyro doesn't download, save or record anything, and YouTube songs don't go into your local library.</li>
          <li>The queue, likes and playlists are managed in the YouTube Music window. Playing a local track pauses YouTube Music.</li>
          <li>Google sometimes refuses sign-in inside embedded browsers. If that happens, YouTube Music still plays without signing in.</li>
          <li>Lyrics are looked up on LRCLIB by title and artist when online lyrics are on.</li>
        </ul>
      </div>
    </div>
  );
}
