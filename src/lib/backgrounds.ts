import type { BackgroundPalette } from "./color";

export type BackgroundSource = "album" | "manual";
export type ManualBackground = "preset" | "static" | "gradient" | "image";
export type PresetId = "aurora" | "sunset" | "ocean" | "midnight" | "ambient";

export interface BackgroundSettings {
  /** "album": generated from the playing track's artwork; "manual": `manual` below. */
  source: BackgroundSource;
  manual: ManualBackground;
  preset: PresetId;
  staticColor: string;
  gradient: { from: string; via: string; to: string; angle: number };
  imagePath: string | null;
  /** Tint accents (buttons, progress, highlights) from the artwork. */
  dynamicAccent: boolean;
  animated: boolean;
  effects: {
    colorFields: boolean;
    blurredArt: boolean;
    lightWaves: boolean;
    particles: boolean;
    parallax: boolean;
  };
  blur: number; // px, 0-140
  brightness: number; // 0.2-1
  speed: number; // 0.25-3 (multiplier)
  intensity: number; // 0-1, gradient strength
  opacity: number; // 0-1, whole background layer
  reducedMotion: "system" | "on" | "off";
  performanceMode: boolean;
}

export const DEFAULT_BACKGROUND: BackgroundSettings = {
  source: "album",
  manual: "preset",
  preset: "aurora",
  staticColor: "#1d1b26",
  gradient: { from: "#2a1f3d", via: "#16213a", to: "#0f2a2a", angle: 135 },
  imagePath: null,
  dynamicAccent: true,
  animated: true,
  effects: { colorFields: true, blurredArt: true, lightWaves: true, particles: false, parallax: true },
  blur: 90,
  brightness: 0.62,
  speed: 1,
  intensity: 0.75,
  opacity: 1,
  reducedMotion: "system",
  performanceMode: false,
};

export interface Preset {
  id: PresetId;
  name: string;
  description: string;
  palette: BackgroundPalette;
  settings: Partial<BackgroundSettings>;
}

export const PRESETS: Preset[] = [
  {
    id: "aurora",
    name: "Aurora",
    description: "Cool greens drifting into violet",
    palette: { c1: "#0f3b3a", c2: "#2a1d55", c3: "#123a26", accent: "#5eead4" },
    settings: { speed: 0.8, intensity: 0.8 },
  },
  {
    id: "sunset",
    name: "Sunset",
    description: "Ember orange fading into plum",
    palette: { c1: "#4a1f17", c2: "#3d1838", c3: "#4a3212", accent: "#fb923c" },
    settings: { speed: 0.7, intensity: 0.8 },
  },
  {
    id: "ocean",
    name: "Ocean",
    description: "Deep blues with a teal undertow",
    palette: { c1: "#0f2a4a", c2: "#0c3a44", c3: "#1b1f4d", accent: "#38bdf8" },
    settings: { speed: 0.9, intensity: 0.75 },
  },
  {
    id: "midnight",
    name: "Midnight",
    description: "Near-black indigo, barely moving",
    palette: { c1: "#151530", c2: "#1d1430", c3: "#0f1a2a", accent: "#a5b4fc" },
    settings: { speed: 0.5, intensity: 0.6 },
  },
  {
    id: "ambient",
    name: "Ambient",
    description: "Soft neutral warmth",
    palette: { c1: "#2d2722", c2: "#26242c", c3: "#2a2a24", accent: "#e7c9a9" },
    settings: { speed: 0.6, intensity: 0.55 },
  },
];

export function presetById(id: string): Preset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0];
}

const clampN = (v: unknown, lo: number, hi: number, d: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;

/** Merges stored/imported values over defaults, clamping every slider. */
export function sanitizeBackground(input: unknown): BackgroundSettings {
  const b = (input && typeof input === "object" ? input : {}) as Partial<BackgroundSettings>;
  const d = DEFAULT_BACKGROUND;
  const color = (v: unknown, def: string) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : def);
  return {
    source: b.source === "manual" ? "manual" : "album",
    manual: (["preset", "static", "gradient", "image"] as const).includes(b.manual as ManualBackground)
      ? (b.manual as ManualBackground)
      : d.manual,
    preset: PRESETS.some((p) => p.id === b.preset) ? (b.preset as PresetId) : d.preset,
    staticColor: color(b.staticColor, d.staticColor),
    gradient: {
      from: color(b.gradient?.from, d.gradient.from),
      via: color(b.gradient?.via, d.gradient.via),
      to: color(b.gradient?.to, d.gradient.to),
      angle: clampN(b.gradient?.angle, 0, 360, d.gradient.angle),
    },
    imagePath: typeof b.imagePath === "string" ? b.imagePath : null,
    dynamicAccent: typeof b.dynamicAccent === "boolean" ? b.dynamicAccent : d.dynamicAccent,
    animated: typeof b.animated === "boolean" ? b.animated : d.animated,
    effects: {
      colorFields: b.effects?.colorFields ?? d.effects.colorFields,
      blurredArt: b.effects?.blurredArt ?? d.effects.blurredArt,
      lightWaves: b.effects?.lightWaves ?? d.effects.lightWaves,
      particles: b.effects?.particles ?? d.effects.particles,
      parallax: b.effects?.parallax ?? d.effects.parallax,
    },
    blur: clampN(b.blur, 0, 140, d.blur),
    brightness: clampN(b.brightness, 0.2, 1, d.brightness),
    speed: clampN(b.speed, 0.25, 3, d.speed),
    intensity: clampN(b.intensity, 0, 1, d.intensity),
    opacity: clampN(b.opacity, 0, 1, d.opacity),
    reducedMotion: b.reducedMotion === "on" || b.reducedMotion === "off" ? b.reducedMotion : "system",
    performanceMode: typeof b.performanceMode === "boolean" ? b.performanceMode : d.performanceMode,
  };
}
