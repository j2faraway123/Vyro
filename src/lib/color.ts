export interface HSL {
  h: number; // 0-360
  s: number; // 0-1
  l: number; // 0-1
}

export function isHex(v: unknown): v is string {
  return typeof v === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v);
}

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function hexToHsl(hex: string): HSL {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}

export function hslToHex({ h, s, l }: HSL): string {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb: [number, number, number];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return rgbToHex((rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
}

export function mix(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex(ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t);
}

export interface BackgroundPalette {
  c1: string;
  c2: string;
  c3: string;
  accent: string;
}

/**
 * Turns artwork colours into a background palette: the dominant colour, a
 * secondary (from the artwork or derived), and a complementary third colour,
 * all pushed into a luminance band that keeps text readable. `mode` selects a
 * dark or light band. The accent is a brighter, saturated variant for controls.
 */
export function albumBackground(palette: string[], mode: "dark" | "light" = "dark"): BackgroundPalette {
  const colors = palette.filter(isHex);
  const base = hexToHsl(colors[0] ?? "#5b4b8a");
  const second = colors[1] ? hexToHsl(colors[1]) : { ...base, h: base.h + 35 };
  // Third colour field: an analogous hue 45° away at reduced saturation, so
  // it adds depth without clashing. Warm and yellow-green bases rotate
  // backwards (orange -> red/magenta) so the band never drifts into a muddy
  // olive/green, which a full complement or a forward turn would produce.
  const h0 = ((base.h % 360) + 360) % 360;
  const third = { h: h0 + (h0 >= 20 && h0 < 160 ? -45 : 45), s: Math.min(base.s * 0.7, 0.45), l: base.l };

  // HSL lightness alone doesn't bound perceived brightness (yellow at l=0.36 is
  // far lighter than blue), so step lightness until body text keeps 4.5:1+.
  const band = (c: HSL, boost = 0): string => {
    const dark = mode === "dark";
    const s = dark ? clamp(c.s * 0.9 + 0.08, 0.12, 0.72) : clamp(c.s * 0.8, 0.15, 0.6);
    let l = dark ? clamp(c.l * 0.55 + 0.08 + boost, 0.14, 0.36) : clamp(0.82 + boost, 0.76, 0.9);
    const text = dark ? "#f5f5f5" : "#151515";
    let hex = hslToHex({ h: c.h, s, l });
    for (let i = 0; i < 20 && contrastRatio(text, hex) < 5; i++) {
      l = clamp(l + (dark ? -0.02 : 0.02), 0.04, 0.97);
      hex = hslToHex({ h: c.h, s, l });
    }
    return hex;
  };

  const accent = hslToHex({
    h: base.s < 0.12 ? (second.s > 0.12 ? second.h : 18) : base.h,
    s: base.s < 0.12 && second.s < 0.12 ? 0.0 : clamp(base.s + 0.15, 0.55, 0.9),
    l: mode === "dark" ? (base.s < 0.12 && second.s < 0.12 ? 0.82 : 0.64) : 0.42,
  });
  return { c1: band(base, 0.04), c2: band(second), c3: band(third, -0.03), accent };
}

/** Picks a readable foreground (near-black or near-white) for text on `bg`. */
export function readableOn(bg: string): string {
  return contrastRatio(bg, "#0b0b0b") > contrastRatio(bg, "#f5f5f5") ? "#0b0b0b" : "#f5f5f5";
}
