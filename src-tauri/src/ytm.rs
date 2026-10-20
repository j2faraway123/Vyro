//! YouTube Music inside Vyro's main window.
//!
//! music.youtube.com runs in a child webview placed over Vyro's content area
//! (the frontend reports where that area is), signed in with the user's own
//! account, and plays through YouTube's own player. Vyro never touches the
//! audio stream or sign-in. Vyro Shield filters this window only when the user
//! turns on its YouTube Music option, and then only the way it filters web
//! windows: refusing matching requests and hiding matching elements.
//!
//! The window gets no IPC access. An initialization script reads the page's
//! Media Session metadata (what the browser shows in the OS media overlay)
//! and reports it by briefly setting a prefixed `document.title`, which Rust
//! receives through `on_document_title_changed`. Vyro's controls are sent back
//! with `eval`, pressing YouTube Music's own buttons.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use tauri::webview::NewWindowResponse;
use tauri::webview::{PageLoadEvent, WebviewBuilder};
use tauri::window::WindowBuilder;
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Rect, Webview, WebviewUrl, WindowEvent};

pub const LABEL: &str = crate::shield::YTM_LABEL;
const HOME: &str = "https://music.youtube.com/";
const PREFIX: &str = "\u{2063}vyro:";

/// Snapshot of what YouTube Music is playing, as reported by the page.
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct YtmState {
    pub active: bool,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub artwork: Option<String>,
    pub playing: bool,
    #[serde(deserialize_with = "num_or_zero")]
    pub position: f64,
    #[serde(deserialize_with = "num_or_zero")]
    pub duration: f64,
}

/// JSON.stringify turns NaN and Infinity into null.
fn num_or_zero<'de, D: serde::Deserializer<'de>>(d: D) -> Result<f64, D::Error> {
    Ok(Option::<f64>::deserialize(d)?.unwrap_or(0.0))
}

/// Parses a reported title. Returns None for ordinary page titles.
pub fn parse_report(title: &str) -> Option<YtmState> {
    let json = title.strip_prefix(PREFIX)?;
    let mut s: YtmState = serde_json::from_str(json).ok()?;
    let cut = |v: &mut String, n: usize| {
        if v.chars().count() > n {
            *v = v.chars().take(n).collect();
        }
    };
    cut(&mut s.title, 300);
    cut(&mut s.artist, 300);
    cut(&mut s.album, 300);
    s.artwork = s.artwork.filter(|u| u.starts_with("https://") && u.len() < 2048 && artwork_host_allowed(u));
    if !s.position.is_finite() || s.position < 0.0 {
        s.position = 0.0;
    }
    if !s.duration.is_finite() || s.duration < 0.0 {
        s.duration = 0.0;
    }
    Some(s)
}

/// Artwork is only fetched from Google's image hosts.
pub fn artwork_host_allowed(url: &str) -> bool {
    let Ok(u) = url::Url::parse(url) else { return false };
    if u.scheme() != "https" {
        return false;
    }
    let h = u.host_str().unwrap_or("");
    h.ends_with(".googleusercontent.com") || h.ends_with(".ggpht.com") || h == "i.ytimg.com" || h.ends_with(".ytimg.com")
}

fn host_is_google(u: &url::Url) -> bool {
    let h = u.host_str().unwrap_or("");
    ["youtube.com", "google.com", "gstatic.com", "googleusercontent.com", "youtu.be"]
        .iter()
        .any(|d| h == *d || h.ends_with(&format!(".{d}")))
}

/// The reporter and control bridge injected into music.youtube.com.
const BRIDGE_JS: &str = r#"
(() => {
  if (window.top !== window || window.__vyroYtm) return;
  const PREFIX = "⁣vyro:";
  let lastKey = "", lastSent = 0, restoreTimer = null, queued = null, realTitle = document.title;
  const video = () => document.querySelector("video");
  const art = (md) => {
    const a = md && md.artwork;
    if (!a || !a.length) return null;
    let best = a[0];
    for (const x of a) {
      const w = parseInt(String(x.sizes || "").split("x")[0], 10) || 0;
      const bw = parseInt(String(best.sizes || "").split("x")[0], 10) || 0;
      if (w > bw) best = x;
    }
    return best.src || null;
  };
  const snapshot = () => {
    const md = navigator.mediaSession && navigator.mediaSession.metadata;
    const v = video();
    if (!md || !md.title) return { active: false };
    return {
      active: true,
      title: md.title || "",
      artist: md.artist || "",
      album: md.album || "",
      artwork: art(md),
      playing: !!v && !v.paused && !v.ended,
      position: v ? v.currentTime || 0 : 0,
      duration: v && isFinite(v.duration) ? v.duration : 0,
    };
  };
  const send = (s) => {
    if (restoreTimer) { queued = s; return; }
    const t = document.title;
    if (!t.startsWith(PREFIX)) realTitle = t;
    document.title = PREFIX + JSON.stringify(s);
    restoreTimer = setTimeout(() => {
      restoreTimer = null;
      if (document.title.startsWith(PREFIX)) document.title = realTitle;
      if (queued) { const q = queued; queued = null; send(q); }
    }, 120);
  };
  const report = (force) => {
    const s = snapshot();
    const key = JSON.stringify([s.active, s.title, s.artist, s.album, s.artwork, s.playing, Math.round(s.duration || 0)]);
    const now = Date.now();
    if (!force && key === lastKey && now - lastSent < 15000) return;
    lastKey = key;
    lastSent = now;
    send(s);
  };
  setInterval(() => report(false), 1000);
  for (const ev of ["play", "pause", "ended", "seeked", "loadedmetadata"]) {
    document.addEventListener(ev, () => setTimeout(() => report(true), 60), true);
  }
  const click = (sel) => {
    const b = document.querySelector(sel);
    if (b) { b.click(); return true; }
    return false;
  };
  window.__vyroYtm = {
    control(action, value) {
      const v = video();
      if (action === "toggle" || action === "play" || action === "pause") {
        const playing = !!v && !v.paused;
        if (action === "play" && playing) return;
        if (action === "pause" && !playing) return;
        if (!click("ytmusic-player-bar #play-pause-button") && v) playing ? v.pause() : v.play();
      } else if (action === "next") {
        click("ytmusic-player-bar .next-button");
      } else if (action === "prev") {
        click("ytmusic-player-bar .previous-button");
      } else if (action === "seek" && v && isFinite(value)) {
        v.currentTime = Math.max(0, value);
      }
      setTimeout(() => report(true), 300);
    },
    report: () => report(true),
  };
})();
"#;

/// Debug builds can point the webview at a local stand-in page for testing.
fn home() -> String {
    #[cfg(debug_assertions)]
    if let Ok(u) = std::env::var("VYRO_YTM_URL") {
        return u;
    }
    HOME.to_string()
}

/// Where the embedded page sits inside the main window, in CSS pixels.
#[derive(Debug, Clone, Copy, Deserialize, PartialEq)]
pub struct Bounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl Bounds {
    fn usable(self) -> Option<Self> {
        let ok = [self.x, self.y, self.width, self.height].iter().all(|v| v.is_finite());
        (ok && self.width >= 1.0 && self.height >= 1.0).then_some(self)
    }
}

fn webview(app: &AppHandle) -> Option<Webview> {
    app.get_webview(LABEL)
}

fn place(w: &Webview, b: Bounds) -> Result<(), String> {
    w.set_bounds(Rect { position: LogicalPosition::new(b.x, b.y).into(), size: LogicalSize::new(b.width, b.height).into() })
        .map_err(|e| e.to_string())?;
    w.show().map_err(|e| e.to_string())
}

/// How YouTube Music is shown.
#[derive(Debug, Clone, Copy, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum Mode {
    /// Inside Vyro's main window, over the content area.
    Embedded,
    /// In its own window. Used on Linux, where WebKitGTK child webviews are
    /// stacked by GTK and can't be placed over part of the window.
    Window,
}

pub const MODE: Mode = if cfg!(target_os = "linux") { Mode::Window } else { Mode::Embedded };

/// Opens YouTube Music (inside Vyro's main window where supported), or brings it into view.
pub fn open(app: &AppHandle, data_dir: &std::path::Path, shield: std::sync::Arc<crate::shield::Shield>, bounds: Bounds) -> Result<Mode, String> {
    if let Some(w) = webview(app) {
        match MODE {
            Mode::Embedded => place(&w, bounds.usable().ok_or("There's no room to show YouTube Music")?)?,
            Mode::Window => {
                let win = w.window();
                let _ = win.unminimize();
                let _ = win.show();
                let _ = win.set_focus();
            }
        }
        return Ok(MODE);
    }
    let title_app = app.clone();
    let load_shield = shield.clone();
    let load_app = app.clone();
    let url = home().parse().map_err(|e| format!("Bad YouTube Music URL: {e}"))?;
    let builder = WebviewBuilder::new(LABEL, WebviewUrl::External(url))
        .data_directory(data_dir.join("web-profile"))
        .initialization_script(BRIDGE_JS)
        .on_navigation(|u| u.scheme() == "https" || u.scheme() == "about" || (cfg!(debug_assertions) && u.scheme() == "http"))
        .on_new_window(|u, _| {
            // Google sign-in and account pages may open pop-ups; anything else is refused.
            if host_is_google(&u) {
                NewWindowResponse::Allow
            } else {
                NewWindowResponse::Deny
            }
        })
        .on_page_load(move |w, payload| {
            if matches!(payload.event(), PageLoadEvent::Started) {
                load_shield.reset_window_count(w.label());
            } else if load_shield.applies_to(w.label()) {
                if let Some(js) = load_shield.cosmetic_script(payload.url().as_str()) {
                    let _ = w.eval(&js);
                }
                let _ = load_app.emit_to("main", "shield-stats", load_shield.state().windows);
            }
        })
        .on_document_title_changed(move |w, title| {
            if let Some(state) = parse_report(&title) {
                let _ = title_app.emit_to("main", "ytm-state", Some(state));
            } else if MODE == Mode::Window && !title.is_empty() {
                let _ = w.window().set_title(&format!("{title} · Vyro"));
            }
        });
    let fail = |e: tauri::Error| format!("Could not open YouTube Music: {e}");
    let webview = match MODE {
        Mode::Embedded => {
            let b = bounds.usable().ok_or("There's no room to show YouTube Music")?;
            let main = app.get_window("main").ok_or("Vyro's main window is missing")?;
            main.add_child(builder, LogicalPosition::new(b.x, b.y), LogicalSize::new(b.width, b.height)).map_err(fail)?
        }
        Mode::Window => {
            let win = WindowBuilder::new(app, "ytm-window")
                .title("YouTube Music · Vyro")
                .inner_size(1180.0, 820.0)
                .min_inner_size(420.0, 360.0)
                .build()
                .map_err(fail)?;
            let close_app = app.clone();
            win.on_window_event(move |e| {
                if let WindowEvent::Destroyed = e {
                    closed(&close_app);
                }
            });
            win.add_child(builder.auto_resize(), LogicalPosition::new(0.0, 0.0), LogicalSize::new(1180.0, 820.0)).map_err(fail)?
        }
    };

    // Requests are checked against `Shield::applies_to` on every call, so the
    // hook can be attached up front and the YouTube Music option takes effect
    // without reloading the page.
    #[cfg(windows)]
    crate::shield::windows::attach(&webview, shield.clone())?;
    #[cfg(target_os = "linux")]
    crate::shield::linux::apply(&webview, shield.clone())?;
    let _ = webview;
    Ok(MODE)
}

/// Moves the embedded page, or hides it (it keeps playing) when `bounds` is None.
pub fn set_bounds(app: &AppHandle, bounds: Option<Bounds>) -> Result<(), String> {
    if MODE == Mode::Window {
        return Ok(());
    }
    let Some(w) = webview(app) else { return Ok(()) };
    match bounds.and_then(Bounds::usable) {
        Some(b) => place(&w, b),
        None => w.hide().map_err(|e| e.to_string()),
    }
}

pub fn reload(app: &AppHandle) -> Result<(), String> {
    webview(app).ok_or("YouTube Music isn't open")?.reload().map_err(|e| e.to_string())
}

/// Closes YouTube Music, which stops its playback.
pub fn close(app: &AppHandle) -> Result<(), String> {
    let Some(w) = webview(app) else { return Ok(()) };
    match MODE {
        // Destroying the window reports the close through `closed`.
        Mode::Window => w.window().close().map_err(|e| e.to_string()),
        Mode::Embedded => {
            w.close().map_err(|e| e.to_string())?;
            closed(app);
            Ok(())
        }
    }
}

fn closed(app: &AppHandle) {
    let state = app.state::<crate::AppState>();
    state.shield.window_closed(LABEL);
    let _ = app.emit_to("main", "shield-stats", state.shield.state().windows);
    let _ = app.emit_to("main", "ytm-state", None::<YtmState>);
    let _ = app.emit_to("main", "ytm-closed", ());
}

pub fn control(app: &AppHandle, action: &str, value: Option<f64>) -> Result<(), String> {
    if !matches!(action, "toggle" | "play" | "pause" | "next" | "prev" | "seek") {
        return Err(format!("Unknown action {action}"));
    }
    let w = webview(app).ok_or("YouTube Music isn't open")?;
    let value = value.filter(|v| v.is_finite()).unwrap_or(0.0);
    w.eval(format!("window.__vyroYtm && window.__vyroYtm.control({action:?}, {value})"))
        .map_err(|e| e.to_string())
}

/// Palette for YouTube artwork, so the dynamic background follows it too.
pub fn artwork_palette(url: &str) -> Result<Vec<String>, String> {
    static CACHE: OnceLock<Mutex<HashMap<String, Vec<String>>>> = OnceLock::new();
    if !artwork_host_allowed(url) {
        return Err("Artwork host not allowed".into());
    }
    let cache = CACHE.get_or_init(Default::default);
    if let Some(p) = cache.lock().unwrap().get(url) {
        return Ok(p.clone());
    }
    let (status, bytes) = crate::http::get_bytes(url, 8 * 1024 * 1024)?;
    if status != 200 {
        return Err(format!("Artwork request failed (HTTP {status})"));
    }
    let img = image::load_from_memory(&bytes).map_err(|e| format!("Unreadable artwork: {e}"))?;
    let colors = crate::palette::extract(&img, 5);
    let mut c = cache.lock().unwrap();
    if c.len() > 200 {
        c.clear();
    }
    c.insert(url.to_string(), colors.clone());
    Ok(colors)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_reports_and_ignores_page_titles() {
        assert!(parse_report("YouTube Music").is_none());
        let t = format!(
            "{PREFIX}{}",
            r#"{"active":true,"title":"Song","artist":"Band","album":"LP","artwork":"https://lh3.googleusercontent.com/abc=w544","playing":true,"position":12.5,"duration":201}"#
        );
        let s = parse_report(&t).unwrap();
        assert_eq!(s.title, "Song");
        assert!(s.playing);
        assert_eq!(s.artwork.as_deref(), Some("https://lh3.googleusercontent.com/abc=w544"));
    }

    #[test]
    fn rejects_untrusted_artwork_and_bad_numbers() {
        let t = format!("{PREFIX}{}", r#"{"active":true,"title":"x","artwork":"https://evil.example/a.png","position":-4,"duration":null}"#);
        let s = parse_report(&t).unwrap();
        assert!(s.artwork.is_none());
        assert_eq!(s.position, 0.0);
        assert!(!artwork_host_allowed("http://i.ytimg.com/vi/x/hq.jpg"));
        assert!(artwork_host_allowed("https://i.ytimg.com/vi/x/hq.jpg"));
        assert!(!artwork_host_allowed("https://ytimg.com.evil.net/a.jpg"));
    }

    #[test]
    fn missing_fields_default() {
        let s = parse_report(&format!("{PREFIX}{{\"active\":false}}")).unwrap();
        assert!(!s.active);
        assert_eq!(s.title, "");
    }
}
