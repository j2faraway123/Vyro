import { useEffect, useMemo, useRef, useState } from "react";
import { presetById, type BackgroundSettings } from "../../lib/backgrounds";
import { albumBackground, type BackgroundPalette } from "../../lib/color";
import type { Track } from "../../lib/types";
import { useCurrentTrack } from "../../store/player";
import { useActiveTheme, useSettings } from "../../store/settings";
import { artUrl } from "../common/Artwork";
import { Particles } from "./Particles";

export function useReducedMotion(bg: BackgroundSettings): boolean {
  const [system, setSystem] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const fn = () => setSystem(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return bg.reducedMotion === "on" || (bg.reducedMotion === "system" && system);
}

/** Resolves which palette the background should use right now. */
export function resolvePalette(bg: BackgroundSettings, track: Track | null, mode: "dark" | "light"): { palette: BackgroundPalette; fromAlbum: boolean } {
  if (bg.source === "album" && track?.palette?.length) {
    return { palette: albumBackground(track.palette, mode), fromAlbum: true };
  }
  switch (bg.manual) {
    case "static":
      return { palette: { c1: bg.staticColor, c2: bg.staticColor, c3: bg.staticColor, accent: "" }, fromAlbum: false };
    case "gradient":
      return { palette: { c1: bg.gradient.from, c2: bg.gradient.via, c3: bg.gradient.to, accent: "" }, fromAlbum: false };
    default:
      return { palette: presetById(bg.preset).palette, fromAlbum: false };
  }
}

/** Crossfades between two layers whenever `url` changes, after the image has loaded. */
function useCrossfade(url: string | null): [string | null, string | null, 0 | 1] {
  const [layers, setLayers] = useState<[string | null, string | null]>([url, null]);
  const [active, setActive] = useState<0 | 1>(0);
  useEffect(() => {
    if (url === layers[active]) return;
    const next: 0 | 1 = active === 0 ? 1 : 0;
    if (!url) {
      setLayers((l) => (next === 0 ? [null, l[1]] : [l[0], null]));
      setActive(next);
      return;
    }
    const img = new Image();
    let cancelled = false;
    img.onload = img.onerror = () => {
      if (cancelled) return;
      setLayers((l) => (next === 0 ? [url, l[1]] : [l[0], url]));
      setActive(next);
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  return [layers[0], layers[1], active];
}

export function DynamicBackground() {
  const bg = useSettings((s) => s.settings.background);
  const theme = useActiveTheme();
  const track = useCurrentTrack();
  const reduced = useReducedMotion(bg);
  const root = useRef<HTMLDivElement>(null);
  const perf = bg.performanceMode;
  const animated = bg.animated && !reduced;

  const { palette, fromAlbum } = useMemo(() => resolvePalette(bg, track, theme.mode), [bg, track, theme.mode]);

  // Publish colours as registered custom properties so they transition smoothly.
  useEffect(() => {
    const r = document.documentElement.style;
    r.setProperty("--bg-c1", palette.c1);
    r.setProperty("--bg-c2", palette.c2);
    r.setProperty("--bg-c3", palette.c3);
    r.setProperty("--vy-accent", bg.dynamicAccent && fromAlbum && palette.accent ? palette.accent : "var(--vy-accent-base)");
  }, [palette, fromAlbum, bg.dynamicAccent]);

  useEffect(() => {
    const d = document.documentElement.dataset;
    d.motion = reduced ? "reduce" : animated ? "full" : "static";
    d.perf = perf ? "1" : "0";
    document.documentElement.style.setProperty("--bg-speed", String(bg.speed));
    document.documentElement.style.setProperty("--bg-transition", reduced ? "0.01s" : "1.8s");
  }, [reduced, animated, perf, bg.speed]);

  const showArt = bg.effects.blurredArt && !perf && (bg.source === "album" || bg.manual !== "image");
  const [artA, artB, activeArt] = useCrossfade(showArt && track?.artwork ? artUrl(track.artwork) : null);
  const imageUrl = bg.source === "manual" && bg.manual === "image" && bg.imagePath ? artUrl(bg.imagePath) : null;

  // Subtle parallax: the art layer drifts opposite to the pointer.
  useEffect(() => {
    if (!bg.effects.parallax || !animated || perf) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const x = (e.clientX / window.innerWidth - 0.5) * -24;
        const y = (e.clientY / window.innerHeight - 0.5) * -24;
        root.current?.style.setProperty("--px", `${x}px`);
        root.current?.style.setProperty("--py", `${y}px`);
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
    };
  }, [bg.effects.parallax, animated, perf]);

  const dark = theme.mode === "dark";
  const veil = dark ? 1 - bg.brightness : (1 - bg.brightness) * 0.8;
  const blurPx = perf ? Math.min(bg.blur, 30) : bg.blur;
  const isStatic = bg.source === "manual" && bg.manual === "static";

  return (
    <div ref={root} aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden" style={{ background: "var(--vy-bg)" }} data-testid="dynamic-background">
      <div className="vy-bg-layer" style={{ opacity: bg.opacity }}>
        {/* Gradient wash */}
        <div
          className={`vy-bg-layer ${animated && !isStatic ? "vy-gradient-pan" : ""}`}
          style={{
            background:
              bg.source === "manual" && bg.manual === "gradient"
                ? `linear-gradient(${bg.gradient.angle}deg, var(--bg-c1), var(--bg-c2), var(--bg-c3))`
                : "linear-gradient(135deg, var(--bg-c1) 0%, var(--bg-c2) 45%, var(--bg-c3) 100%)",
            opacity: isStatic ? 1 : 0.35 + bg.intensity * 0.65,
          }}
        />
        {/* Floating colour fields */}
        {bg.effects.colorFields && !isStatic && (
          <div className="vy-bg-layer" style={{ opacity: bg.intensity, filter: perf ? undefined : `blur(${Math.round(blurPx * 0.4)}px)` }}>
            <div className="vy-blob b1" />
            <div className="vy-blob b2" />
            {!perf && <div className="vy-blob b3" />}
          </div>
        )}
        {/* Soft blurred artwork */}
        {showArt &&
          [artA, artB].map((url, i) => (
            <div
              key={i}
              className="vy-art-bg"
              style={{
                backgroundImage: url ? `url("${url}")` : undefined,
                opacity: url && activeArt === i ? 0.18 + bg.intensity * 0.32 : 0,
                filter: `blur(${blurPx}px) saturate(1.5)`,
                transform: `translate3d(var(--px, 0px), var(--py, 0px), 0) scale(1.15)`,
              }}
            />
          ))}
        {imageUrl && (
          <div
            className="vy-art-bg"
            style={{
              inset: 0,
              backgroundImage: `url("${imageUrl}")`,
              filter: blurPx ? `blur(${Math.round(blurPx / 4)}px)` : undefined,
              transform: bg.effects.parallax && animated ? "translate3d(var(--px, 0px), var(--py, 0px), 0) scale(1.06)" : undefined,
            }}
          />
        )}
        {bg.effects.lightWaves && animated && !perf && !isStatic && <div className="vy-wave" />}
        {bg.effects.particles && animated && !perf && <Particles speed={bg.speed} />}
      </div>
      {/* Readability veil: keeps text and controls legible on bright artwork. */}
      <div className="vy-bg-layer" style={{ background: "var(--vy-bg)", opacity: Math.min(0.85, veil) }} />
      <div
        className="vy-bg-layer"
        style={{
          background: dark
            ? "radial-gradient(120% 90% at 50% 0%, transparent 40%, rgba(0,0,0,.45) 100%)"
            : "radial-gradient(120% 90% at 50% 0%, transparent 50%, rgba(255,255,255,.35) 100%)",
        }}
      />
    </div>
  );
}
