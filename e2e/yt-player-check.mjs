// Checks Vyro's YouTube player in the browser preview. Requests for
// https://www.youtube.com/embed/* are answered by a stand-in that speaks the
// embedded player's postMessage protocol, so no real YouTube is needed.
// Usage: node e2e/yt-player-check.mjs [baseUrl] [outDir]
import { chromium } from "playwright-core";
import fs from "node:fs";

const base = process.argv[2] ?? "http://localhost:1420/";
const out = process.argv[3] ?? "e2e/screenshots";
fs.mkdirSync(out, { recursive: true });

// A fake embedded player: a clock instead of a video. Logs commands to the parent via window.name-free channel (postMessage).
const STANDIN = (videoId) => `<!doctype html><html><body style="margin:0;background:#200;color:#fff;font:16px sans-serif;display:flex;align-items:center;justify-content:center;height:100vh">
<div id="t">stand-in</div>
<script>
let id = ${JSON.stringify(videoId)};
const lengths = { vyroDemo001: 6, vyroDemo003: 180 };
let state = -1, time = 0, last = performance.now(), listening = false, volume = null, muted = null;
const send = (m) => parent.postMessage(JSON.stringify(m), "*");
const info = () => ({ event: "infoDelivery", info: { currentTime: time, duration: lengths[id] || 0, playerState: state, videoData: { video_id: id }, standin: { volume, muted } } });
function start(v) {
  id = v; time = 0; state = -1;
  document.getElementById("t").textContent = "video " + id;
  if (id === "vyroBlocked") { setTimeout(() => send({ event: "onError", info: 150 }), 100); return; }
  state = 1; last = performance.now();
  send({ event: "onStateChange", info: 1 });
}
setInterval(() => {
  const now = performance.now();
  if (state === 1) { time += (now - last) / 1000; const d = lengths[id] || 0; if (d && time >= d) { time = d; state = 0; send({ event: "onStateChange", info: 0 }); } }
  last = now;
  if (listening) send(info());
}, 200);
addEventListener("message", (e) => {
  let m; try { m = JSON.parse(e.data); } catch { return; }
  if (m.event === "listening") { if (!listening) { listening = true; send({ event: "onReady" }); start(id); } return; }
  if (m.event !== "command") return;
  const [a, b] = m.args || [];
  switch (m.func) {
    case "playVideo": state = 1; send({ event: "onStateChange", info: 1 }); break;
    case "pauseVideo": state = 2; send({ event: "onStateChange", info: 2 }); break;
    case "stopVideo": state = 5; break;
    case "seekTo": time = a; break;
    case "loadVideoById": start(a); break;
    case "setVolume": volume = a; break;
    case "mute": muted = true; break;
    case "unMute": muted = false; break;
  }
});
</script></body></html>`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium", args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
let embedLoads = 0;
await page.route("https://www.youtube.com/embed/**", (route) => {
  embedLoads++;
  const id = new URL(route.request().url()).pathname.split("/").pop();
  route.fulfill({ status: 200, contentType: "text/html", body: STANDIN(id) });
});
await page.addInitScript(() => localStorage.setItem("vyro-yt-demo", "1"));

let failures = 0;
const check = (cond, msg) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${msg}`);
  if (!cond) failures++;
};
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
const frameBox = () =>
  page.evaluate(() => {
    const f = document.querySelector("iframe[data-yt-player]");
    if (!f) return null;
    const r = f.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top), visible: getComputedStyle(f).visibility === "visible" };
  });
const bar = page.getByRole("contentinfo", { name: "Playback" });
const barText = () => bar.innerText();

await page.goto(base);
await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "YouTube", exact: true }).click();
await page.getByRole("searchbox", { name: "Search YouTube" }).fill("demo");
await page.getByRole("main").getByRole("button", { name: "Search", exact: true }).click();
await page.getByText("Night Signal").waitFor();
check(await page.getByText(/1 video left out/).isVisible(), "hidden-video note shown");
await shot("yt-01-results");

await page.getByRole("button", { name: "Play Night Signal" }).click();
await page.waitForTimeout(1500);
let box = await frameBox();
check(box && box.visible && box.w >= 200 && box.h >= 200, `player visible in the now-playing slot (${JSON.stringify(box)})`);
const slot = await page.evaluate(() => {
  const r = document.querySelector("[data-yt-slot]")?.getBoundingClientRect();
  return r ? { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width) } : null;
});
check(slot && box && slot.x === box.x && slot.y === box.y && slot.w === box.w, "player sits exactly over the slot");
check((await barText()).includes("Night Signal"), "playback bar shows the YouTube song");
check(await bar.getByRole("button", { name: "Pause" }).isVisible(), "playback bar shows Pause while it plays");
await shot("yt-02-playing");

// Pause and resume from Vyro's controls.
await bar.getByRole("button", { name: "Pause" }).click();
await page.waitForTimeout(700);
check(await bar.getByRole("button", { name: "Play", exact: true }).isVisible(), "pause from Vyro pauses the player");
await bar.getByRole("button", { name: "Play", exact: true }).click();
await page.waitForTimeout(700);
check(await bar.getByRole("button", { name: "Pause" }).isVisible(), "play from Vyro resumes");

// The first song is 6 s long; when it ends, the blocked one errors and is skipped.
await page.waitForTimeout(6500);
const t = await barText();
check(t.includes("Afterglow"), `ended → next, and the unembeddable video is skipped (bar: ${t.split("\n").slice(0, 2).join(" | ")})`);
check(await page.getByText(/doesn't allow this video to play outside YouTube/).first().isVisible(), "skipped video explained in a toast");
check(embedLoads === 1, `later songs reuse the same player (${embedLoads} page loads)`);

// Close the panel: the player floats in a corner, still at least 200 px.
await page.getByRole("button", { name: "Hide panel" }).click();
await page.waitForTimeout(500);
box = await frameBox();
check(box && box.visible && box.w === 356 && box.h === 200, `player floats when the panel is hidden (${JSON.stringify(box)})`);
await shot("yt-03-floating");

// Fullscreen lyrics: the player floats above the overlay.
await page.getByRole("button", { name: "Fullscreen lyrics" }).first().click();
await page.waitForTimeout(600);
const onTop = await page.evaluate(() => {
  const f = document.querySelector("iframe[data-yt-player]");
  const r = f.getBoundingClientRect();
  return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === f;
});
check(onTop, "player stays on top of fullscreen lyrics");
await shot("yt-03b-fullscreen");
await page.keyboard.press("Escape");
await page.waitForTimeout(400);

// Volume reaches the player.
const vol = await page.evaluate(() => new Promise((res) => {
  const h = (e) => {
    try {
      const m = JSON.parse(e.data);
      if (m.info?.standin) {
        removeEventListener("message", h);
        res(m.info.standin);
      }
    } catch {}
  };
  addEventListener("message", h);
}));
check(typeof vol.volume === "number", `volume is passed to the player (${JSON.stringify(vol)})`);

// Playing a local album hands playback back and hides the player.
await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Library" }).click();
const card = page.getByRole("button", { name: "Play Glass Harbor", exact: true }).first();
await card.hover();
await card.click();
await page.waitForTimeout(1500);
box = await frameBox();
check(box && !box.visible, "player hidden after switching to a local album");
check(!(await barText()).includes("Afterglow"), "playback bar shows the local track");
await shot("yt-04-local");
const ytState = await page.evaluate(() => new Promise((res) => {
  const h = (e) => {
    try {
      const m = JSON.parse(e.data);
      if (m.event === "infoDelivery") {
        removeEventListener("message", h);
        res(m.info.playerState);
      }
    } catch {}
  };
  addEventListener("message", h);
}));
check(ytState === 2, `YouTube player paused when the local album started (state ${ytState})`);
check(await bar.getByRole("button", { name: "Pause" }).isVisible(), "local album is playing");

// Back to YouTube from the results.
await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "YouTube", exact: true }).click();
await page.getByRole("button", { name: "Play Afterglow" }).click();
await page.waitForTimeout(1200);
box = await frameBox();
check(box && box.visible, "player shows again when a YouTube song is played");
check((await barText()).includes("Afterglow") && (await bar.getByRole("button", { name: "Pause" }).isVisible()), "YouTube takes over the playback bar");

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join("; ")}` : ""}`);
await browser.close();
console.log(failures ? `${failures} check(s) failed` : "All YouTube player checks passed");
process.exit(failures ? 1 : 0);
