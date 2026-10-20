import { describe, expect, it } from "vitest";
import { albumBackground, contrastRatio, hexToHsl, hexToRgb, hslToHex, isHex, mix, readableOn } from "../color";

describe("colour helpers", () => {
  it("validates hex", () => {
    expect(isHex("#a1b2c3")).toBe(true);
    expect(isHex("red")).toBe(false);
  });
  it("round-trips through HSL", () => {
    for (const hex of ["#ff7a59", "#171717", "#3366cc", "#00ff00"]) {
      const [r, g, b] = hexToRgb(hslToHex(hexToHsl(hex)));
      const [r0, g0, b0] = hexToRgb(hex);
      expect(Math.abs(r - r0) + Math.abs(g - g0) + Math.abs(b - b0)).toBeLessThanOrEqual(3);
    }
  });
  it("computes WCAG contrast", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
  });
  it("mixes colours", () => expect(mix("#000000", "#ffffff", 0.5).toLowerCase()).toMatch(/^#(7f|80){3}$/));
  it("picks readable text", () => {
    expect(contrastRatio(readableOn("#101010"), "#101010")).toBeGreaterThan(4.5);
    expect(contrastRatio(readableOn("#f4f4f4"), "#f4f4f4")).toBeGreaterThan(4.5);
  });
});

describe("albumBackground", () => {
  const artworks = [["#e0341c", "#f4b400"], ["#1565c0"], ["#ffffff", "#000000"], ["#7a7a7a"], []];
  it("keeps white text readable on every dark background colour", () => {
    for (const palette of artworks) {
      const bg = albumBackground(palette, "dark");
      for (const c of [bg.c1, bg.c2, bg.c3]) expect(contrastRatio("#f5f5f5", c)).toBeGreaterThan(4.5);
    }
  });
  it("keeps dark text readable in light mode", () => {
    for (const palette of artworks) {
      const bg = albumBackground(palette, "light");
      for (const c of [bg.c1, bg.c2, bg.c3]) expect(contrastRatio("#151515", c)).toBeGreaterThan(4.5);
    }
  });
  it("derives the complement close to the base hue so it never clashes", () => {
    const bg = albumBackground(["#e0341c"], "dark");
    const d = Math.abs(hexToHsl(bg.c3).h - hexToHsl(bg.c1).h) % 360;
    expect(Math.min(d, 360 - d)).toBeLessThanOrEqual(90);
  });
});

describe("third colour field", () => {
  it("never lands in the olive/green band for warm artwork", () => {
    for (const hex of ["#e0341c", "#f39c12", "#f4b400", "#d35400"]) {
      const h = hexToHsl(albumBackground([hex], "dark").c3).h;
      const hue = ((h % 360) + 360) % 360;
      expect(hue < 60 || hue > 300).toBe(true);
    }
  });
});
