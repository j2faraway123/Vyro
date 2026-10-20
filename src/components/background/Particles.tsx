import { useEffect, useRef } from "react";

/**
 * A few dozen soft, slow particles on a canvas. Capped at 1x device pixel
 * ratio and ~30 fps, and paused while the window is hidden.
 */
export function Particles({ speed }: { speed: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const speedRef = useRef(speed);
  speedRef.current = speed;

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let w = 0;
    let h = 0;
    const resize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    const count = Math.min(48, Math.round((w * h) / 42000));
    const ps = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: 0.8 + Math.random() * 2.2,
      vx: (Math.random() - 0.5) * 0.12,
      vy: -0.05 - Math.random() * 0.18,
      a: 0.15 + Math.random() * 0.35,
      tw: Math.random() * Math.PI * 2,
    }));
    let raf = 0;
    let last = 0;
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden || t - last < 33) return;
      const dt = Math.min(3, (t - last) / 16.7) * speedRef.current;
      last = t;
      ctx.clearRect(0, 0, w, h);
      const color = getComputedStyle(document.documentElement).getPropertyValue("--vy-text").trim() || "#fff";
      ctx.fillStyle = color;
      for (const p of ps) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.tw += 0.02 * dt;
        if (p.y < -10) {
          p.y = h + 10;
          p.x = Math.random() * w;
        }
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        ctx.globalAlpha = p.a * (0.6 + 0.4 * Math.sin(p.tw));
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={ref} className="vy-bg-layer" style={{ mixBlendMode: "screen" }} />;
}
