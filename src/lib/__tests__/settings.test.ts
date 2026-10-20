import { describe, expect, it } from "vitest";
import { DEFAULT_BACKGROUND, PRESETS, presetById, sanitizeBackground } from "../backgrounds";
import { DEFAULT_SETTINGS, loadSettings } from "../settings";

describe("loadSettings", () => {
  it("returns defaults for nothing stored", () => expect(loadSettings(undefined)).toEqual(DEFAULT_SETTINGS));
  it("keeps valid values and rejects bad ones", () => {
    const s = loadSettings({ volume: 4, accent: "javascript:alert(1)", repeat: "sometimes", sidebar: "collapsed", lyricsSize: 1.2 });
    expect(s.volume).toBe(1);
    expect(s.accent).toBeNull();
    expect(s.repeat).toBe("off");
    expect(s.sidebar).toBe("collapsed");
    expect(s.lyricsSize).toBe(1.2);
  });
  it("survives a round trip through JSON", () => {
    const custom = { ...DEFAULT_SETTINGS, themeId: "fjord", accent: "#123456", background: { ...DEFAULT_BACKGROUND, preset: "ocean" as const } };
    expect(loadSettings(JSON.parse(JSON.stringify(custom)))).toEqual(custom);
  });
});

describe("sanitizeBackground", () => {
  it("clamps sliders", () => {
    const b = sanitizeBackground({ blur: 9999, brightness: -1, speed: "fast", opacity: 0.5 });
    expect(b.blur).toBe(140);
    expect(b.brightness).toBe(0.2);
    expect(b.speed).toBe(DEFAULT_BACKGROUND.speed);
    expect(b.opacity).toBe(0.5);
  });
  it("rejects unknown presets and invalid colours", () => {
    const b = sanitizeBackground({ preset: "vaporwave", staticColor: "url(x)", gradient: { from: "#000000" } });
    expect(b.preset).toBe(DEFAULT_BACKGROUND.preset);
    expect(b.staticColor).toBe(DEFAULT_BACKGROUND.staticColor);
    expect(b.gradient.from).toBe("#000000");
    expect(b.gradient.to).toBe(DEFAULT_BACKGROUND.gradient.to);
  });
  it("ships the five named presets", () => {
    expect(PRESETS.map((p) => p.id)).toEqual(["aurora", "sunset", "ocean", "midnight", "ambient"]);
    expect(presetById("nope").id).toBe("aurora");
  });
});
