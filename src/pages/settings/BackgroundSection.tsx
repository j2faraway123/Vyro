import { ImagePlus, RotateCcw } from "lucide-react";
import { Button, Segmented, Slider, Toggle } from "../../components/common/controls";
import { artUrl } from "../../components/common/Artwork";
import { resolvePalette } from "../../components/background/DynamicBackground";
import { backend, errorMessage } from "../../lib/backend";
import { DEFAULT_BACKGROUND, PRESETS, type BackgroundSettings } from "../../lib/backgrounds";
import { useCurrentTrack } from "../../store/player";
import { useActiveTheme, useSettings } from "../../store/settings";
import { toast } from "../../store/ui";
import { ColorInput, Group, Row, Section } from "./common";

function Preview() {
  const bg = useSettings((s) => s.settings.background);
  const track = useCurrentTrack();
  const theme = useActiveTheme();
  const { palette, fromAlbum } = resolvePalette(bg, track, theme.mode);
  const image = bg.source === "manual" && bg.manual === "image" && bg.imagePath ? artUrl(bg.imagePath) : null;
  return (
    <div className="relative h-36 overflow-hidden rounded-vy border border-line" aria-label="Background preview">
      <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${palette.c1}, ${palette.c2}, ${palette.c3})`, opacity: bg.opacity }} />
      {image && <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url("${image}")`, opacity: bg.opacity }} />}
      <div className="absolute inset-0" style={{ background: "var(--vy-bg)", opacity: Math.min(0.85, 1 - bg.brightness) }} />
      <div className="absolute bottom-3 left-4 text-sm font-semibold text-fg">
        {fromAlbum ? `From "${track?.album}" artwork` : bg.source === "album" ? "No artwork playing: using your manual choice" : "Manual background"}
      </div>
      <div className="absolute right-4 bottom-3 flex gap-1.5">
        {[palette.c1, palette.c2, palette.c3].map((c, i) => (
          <span key={i} className="h-5 w-5 rounded-full ring-1 ring-white/30" style={{ background: c }} />
        ))}
      </div>
    </div>
  );
}

export function BackgroundSection() {
  const bg = useSettings((s) => s.settings.background);
  const set = useSettings((s) => s.updateBackground);
  const fx = (k: keyof BackgroundSettings["effects"], v: boolean) => set({ effects: { ...bg.effects, [k]: v } });

  const pickImage = async () => {
    try {
      const p = await backend().pickImage();
      if (!p) return;
      const stored = await backend().importBackground(p);
      set({ imagePath: stored, manual: "image", source: "manual" });
    } catch (e) {
      toast(`Couldn't import image: ${errorMessage(e)}`, "error");
    }
  };

  return (
    <Section
      title="Background"
      description="Vyro's background reacts to what's playing: it extracts colours from the album artwork and blends them into the app, crossfading when the song changes. Or pick your own."
    >
      <Preview />

      <Group title="Source">
        <Row label="Background source" hint="Album artwork follows the current track. Manual uses the preset, colour, gradient or image you choose below.">
          <Segmented
            label="Background source"
            size="sm"
            value={bg.source}
            onChange={(v) => set({ source: v })}
            options={[
              { value: "album", label: "Album artwork" },
              { value: "manual", label: "Manual" },
            ]}
          />
        </Row>
        <Row label="Dynamic album colours" hint="Tint the accent colour (buttons, progress, highlights) from the artwork too.">
          <Toggle label="Dynamic album colours" checked={bg.dynamicAccent} onChange={(v) => set({ dynamicAccent: v })} />
        </Row>
        <Row label="Manual background" hint={bg.source === "album" ? "Used when nothing is playing or a track has no artwork." : undefined}>
          <Segmented
            label="Manual background type"
            size="sm"
            value={bg.manual}
            onChange={(v) => (v === "image" && !bg.imagePath ? pickImage() : set({ manual: v }))}
            options={[
              { value: "preset", label: "Preset" },
              { value: "static", label: "Colour" },
              { value: "gradient", label: "Gradient" },
              { value: "image", label: "Image" },
            ]}
          />
        </Row>
        {bg.manual === "preset" && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 p-4">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={bg.preset === p.id}
                onClick={() => set({ preset: p.id, ...p.settings })}
                className={`overflow-hidden rounded-vy border-2 text-left transition-all ${bg.preset === p.id ? "border-accent" : "border-transparent hover:border-line"}`}
              >
                <div className="h-16" style={{ background: `linear-gradient(135deg, ${p.palette.c1}, ${p.palette.c2}, ${p.palette.c3})` }} />
                <div className="bg-fg/5 px-3 py-2">
                  <div className="text-sm font-bold text-fg">{p.name}</div>
                  <div className="truncate text-xs text-fg-3">{p.description}</div>
                </div>
              </button>
            ))}
          </div>
        )}
        {bg.manual === "static" && (
          <Row label="Colour">
            <ColorInput label="Background colour" value={bg.staticColor} onChange={(v) => set({ staticColor: v })} />
          </Row>
        )}
        {bg.manual === "gradient" && (
          <>
            <Row label="Gradient colours">
              <ColorInput label="Gradient start" value={bg.gradient.from} onChange={(v) => set({ gradient: { ...bg.gradient, from: v } })} />
              <ColorInput label="Gradient middle" value={bg.gradient.via} onChange={(v) => set({ gradient: { ...bg.gradient, via: v } })} />
              <ColorInput label="Gradient end" value={bg.gradient.to} onChange={(v) => set({ gradient: { ...bg.gradient, to: v } })} />
            </Row>
            <Row label="Angle" hint={`${bg.gradient.angle}°`}>
              <div className="w-48">
                <Slider label="Gradient angle" min={0} max={360} step={5} value={bg.gradient.angle} onChange={(v) => set({ gradient: { ...bg.gradient, angle: v } })} alwaysThumb />
              </div>
            </Row>
          </>
        )}
        {bg.manual === "image" && (
          <Row label="Custom image" hint={bg.imagePath ? "Copied into Vyro's data folder, so moving the original is fine." : "Choose a JPG, PNG, WebP, GIF or AVIF image."}>
            {bg.imagePath && <img src={artUrl(bg.imagePath) ?? undefined} alt="" className="h-10 w-16 rounded-md object-cover" />}
            <Button icon={<ImagePlus size={15} />} onClick={pickImage}>
              {bg.imagePath ? "Replace" : "Choose image"}
            </Button>
          </Row>
        )}
      </Group>

      <Group title="Motion and effects">
        <Row label="Animated background" hint="Slow-moving gradients and drifting colour fields. Uses GPU-friendly transforms only.">
          <Toggle label="Animated background" checked={bg.animated} onChange={(v) => set({ animated: v })} />
        </Row>
        {(
          [
            ["colorFields", "Floating colour fields", "Large soft colour blobs that drift slowly."],
            ["blurredArt", "Blurred album art", "A heavily blurred copy of the cover behind everything."],
            ["lightWaves", "Light waves", "A faint sweep of light moving across the background."],
            ["particles", "Particles", "A few dozen slow floating specks. Off by default."],
            ["parallax", "Artwork parallax", "The background and cover shift slightly with your pointer."],
          ] as const
        ).map(([k, label, hint]) => (
          <Row key={k} label={label} hint={hint}>
            <Toggle label={label} checked={bg.effects[k]} onChange={(v) => fx(k, v)} disabled={bg.performanceMode && k !== "colorFields"} />
          </Row>
        ))}
        <Row label="Reduce motion" hint="System follows your operating system's accessibility setting.">
          <Segmented
            label="Reduce motion"
            size="sm"
            value={bg.reducedMotion}
            onChange={(v) => set({ reducedMotion: v })}
            options={[
              { value: "system", label: "System" },
              { value: "on", label: "On" },
              { value: "off", label: "Off" },
            ]}
          />
        </Row>
        <Row label="Performance mode" hint="For weaker computers: turns off blur, glass panels, particles, light waves and blurred art.">
          <Toggle label="Performance mode" checked={bg.performanceMode} onChange={(v) => set({ performanceMode: v })} />
        </Row>
      </Group>

      <Group title="Fine tuning">
        {(
          [
            ["blur", "Blur intensity", 0, 140, 1, (v: number) => `${v}px`],
            ["brightness", "Background brightness", 0.2, 1, 0.01, (v: number) => `${Math.round(v * 100)}%`],
            ["speed", "Animation speed", 0.25, 3, 0.05, (v: number) => `${v.toFixed(2)}×`],
            ["intensity", "Gradient intensity", 0, 1, 0.01, (v: number) => `${Math.round(v * 100)}%`],
            ["opacity", "Background opacity", 0, 1, 0.01, (v: number) => `${Math.round(v * 100)}%`],
          ] as const
        ).map(([k, label, min, max, step, fmt]) => (
          <Row key={k} label={label} hint={fmt(bg[k])}>
            <div className="w-56">
              <Slider label={label} min={min} max={max} step={step} value={bg[k]} onChange={(v) => set({ [k]: v })} format={fmt} alwaysThumb />
            </div>
          </Row>
        ))}
        <div className="flex justify-end p-3">
          <Button variant="ghost" icon={<RotateCcw size={14} />} onClick={() => set({ ...DEFAULT_BACKGROUND })}>
            Reset background settings
          </Button>
        </div>
      </Group>
    </Section>
  );
}
