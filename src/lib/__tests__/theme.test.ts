import { describe, expect, it } from "vitest";
import exampleTheme from "../../../docs/example-theme.json";
import { BUILTIN_THEMES, sanitizeCss, themeVariables, validateTheme } from "../theme";

const valid = {
  format: "vyro-theme",
  formatVersion: 1,
  name: "Night Drive",
  mode: "dark",
  colors: { background: "#101018", panel: "#181824", elevated: "#202030", textPrimary: "#f0f0ff", textSecondary: "#9a9ab0", accent: "#7c5cff" },
};

describe("validateTheme", () => {
  it("accepts a minimal valid theme and slugs its id", () => {
    const { theme, errors } = validateTheme(valid);
    expect(errors).toEqual([]);
    expect(theme?.id).toBe("night-drive");
    expect(theme?.builtin).toBeUndefined();
  });
  it("reports every problem", () => {
    const { theme, errors } = validateTheme({ format: "other", formatVersion: 9, mode: "sepia", colors: { accent: "blue" }, radius: 99 });
    expect(theme).toBeNull();
    expect(errors.length).toBeGreaterThanOrEqual(6);
  });
  it("rejects non-objects", () => expect(validateTheme("hello").theme).toBeNull());
  it("never collides with a built-in id", () => {
    expect(validateTheme({ ...valid, id: "vyro-dark" }).theme?.id).toBe("vyro-dark-custom");
  });
  it("drops imported image paths from background settings", () => {
    const { theme } = validateTheme({ ...valid, background: { imagePath: "C:/Users/x/pic.jpg", blur: 40 } });
    expect(theme?.background).toEqual({ blur: 40 });
  });
  it("round-trips every built-in theme", () => {
    for (const t of BUILTIN_THEMES) expect(validateTheme(JSON.parse(JSON.stringify(t))).errors).toEqual([]);
  });
});

describe("sanitizeCss", () => {
  it("strips imports, remote urls and script urls", () => {
    const out = sanitizeCss('@import "https://evil/x.css"; .a{background:url(https://track.er/p.png)} .b{x:javascript:alert(1)}</style>');
    expect(out).not.toMatch(/@import|https:|javascript:|<\/style/i);
  });
});

describe("themeVariables", () => {
  it("applies overrides", () => {
    const vars = themeVariables(BUILTIN_THEMES[0], { accent: "#00ff88", radius: 4 });
    expect(Object.values(vars)).toContain("#00ff88");
  });
});

describe("documented example theme", () => {
  it("docs/example-theme.json validates", () => {
    const { theme, errors } = validateTheme(exampleTheme);
    expect(errors).toEqual([]);
    expect(theme?.id).toBe("night-drive");
  });
});
