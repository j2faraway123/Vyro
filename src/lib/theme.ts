import { isHex, mix, withAlpha, readableOn } from "./color";
import { sanitizeBackground, type BackgroundSettings } from "./backgrounds";

export const THEME_FORMAT = "vyro-theme";
export const THEME_FORMAT_VERSION = 1;

export interface ThemeColors {
  background: string;
  panel: string;
  elevated: string;
  textPrimary: string;
  textSecondary: string;
  accent: string;
  border?: string;
}

export interface VyroTheme {
  format: typeof THEME_FORMAT;
  formatVersion: number;
  id: string;
  name: string;
  author?: string;
  description?: string;
  version?: string;
  mode: "dark" | "light";
  colors: ThemeColors;
  radius?: number;
  density?: "comfortable" | "compact";
  background?: Partial<BackgroundSettings>;
  /** Optional extra CSS. Remote url(), @import and javascript: are stripped. */
  css?: string;
  builtin?: boolean;
}

const base = (t: Omit<VyroTheme, "format" | "formatVersion" | "builtin">): VyroTheme => ({
  format: THEME_FORMAT,
  formatVersion: THEME_FORMAT_VERSION,
  builtin: true,
  ...t,
});

export const BUILTIN_THEMES: VyroTheme[] = [
  base({
    id: "vyro-dark",
    name: "Vyro Dark",
    author: "Vyro",
    description: "The default charcoal theme",
    mode: "dark",
    colors: {
      background: "#171717",
      panel: "#202020",
      elevated: "#292929",
      textPrimary: "#F5F5F5",
      textSecondary: "#A5A5A5",
      accent: "#FF7A59",
    },
    radius: 16,
    density: "comfortable",
  }),
  base({
    id: "vyro-light",
    name: "Vyro Light",
    author: "Vyro",
    description: "Soft paper tones for daytime",
    mode: "light",
    colors: {
      background: "#ECEBE8",
      panel: "#F7F6F3",
      elevated: "#FFFFFF",
      textPrimary: "#18181B",
      textSecondary: "#5F5F66",
      accent: "#E0532F",
    },
    radius: 16,
    density: "comfortable",
  }),
  base({
    id: "oled",
    name: "OLED Black",
    author: "Vyro",
    description: "True black panels with high contrast",
    mode: "dark",
    colors: {
      background: "#000000",
      panel: "#0B0B0B",
      elevated: "#161616",
      textPrimary: "#FFFFFF",
      textSecondary: "#9A9A9A",
      accent: "#7DD3FC",
    },
    radius: 12,
    density: "comfortable",
  }),
  base({
    id: "fjord",
    name: "Fjord",
    author: "Vyro",
    description: "Slate blues and frost",
    mode: "dark",
    colors: {
      background: "#1B1F27",
      panel: "#232833",
      elevated: "#2C3340",
      textPrimary: "#ECEFF4",
      textSecondary: "#A3ABBB",
      accent: "#88C0D0",
    },
    radius: 18,
    density: "comfortable",
  }),
];

export function sanitizeCss(css: string): string {
  return css
    .replace(/@import[^;]*;?/gi, "")
    .replace(/url\(\s*(['"]?)\s*(https?:|\/\/|javascript:)[^)]*\)/gi, "none")
    .replace(/expression\s*\(/gi, "(")
    .replace(/javascript:/gi, "")
    .replace(/<\/?style/gi, "")
    .slice(0, 100_000);
}

export interface ThemeValidation {
  theme: VyroTheme | null;
  errors: string[];
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "theme";

/** Validates an imported theme object. Unknown keys are dropped. */
export function validateTheme(input: unknown): ThemeValidation {
  const errors: string[] = [];
  if (!input || typeof input !== "object") return { theme: null, errors: ["The file does not contain a JSON object"] };
  const t = input as Record<string, unknown>;
  if (t.format !== THEME_FORMAT) errors.push(`"format" must be "${THEME_FORMAT}"`);
  if (typeof t.formatVersion !== "number" || t.formatVersion > THEME_FORMAT_VERSION)
    errors.push(`"formatVersion" must be a number no greater than ${THEME_FORMAT_VERSION}`);
  if (typeof t.name !== "string" || !t.name.trim()) errors.push(`"name" is required`);
  if (t.mode !== "dark" && t.mode !== "light") errors.push(`"mode" must be "dark" or "light"`);
  const c = (t.colors ?? {}) as Record<string, unknown>;
  for (const key of ["background", "panel", "elevated", "textPrimary", "textSecondary", "accent"] as const) {
    if (!isHex(c[key])) errors.push(`"colors.${key}" must be a hex colour like #1a1a1a`);
  }
  if (c.border !== undefined && typeof c.border !== "string") errors.push(`"colors.border" must be a string`);
  if (t.radius !== undefined && (typeof t.radius !== "number" || t.radius < 0 || t.radius > 32))
    errors.push(`"radius" must be between 0 and 32`);
  if (t.density !== undefined && t.density !== "comfortable" && t.density !== "compact")
    errors.push(`"density" must be "comfortable" or "compact"`);
  if (t.css !== undefined && typeof t.css !== "string") errors.push(`"css" must be a string`);
  if (errors.length) return { theme: null, errors };

  const name = (t.name as string).trim().slice(0, 64);
  const theme: VyroTheme = {
    format: THEME_FORMAT,
    formatVersion: t.formatVersion as number,
    id: typeof t.id === "string" && t.id.trim() ? slug(t.id) : slug(name),
    name,
    author: typeof t.author === "string" ? t.author.slice(0, 64) : undefined,
    description: typeof t.description === "string" ? t.description.slice(0, 200) : undefined,
    version: typeof t.version === "string" ? t.version.slice(0, 16) : undefined,
    mode: t.mode as "dark" | "light",
    colors: {
      background: c.background as string,
      panel: c.panel as string,
      elevated: c.elevated as string,
      textPrimary: c.textPrimary as string,
      textSecondary: c.textSecondary as string,
      accent: c.accent as string,
      border: typeof c.border === "string" ? c.border.slice(0, 64) : undefined,
    },
    radius: t.radius as number | undefined,
    density: t.density as VyroTheme["density"],
    background: t.background && typeof t.background === "object" ? stripImage(t.background) : undefined,
    css: typeof t.css === "string" ? sanitizeCss(t.css) : undefined,
  };
  if (BUILTIN_THEMES.some((b) => b.id === theme.id)) theme.id = `${theme.id}-custom`;
  return { theme, errors: [] };
}

function stripImage(bg: object): Partial<BackgroundSettings> {
  // Only keep known keys, and never import a file path from someone else's machine.
  const clean = sanitizeBackground(bg);
  const raw = bg as Record<string, unknown>;
  const out: Partial<BackgroundSettings> = {};
  for (const k of Object.keys(clean) as (keyof BackgroundSettings)[]) {
    if (k === "imagePath") continue;
    if (k in raw) (out as Record<string, unknown>)[k] = clean[k];
  }
  return out;
}

export interface ThemeOverrides {
  accent?: string | null;
  radius?: number;
  density?: "comfortable" | "compact";
}

/** CSS custom properties for a theme; written to :root by applyTheme. */
export function themeVariables(theme: VyroTheme, o: ThemeOverrides = {}): Record<string, string> {
  const c = theme.colors;
  const accent = o.accent && isHex(o.accent) ? o.accent : c.accent;
  const radius = o.radius ?? theme.radius ?? 16;
  const density = o.density ?? theme.density ?? "comfortable";
  const dark = theme.mode === "dark";
  return {
    "--vy-bg": c.background,
    "--vy-panel": c.panel,
    "--vy-elevated": c.elevated,
    "--vy-hover": mix(c.elevated, c.textPrimary, dark ? 0.06 : 0.04),
    "--vy-text": c.textPrimary,
    "--vy-text-2": c.textSecondary,
    "--vy-text-3": mix(c.textSecondary, c.panel, 0.35),
    "--vy-border": c.border ?? withAlpha(c.textPrimary, dark ? 0.08 : 0.1),
    "--vy-accent-base": accent,
    "--vy-on-accent": readableOn(accent),
    "--vy-radius": `${radius}px`,
    "--vy-radius-sm": `${Math.max(2, Math.round(radius * 0.55))}px`,
    "--vy-radius-lg": `${Math.round(radius * 1.25)}px`,
    "--vy-density": density === "compact" ? "0.82" : "1",
    "--vy-row": density === "compact" ? "44px" : "56px",
    "--vy-shadow": dark ? "0 12px 40px rgba(0,0,0,.45)" : "0 12px 40px rgba(30,20,10,.12)",
    "--vy-scheme": theme.mode,
  };
}

export function applyTheme(theme: VyroTheme, o: ThemeOverrides = {}): void {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(themeVariables(theme, o))) root.style.setProperty(k, v);
  root.dataset.mode = theme.mode;
  root.style.colorScheme = theme.mode;
  let style = document.getElementById("vyro-theme-css") as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = "vyro-theme-css";
    document.head.appendChild(style);
  }
  style.textContent = theme.css ? sanitizeCss(theme.css) : "";
}

/** Serializes a theme (optionally with the user's current tweaks) for sharing. */
export function exportTheme(
  theme: VyroTheme,
  o: ThemeOverrides & { background?: BackgroundSettings; name?: string } = {},
): string {
  const out: VyroTheme = {
    format: THEME_FORMAT,
    formatVersion: THEME_FORMAT_VERSION,
    id: o.name ? slug(o.name) : theme.id,
    name: o.name ?? theme.name,
    author: theme.author,
    description: theme.description,
    version: theme.version ?? "1.0.0",
    mode: theme.mode,
    colors: { ...theme.colors, accent: o.accent && isHex(o.accent) ? o.accent : theme.colors.accent },
    radius: o.radius ?? theme.radius,
    density: o.density ?? theme.density,
    background: o.background ? stripImage(o.background) : theme.background,
    css: theme.css,
  };
  return JSON.stringify(out, null, 2);
}
