import { AlertTriangle, Plus, RefreshCw, RotateCcw, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, IconButton, Spinner, Toggle } from "../../components/common/controls";
import { ErrorBanner } from "../../components/common/EmptyState";
import { inputClass } from "../../components/common/Overlays";
import { backend, errorMessage } from "../../lib/backend";
import { formatBytes, relativeTime } from "../../lib/format";
import type { ShieldDecision } from "../../lib/types";
import { useShield } from "../../store/shield";
import { toast } from "../../store/ui";
import { ShieldStatusCard } from "../Web";
import { Group, Row, Section } from "./common";

const CATEGORY: Record<string, string> = { ads: "Ads", privacy: "Trackers", annoyances: "Annoyances", custom: "Custom" };

function Allowlist() {
  const { state, setConfig } = useShield();
  const [value, setValue] = useState("");
  if (!state) return null;
  const add = () => {
    const v = value.trim();
    if (!v) return;
    setConfig({ allowlist: [...state.config.allowlist, v] });
    setValue("");
  };
  return (
    <Group title="Allowlist">
      <div className="p-4">
        <p className="mb-3 text-xs text-fg-2">Shield is fully disabled on these sites and their subdomains. Use this when a site stops working.</p>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input className={inputClass} placeholder="example.com" aria-label="Domain to allow" value={value} onChange={(e) => setValue(e.target.value)} />
          <Button type="submit" icon={<Plus size={15} />} disabled={!value.trim()}>
            Add
          </Button>
        </form>
        <ul className="mt-3 flex flex-wrap gap-2">
          {state.config.allowlist.map((d) => (
            <li key={d} className="flex items-center gap-1 rounded-full bg-fg/8 py-1 pr-1 pl-3 text-sm text-fg">
              {d}
              <IconButton label={`Remove ${d}`} size="sm" className="h-6 w-6" onClick={() => setConfig({ allowlist: state.config.allowlist.filter((x) => x !== d) })}>
                <X size={13} />
              </IconButton>
            </li>
          ))}
          {!state.config.allowlist.length && <li className="text-xs text-fg-3">No sites allowlisted.</li>}
        </ul>
      </div>
    </Group>
  );
}

function CustomRules() {
  const { state, setConfig } = useShield();
  const [text, setText] = useState(state?.config.customRules ?? "");
  useEffect(() => setText(state?.config.customRules ?? ""), [state?.config.customRules]);
  if (!state) return null;
  const dirty = text !== state.config.customRules;
  return (
    <Group title="My filters">
      <div className="p-4">
        <p className="mb-3 text-xs text-fg-2">
          One rule per line in Adblock Plus syntax, for example <code className="rounded bg-fg/8 px-1">||ads.example.com^</code>, <code className="rounded bg-fg/8 px-1">example.org##.banner</code> or{" "}
          <code className="rounded bg-fg/8 px-1">@@||cdn.example.com^</code> to allow.
        </p>
        <textarea
          className={`${inputClass} h-32 resize-y py-2 font-mono text-xs`}
          spellCheck={false}
          aria-label="Custom filter rules"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="! My rules"
        />
        <div className="mt-2 flex justify-end">
          <Button variant="primary" disabled={!dirty} onClick={() => setConfig({ customRules: text })}>
            Save rules
          </Button>
        </div>
      </div>
    </Group>
  );
}

function Tester() {
  const [url, setUrl] = useState("https://");
  const [page, setPage] = useState("https://");
  const [type, setType] = useState("script");
  const [result, setResult] = useState<ShieldDecision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setError(null);
    try {
      setResult(await backend().shieldTest(url, page, type));
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <Group title="Test a request">
      <div className="space-y-2 p-4">
        <p className="text-xs text-fg-2">Check what Shield would do with a request, using your current lists and settings.</p>
        <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-2">
          <input className={inputClass} aria-label="Request URL" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Request URL" />
          <input className={inputClass} aria-label="Page URL" value={page} onChange={(e) => setPage(e.target.value)} placeholder="Page URL" />
          <select aria-label="Request type" value={type} onChange={(e) => setType(e.target.value)} className="h-10 rounded-vy-sm border border-line bg-fg/6 px-2 text-sm text-fg">
            {["script", "image", "stylesheet", "xmlhttprequest", "subdocument", "media", "font", "ping", "other"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <Button onClick={run}>Test</Button>
        </div>
        {result && (
          <p className={`text-sm font-semibold ${result.blocked ? "text-red-600 dark:text-red-300" : "text-emerald-600 dark:text-emerald-300"}`}>
            {result.blocked ? "Blocked" : "Allowed"}: {result.reason}
          </p>
        )}
        {error && <ErrorBanner>{error}</ErrorBanner>}
      </div>
    </Group>
  );
}

export function ShieldSection() {
  const { state, updating, lastErrors, setConfig, updateLists, setState } = useShield();
  const [listName, setListName] = useState("");
  const [listUrl, setListUrl] = useState("");
  const preview = backend().isPreview;

  if (!state)
    return (
      <Section title="Vyro Shield">
        <Spinner />
      </Section>
    );
  const cfg = state.config;
  const addList = async () => {
    try {
      setState(await backend().shieldAddList(listName, listUrl));
      setListName("");
      setListUrl("");
      toast("List added. Download it with Update.", "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  return (
    <Section
      title="Vyro Shield"
      description="Optional ad and tracker blocking for pages you open in Vyro web windows (the Web page), and for the YouTube Music window if you opt in below. It never filters your local music, the app itself, or audio and video streams."
    >
      <ShieldStatusCard />
      {preview && <ErrorBanner>Shield settings need the desktop app. The browser preview can't filter requests.</ErrorBanner>}
      {!state.platform.networkBlocking && !preview && (
        <ErrorBanner>
          <AlertTriangle size={14} className="mr-1 inline" /> {state.platform.note}
        </ErrorBanner>
      )}

      <Group title="Protection">
        <Row label="Block ads and trackers" hint="Master switch. Turn it off any time a site misbehaves.">
          <Toggle label="Vyro Shield" checked={cfg.enabled} onChange={(v) => setConfig({ enabled: v })} disabled={preview} />
        </Row>
        <Row label="Third-party tracker protection" hint="Enables tracker lists such as EasyPrivacy.">
          <Toggle label="Tracker protection" checked={cfg.trackerProtection} onChange={(v) => setConfig({ trackerProtection: v })} disabled={preview} />
        </Row>
        <Row label="Hide ad elements" hint="Cosmetic filtering: hides leftover ad slots on pages using the lists' element rules.">
          <Toggle label="Hide ad elements" checked={cfg.cosmeticFiltering} onChange={(v) => setConfig({ cosmeticFiltering: v })} disabled={preview} />
        </Row>
        <Row label="Block pop-up windows" hint="Allowlisted sites can still open pop-ups (useful for sign-in windows).">
          <Toggle label="Block pop-ups" checked={cfg.blockPopups} onChange={(v) => setConfig({ blockPopups: v })} disabled={preview} />
        </Row>
      </Group>

      <Group title="YouTube Music">
        <Row
          label="Also filter the YouTube Music window"
          hint="Off by default. Uses the same lists to refuse ad requests and hide ad banners there. Ads that YouTube plays inside the music stream will probably still play, because Shield never touches audio or video streams."
        >
          <Toggle label="Filter YouTube Music" checked={cfg.youtubeMusic} onChange={(v) => setConfig({ youtubeMusic: v })} disabled={preview} />
        </Row>
        {cfg.youtubeMusic && (
          <ErrorBanner>
            <AlertTriangle size={14} className="mr-1 inline" /> Blocking ads on YouTube Music goes against YouTube's terms of service, and YouTube changes its site often,
            so songs may stop loading or sign-in may fail. If that happens, switch this off or add music.youtube.com to the allowlist. Changes apply straight away; reload the
            YouTube Music window if a page is half loaded.
          </ErrorBanner>
        )}
      </Group>

      <Group
        title="Filter lists"
        aside={
          <Button className="h-8 text-xs" icon={<RefreshCw size={14} className={updating ? "animate-spin" : ""} />} onClick={() => updateLists(true)} disabled={updating || preview}>
            {updating ? "Updating…" : "Update all"}
          </Button>
        }
      >
        {state.config.lists.map((l) => {
          const st = state.statuses[l.id];
          const inactive = l.category === "privacy" && !cfg.trackerProtection;
          return (
            <div key={l.id} className="flex items-start gap-4 px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-fg">{l.name}</span>
                  <span className="rounded-full bg-fg/8 px-2 py-px text-[11px] font-semibold text-fg-2">{CATEGORY[l.category] ?? l.category}</span>
                </div>
                <div className="mt-0.5 truncate text-xs text-fg-3" title={l.url}>
                  {l.url}
                </div>
                <div className="mt-1 text-xs text-fg-2">
                  {st?.downloaded ? `Updated ${st.updatedAt ? relativeTime(st.updatedAt) : "?"} · ${st.rules.toLocaleString()} rules · ${formatBytes(st.bytes)}` : "Not downloaded yet"}
                  {" · "}License: {l.license}
                  {inactive && " · inactive while tracker protection is off"}
                </div>
                {st?.error && <div className="mt-1 text-xs font-semibold text-red-600 dark:text-red-300">{st.error}</div>}
              </div>
              <IconButton label={`Update ${l.name}`} size="sm" onClick={() => updateLists(true, l.id)} disabled={updating || preview}>
                <RefreshCw size={15} />
              </IconButton>
              {!l.builtin && (
                <IconButton
                  label={`Remove ${l.name}`}
                  size="sm"
                  onClick={async () => {
                    try {
                      setState(await backend().shieldRemoveList(l.id));
                    } catch (e) {
                      toast(errorMessage(e), "error");
                    }
                  }}
                >
                  <Trash2 size={15} />
                </IconButton>
              )}
              <Toggle
                label={`Use ${l.name}`}
                checked={l.enabled}
                disabled={preview}
                onChange={(v) => setConfig({ lists: cfg.lists.map((x) => (x.id === l.id ? { ...x, enabled: v } : x)) })}
              />
            </div>
          );
        })}
        <form
          className="flex gap-2 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            addList();
          }}
        >
          <input className={`${inputClass} max-w-48`} placeholder="Name (optional)" aria-label="List name" value={listName} onChange={(e) => setListName(e.target.value)} />
          <input className={inputClass} placeholder="https://example.com/filters.txt" aria-label="List URL" value={listUrl} onChange={(e) => setListUrl(e.target.value)} />
          <Button type="submit" icon={<Plus size={15} />} disabled={!listUrl.trim() || preview} className="shrink-0 whitespace-nowrap">
            Add list
          </Button>
        </form>
        {lastErrors.length > 0 && (
          <div className="p-4 pt-0">
            <ErrorBanner>
              <strong>Some lists couldn't be updated.</strong> Lists downloaded earlier keep working.
              <ul className="mt-1 list-disc pl-5">
                {lastErrors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </ErrorBanner>
          </div>
        )}
      </Group>

      <Allowlist />
      <CustomRules />
      <Tester />

      <div className="flex justify-end">
        <Button
          variant="ghost"
          icon={<RotateCcw size={14} />}
          disabled={preview}
          onClick={async () => {
            try {
              setState(await backend().shieldReset());
              toast("Shield settings reset", "success");
            } catch (e) {
              toast(errorMessage(e), "error");
            }
          }}
        >
          Reset Shield settings
        </Button>
      </div>
    </Section>
  );
}
