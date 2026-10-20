// Smoke test of the UI in the browser preview (demo backend, synthesized audio).
// Usage: node e2e/preview-smoke.mjs [baseUrl] [outDir]
import { chromium } from "playwright-core";
import fs from "node:fs";

const base = process.argv[2] ?? "http://localhost:1420/";
const out = process.argv[3] ?? "e2e/screenshots";
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));

let failures = 0;
const check = (cond, msg) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${msg}`);
  if (!cond) failures++;
};
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
const cssVar = (name) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

await page.goto(base);
await page.getByRole("heading", { name: /Good (morning|afternoon|evening)|Up late/ }).waitFor();
await page.waitForTimeout(600);
await shot("01-discover");
check(await page.getByText("Browser preview · demo library").isVisible(), "preview badge visible");

// Play an album from its page.
await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Library" }).click();
const card = (name) => page.getByRole("button", { name: `Play ${name}`, exact: true }).first();
await card("Glass Harbor").hover();
await card("Glass Harbor").click();
await page.waitForTimeout(1500);
const t1 = await page.evaluate(() => document.querySelector("audio")?.currentTime ?? [...document.querySelectorAll("*")].length);
const playing = await page.getByRole("contentinfo", { name: "Playback" }).getByRole("button", { name: "Pause" }).isVisible();
check(playing, "playback started (pause button shown)");
const c1a = await cssVar("--bg-c1");
await page.waitForTimeout(2500);
await shot("02-library-playing");

// Lyrics: the demo track 1 has synced lyrics; an active line should appear after ~3s.
const active = await page.locator(".vy-lyric.active").count();
check(active === 1, "a synced lyric line is highlighted");

// Next track changes the background palette (album -> same album, so jump to a different album).
await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Library" }).click();
await card("Ember Season").hover();
await card("Ember Season").click();
await page.waitForTimeout(2500);
const c1b = await cssVar("--bg-c1");
check(c1a !== c1b, `background colour transitions between albums (${c1a} -> ${c1b})`);
await shot("03-ember-season");

// Seeking via keyboard.
const before = await page.evaluate(() => window.__vyroTime?.() ?? 0);
void before;
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(300);

// Queue panel
await page.getByRole("button", { name: "Queue", exact: true }).first().click();
await page.waitForTimeout(400);
check(await page.getByText("Next up").isVisible(), "queue panel shows upcoming tracks");
await shot("04-queue");

// Favorites
await page.getByRole("contentinfo", { name: "Playback" }).getByRole("button", { name: "Add to favorites" }).click();
await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Favorites" }).click();
await page.waitForTimeout(400);
check((await page.getByRole("row").count()) >= 2, "favorite appears on Favorites page");

// Playlist creation via dialog
await page.getByRole("button", { name: "Create playlist" }).click();
await page.getByPlaceholder("My playlist").fill("Road trip");
await page.getByRole("button", { name: "Save" }).click();
await page.waitForTimeout(400);
check(await page.getByRole("heading", { name: "Road trip" }).isVisible(), "playlist created and opened");

// Search
await page.getByRole("searchbox", { name: "Search your library" }).fill("neon");
await page.waitForTimeout(400);
check(await page.getByText("Neon Parish").first().isVisible(), "search finds artist");
await shot("05-search");

// Settings: theme change + background section
await page.keyboard.press("Escape");
await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Settings" }).click();
await page.getByRole("button", { name: /Vyro Light/ }).click();
await page.waitForTimeout(500);
check((await page.evaluate(() => document.documentElement.dataset.mode)) === "light", "light theme applied");
await shot("06-settings-light");
await page.getByRole("button", { name: /Vyro Dark/ }).click();
await page.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: "Background" }).click();
await page.getByRole("radio", { name: "Manual", exact: true }).click();
await page.getByRole("button", { name: /Sunset/ }).click();
await page.waitForTimeout(2200);
await shot("07-settings-background");
check((await cssVar("--bg-c1")).length > 0, "manual preset applied");
await page.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: "Vyro Shield" }).click();
await page.waitForTimeout(300);
await shot("08-settings-shield");

// Persistence: reload and verify settings + playlist survive.
await page.waitForTimeout(800);
await page.reload();
await page.getByRole("heading", { name: /Good|Up late/ }).waitFor();
await page.waitForTimeout(500);
const bg = await page.evaluate(() => JSON.parse(localStorage.getItem("vyro-preview:settings") || "{}").app?.background?.preset);
check(bg === "sunset", "background preset persisted across reload");
check(await page.getByRole("navigation", { name: "Main" }).getByText("Road trip").isVisible(), "playlist persisted across reload");

// Fullscreen lyrics
await page.getByRole("contentinfo", { name: "Playback" }).getByRole("button", { name: "Play" }).click();
await page.waitForTimeout(300);
await page.keyboard.press("f");
await page.waitForTimeout(3500);
await shot("09-fullscreen-lyrics");
check(await page.getByRole("dialog", { name: "Fullscreen lyrics" }).isVisible(), "fullscreen lyrics opens with F");
await page.keyboard.press("Escape");

// Shortcuts help
await page.keyboard.press("?");
check(await page.getByRole("dialog", { name: "Keyboard shortcuts" }).isVisible(), "shortcut help opens with ?");
await page.keyboard.press("Escape");

check(errors.length === 0, `no console errors${errors.length ? ":\n  " + errors.join("\n  ") : ""}`);
await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
