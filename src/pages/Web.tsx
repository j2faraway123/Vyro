import { ExternalLink, Globe, Info, Settings2, ShieldAlert, ShieldCheck, ShieldOff, X } from "lucide-react";
import { useState } from "react";
import { Button, IconButton, Toggle } from "../components/common/controls";
import { ErrorBanner } from "../components/common/EmptyState";
import { inputClass } from "../components/common/Overlays";
import { backend, errorMessage } from "../lib/backend";
import { plural } from "../lib/format";
import { useShield } from "../store/shield";
import { useUi } from "../store/ui";

const SUGGESTIONS = ["bandcamp.com", "soundcloud.com", "archive.org/details/audio", "radio.garden"];

export function ShieldStatusCard() {
  const { state, setConfig } = useShield();
  const navigate = useUi((s) => s.navigate);
  if (!state) return null;
  const on = state.config.enabled;
  const ready = state.engine.ready;
  const status = !on ? "Protection is off" : !ready ? "On, but no rules are loaded yet" : "Protection is on";
  return (
    <div className="vy-elevated flex items-center gap-4 rounded-vy p-5" role="status" aria-live="polite">
      <div className={`flex h-12 w-12 items-center justify-center rounded-full ${on && ready ? "bg-accent/20 text-accent" : on ? "bg-amber-400/20 text-amber-600 dark:text-amber-300" : "bg-fg/8 text-fg-3"}`}>
        {on && ready ? <ShieldCheck size={24} /> : on ? <ShieldAlert size={24} /> : <ShieldOff size={24} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-bold text-fg">Vyro Shield · {status}</div>
        <div className="mt-0.5 text-sm text-fg-2">
          {on && ready
            ? `${state.engine.networkRules.toLocaleString()} network and ${state.engine.cosmeticRules.toLocaleString()} cosmetic ${state.engine.cosmeticRules === 1 ? "rule" : "rules"} active in Vyro web windows${state.platform.networkBlocking ? "" : " (element hiding only on this platform)"}.`
            : on
              ? "Download filter lists (or add your own rules) in Shield settings to start blocking."
              : "Ads and trackers in Vyro web windows are not filtered."}
          {state.totalBlocked > 0 && ` ${plural(state.totalBlocked, "request")} blocked this session.`}
        </div>
      </div>
      <Button variant="ghost" icon={<Settings2 size={15} />} onClick={() => navigate({ name: "settings", section: "shield" })}>
        Settings
      </Button>
      <Toggle label="Vyro Shield" checked={on} onChange={(v) => setConfig({ enabled: v })} disabled={backend().isPreview} />
    </div>
  );
}

export function WebPage() {
  const state = useShield((s) => s.state);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const open = async (target: string) => {
    if (!target.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await backend().webOpen(target);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-3">
      <h1 className="text-3xl font-extrabold tracking-tight text-fg">Web</h1>
      <p className="mt-1 mb-6 max-w-2xl text-sm text-fg-2">
        Open music sites (stores, blogs, radio directories) in a separate Vyro web window. Vyro Shield filters ads and trackers there when it's on. Your local library and playback never go through Shield.
      </p>

      <ShieldStatusCard />

      <form
        className="mt-6 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          open(url);
        }}
      >
        <div className="relative flex-1">
          <Globe size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-fg-3" />
          <input className={`${inputClass} rounded-full pl-10`} placeholder="Enter a web address, e.g. bandcamp.com" aria-label="Web address" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <Button type="submit" variant="primary" icon={<ExternalLink size={15} />} loading={busy} disabled={!url.trim()}>
          Open
        </Button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" onClick={() => open(s)} className="rounded-full bg-fg/6 px-3 py-1 text-xs font-semibold text-fg-2 hover:bg-fg/12 hover:text-fg">
            {s}
          </button>
        ))}
      </div>
      {error && (
        <div className="mt-4">
          <ErrorBanner>{error}</ErrorBanner>
        </div>
      )}

      <h2 className="mt-10 mb-3 text-lg font-bold text-fg">Open web windows</h2>
      {state?.windows.length ? (
        <ul className="space-y-2">
          {state.windows.map((w) => (
            <li key={w.label} className="vy-elevated rounded-vy p-4">
              <div className="flex items-center gap-3">
                <Globe size={16} className="text-fg-2" />
                <button type="button" className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-fg hover:underline" onClick={() => backend().webFocus(w.label)}>
                  {w.url || "Loading…"}
                </button>
                {(state.platform.blockCounts || w.blocked > 0) && (
                  <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-bold text-accent">{plural(w.blocked, "blocked request")}</span>
                )}
                <IconButton label="Close window" size="sm" onClick={() => backend().webClose(w.label)}>
                  <X size={15} />
                </IconButton>
              </div>
              {w.recent.length > 0 && (
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer text-fg-3">Recently blocked</summary>
                  <ul className="vy-scroll mt-2 max-h-40 space-y-1">
                    {w.recent.map((r, i) => (
                      <li key={i} className="truncate text-fg-3" title={r.url}>
                        <span className="mr-2 rounded bg-fg/8 px-1.5 py-px font-semibold text-fg-2">{r.requestType}</span>
                        {r.url}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg-3">No web windows are open.</p>
      )}

      <div className="mt-10 flex gap-3 rounded-vy border border-line bg-fg/4 p-4 text-sm text-fg-2">
        <Info size={18} className="mt-0.5 shrink-0" />
        <div className="space-y-1.5">
          <p className="font-semibold text-fg">What Vyro Shield can and can't do</p>
          <p>It blocks requests that match your filter lists inside Vyro web windows and hides matching page elements. {state?.platform.note}</p>
          <p>
            It can't remove every ad. It never touches audio or video streams, sign-in, DRM or paid-subscription checks, so it won't remove ads that a streaming service plays inside its own
            player. If a site breaks, add it to the allowlist or switch Shield off.
          </p>
        </div>
      </div>
    </div>
  );
}
