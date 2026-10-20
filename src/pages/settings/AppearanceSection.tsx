import { Check, Download, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { Button, IconButton, Segmented, Slider, Toggle } from "../../components/common/controls";
import { ErrorBanner } from "../../components/common/EmptyState";
import { backend, errorMessage } from "../../lib/backend";
import { exportTheme, validateTheme, type VyroTheme } from "../../lib/theme";
import { allThemes, useActiveTheme, useSettings } from "../../store/settings";
import { toast } from "../../store/ui";
import { ColorInput, Group, Row, Section } from "./common";

const ACCENTS = ["#FF7A59", "#F43F5E", "#E879F9", "#8B5CF6", "#6366F1", "#38BDF8", "#2DD4BF", "#4ADE80", "#FACC15", "#F5F5F5"];

function ThemeCard({ theme, active, onSelect, onDelete }: { theme: VyroTheme; active: boolean; onSelect: () => void; onDelete?: () => void }) {
  const c = theme.colors;
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        className={`w-full overflow-hidden rounded-vy border-2 text-left transition-all ${active ? "border-accent" : "border-transparent hover:border-line"}`}
      >
        <div className="flex h-24 gap-1.5 p-2" style={{ background: c.background }}>
          <div className="w-1/4 rounded-md" style={{ background: c.panel }} />
          <div className="flex flex-1 flex-col gap-1.5 rounded-md p-2" style={{ background: c.panel }}>
            <div className="h-2 w-2/3 rounded-full" style={{ background: c.textPrimary }} />
            <div className="h-2 w-1/2 rounded-full" style={{ background: c.textSecondary }} />
            <div className="mt-auto flex gap-1">
              <div className="h-4 w-4 rounded-full" style={{ background: c.accent }} />
              <div className="h-4 flex-1 rounded-full" style={{ background: c.elevated }} />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between bg-fg/5 px-3 py-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-fg">{theme.name}</div>
            <div className="truncate text-xs text-fg-3">
              {theme.mode === "dark" ? "Dark" : "Light"}
              {theme.author ? ` · ${theme.author}` : ""}
            </div>
          </div>
          {active && <Check size={16} className="text-accent" />}
        </div>
      </button>
      {onDelete && (
        <IconButton label={`Delete ${theme.name}`} size="sm" onClick={onDelete} className="absolute top-2 right-2 bg-black/50 text-white opacity-0 group-hover:opacity-100">
          <Trash2 size={14} />
        </IconButton>
      )}
    </div>
  );
}

export function AppearanceSection() {
  const { settings, update, customThemes, installTheme, removeTheme } = useSettings();
  const theme = useActiveTheme();
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const accent = settings.accent ?? theme.colors.accent;

  const doImport = async () => {
    setImportErrors([]);
    try {
      const text = await backend().openThemeFile();
      if (text === null) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        setImportErrors([`The file isn't valid JSON: ${errorMessage(e)}`]);
        return;
      }
      const { theme: t, errors } = validateTheme(parsed);
      if (!t) {
        setImportErrors(errors);
        return;
      }
      await installTheme(t);
      update({ themeId: t.id, accent: null, radius: null, density: null });
      if (t.background) update((s) => ({ background: { ...s.background, ...t.background } }));
      toast(`Installed theme "${t.name}"`, "success");
    } catch (e) {
      setImportErrors([errorMessage(e)]);
    }
  };

  const doExport = async () => {
    const name = `${theme.name}${settings.accent || settings.radius !== null || settings.density ? " (custom)" : ""}`;
    const json = exportTheme(theme, {
      accent: settings.accent,
      radius: settings.radius ?? undefined,
      density: settings.density ?? undefined,
      background: settings.background,
      name,
    });
    try {
      const ok = await backend().saveThemeFile(`${name.replace(/[^\w\- ()]/g, "")}.vyro-theme.json`, json);
      if (ok) toast("Theme exported", "success");
    } catch (e) {
      toast(`Export failed: ${errorMessage(e)}`, "error");
    }
  };

  return (
    <Section title="Appearance" description="Themes control colours, corner radius and density. Your tweaks below apply on top of the selected theme and can be exported as a new theme.">
      <Group
        title="Theme"
        aside={
          <div className="flex gap-2">
            <Button className="h-8 text-xs" icon={<Upload size={14} />} onClick={doImport}>
              Import JSON
            </Button>
            <Button className="h-8 text-xs" icon={<Download size={14} />} onClick={doExport}>
              Export current
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 p-4">
          {allThemes(customThemes).map((t) => (
            <ThemeCard
              key={t.id}
              theme={t}
              active={t.id === theme.id}
              onSelect={() => update({ themeId: t.id })}
              onDelete={t.builtin ? undefined : () => removeTheme(t.id)}
            />
          ))}
        </div>
        {importErrors.length > 0 && (
          <div className="p-4">
            <ErrorBanner>
              <strong>This theme couldn't be imported:</strong>
              <ul className="mt-1 list-disc pl-5">
                {importErrors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </ErrorBanner>
          </div>
        )}
      </Group>

      <Group title="Customize">
        <Row label="Accent colour" hint="Used for buttons, progress and highlights. With dynamic album colours on, the artwork tints it while music plays.">
          <div className="flex flex-wrap justify-end gap-1.5">
            {ACCENTS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Accent ${c}`}
                aria-pressed={accent.toLowerCase() === c.toLowerCase()}
                onClick={() => update({ accent: c })}
                className={`h-7 w-7 rounded-full ring-offset-2 ring-offset-[var(--vy-elevated)] transition-transform hover:scale-110 ${accent.toLowerCase() === c.toLowerCase() ? "ring-2 ring-fg" : ""}`}
                style={{ background: c }}
              />
            ))}
            <ColorInput label="Custom accent" value={accent} onChange={(v) => update({ accent: v })} />
            {settings.accent && (
              <Button variant="ghost" className="h-8 text-xs" onClick={() => update({ accent: null })}>
                Theme default
              </Button>
            )}
          </div>
        </Row>
        <Row label="Corner radius" hint={`${settings.radius ?? theme.radius ?? 16}px`}>
          <div className="w-48">
            <Slider label="Corner radius" min={0} max={28} step={1} value={settings.radius ?? theme.radius ?? 16} onChange={(v) => update({ radius: v })} alwaysThumb />
          </div>
          {settings.radius !== null && (
            <Button variant="ghost" className="h-8 text-xs" onClick={() => update({ radius: null })}>
              Reset
            </Button>
          )}
        </Row>
        <Row label="Layout density">
          <Segmented
            label="Layout density"
            size="sm"
            value={settings.density ?? theme.density ?? "comfortable"}
            onChange={(v) => update({ density: v })}
            options={[
              { value: "comfortable", label: "Comfortable" },
              { value: "compact", label: "Compact" },
            ]}
          />
        </Row>
        <Row label="Sidebar">
          <Segmented
            label="Sidebar"
            size="sm"
            value={settings.sidebar}
            onChange={(v) => update({ sidebar: v })}
            options={[
              { value: "expanded", label: "Expanded" },
              { value: "collapsed", label: "Icons" },
              { value: "hidden", label: "Hidden" },
            ]}
          />
        </Row>
        <Row label="Now playing and lyrics panel" hint="Toggle quickly with L (lyrics) or Q (queue).">
          <Toggle label="Show now playing panel" checked={settings.rightPanel} onChange={(v) => update({ rightPanel: v })} />
        </Row>
      </Group>

      <Group title="Community themes">
        <div className="space-y-2 p-4 text-sm text-fg-2">
          <p>
            A Vyro theme is a small JSON file anyone can write and share. Import it above; nothing in Vyro's source needs to change. The full format is documented in
            <code className="mx-1 rounded bg-fg/8 px-1.5 py-0.5 text-xs">docs/THEMES.md</code>. A minimal theme:
          </p>
          <pre className="vy-scroll overflow-x-auto rounded-vy-sm bg-black/30 p-3 text-xs leading-relaxed text-fg select-text">{`{
  "format": "vyro-theme",
  "formatVersion": 1,
  "name": "Night Drive",
  "author": "you",
  "mode": "dark",
  "colors": {
    "background": "#101018", "panel": "#181824", "elevated": "#22222f",
    "textPrimary": "#f4f4fb", "textSecondary": "#a0a0b8", "accent": "#ff5fa2"
  },
  "radius": 14,
  "background": { "source": "manual", "manual": "preset", "preset": "midnight" }
}`}</pre>
        </div>
      </Group>
    </Section>
  );
}
