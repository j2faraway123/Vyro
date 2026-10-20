mod db;
mod http;
mod lyrics;
mod palette;
mod scanner;
mod shield;
mod ytm;

use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tauri::webview::{NewWindowResponse, PageLoadEvent};
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder, WindowEvent};

type CmdResult<T> = Result<T, String>;

pub struct AppState {
    db: Arc<Mutex<rusqlite::Connection>>,
    data_dir: PathBuf,
    scan: Arc<Mutex<scanner::ScanProgress>>,
    shield: Arc<shield::Shield>,
    web_counter: AtomicU64,
}

impl AppState {
    fn conn(&self) -> CmdResult<std::sync::MutexGuard<'_, rusqlite::Connection>> {
        self.db.lock().map_err(|_| "Database is unavailable".to_string())
    }
    fn artwork_dir(&self) -> PathBuf {
        self.data_dir.join("artwork")
    }
}

// ---------------------------------------------------------------- library

#[tauri::command]
fn library_tracks(state: State<AppState>) -> CmdResult<Vec<db::Track>> {
    db::all_tracks(&*state.conn()?)
}

#[tauri::command]
fn library_folders(state: State<AppState>) -> CmdResult<Vec<db::Folder>> {
    db::folders(&*state.conn()?)
}

#[tauri::command]
fn scan_status(state: State<AppState>) -> scanner::ScanProgress {
    state.scan.lock().map(|s| s.clone()).unwrap_or_default()
}

fn allow_media_path(app: &AppHandle, path: &Path) {
    let scope = app.asset_protocol_scope();
    if path.is_dir() {
        let _ = scope.allow_directory(path, true);
    } else {
        let _ = scope.allow_file(path);
    }
}

fn start_scan(app: AppHandle, roots: Vec<PathBuf>, force: bool, prune: bool) -> CmdResult<()> {
    let state = app.state::<AppState>();
    {
        let mut s = state.scan.lock().map_err(|e| e.to_string())?;
        if s.running {
            return Err("A library scan is already running".into());
        }
        s.running = true;
    }
    for r in &roots {
        allow_media_path(&app, r);
    }
    let db = state.db.clone();
    let scan = state.scan.clone();
    let art = state.artwork_dir();
    std::thread::spawn(move || {
        let mut last = std::time::Instant::now();
        let result = scanner::scan(&db, &roots, art, force, prune, |p| {
            if let Ok(mut s) = scan.lock() {
                *s = p.clone();
            }
            if !p.running || last.elapsed().as_millis() > 150 {
                last = std::time::Instant::now();
                let _ = app.emit("scan-progress", p);
            }
        });
        if let Ok(mut s) = scan.lock() {
            *s = result.clone();
        }
        let _ = app.emit("library-changed", &result);
    });
    Ok(())
}

#[tauri::command]
fn library_add_folders(app: AppHandle, state: State<AppState>, paths: Vec<String>) -> CmdResult<()> {
    let mut roots = vec![];
    {
        let conn = state.conn()?;
        for p in paths {
            let path = PathBuf::from(&p);
            if !path.is_dir() {
                return Err(format!("{p} is not a folder"));
            }
            db::add_folder(&conn, &p)?;
            roots.push(path);
        }
    }
    start_scan(app, roots, false, false)
}

#[tauri::command]
fn library_import_files(app: AppHandle, paths: Vec<String>) -> CmdResult<()> {
    let roots: Vec<PathBuf> = paths.into_iter().map(PathBuf::from).filter(|p| p.is_file() && scanner::is_audio(p)).collect();
    if roots.is_empty() {
        return Err(format!(
            "None of the selected files are supported audio files ({})",
            scanner::AUDIO_EXTENSIONS.join(", ")
        ));
    }
    start_scan(app, roots, false, false)
}

#[tauri::command]
fn library_rescan(app: AppHandle, state: State<AppState>, force: bool) -> CmdResult<()> {
    let roots: Vec<PathBuf> = db::folders(&*state.conn()?)?.into_iter().map(|f| PathBuf::from(f.path)).collect();
    if roots.is_empty() {
        return Err("Add a music folder first".into());
    }
    start_scan(app, roots, force, true)
}

#[tauri::command]
fn library_remove_folder(app: AppHandle, state: State<AppState>, id: i64) -> CmdResult<()> {
    db::remove_folder(&*state.conn()?, id)?;
    let _ = app.emit("library-changed", ());
    Ok(())
}

#[tauri::command]
fn library_remove_tracks(app: AppHandle, state: State<AppState>, ids: Vec<i64>) -> CmdResult<()> {
    db::remove_tracks(&*state.conn()?, &ids)?;
    let _ = app.emit("library-changed", ());
    Ok(())
}

// ---------------------------------------------------------------- favorites, history, playlists

#[tauri::command]
fn favorites_list(state: State<AppState>) -> CmdResult<Vec<i64>> {
    db::favorites(&*state.conn()?)
}

#[tauri::command]
fn favorite_set(state: State<AppState>, track_id: i64, favorite: bool) -> CmdResult<()> {
    db::set_favorite(&*state.conn()?, track_id, favorite)
}

#[tauri::command]
fn plays_record(state: State<AppState>, track_id: i64) -> CmdResult<()> {
    db::record_play(&*state.conn()?, track_id)
}

#[tauri::command]
fn plays_recent(state: State<AppState>, limit: i64) -> CmdResult<Vec<db::Play>> {
    db::recent_plays(&*state.conn()?, limit.clamp(1, 2000))
}

#[tauri::command]
fn plays_clear(state: State<AppState>) -> CmdResult<()> {
    db::clear_history(&*state.conn()?)
}

#[tauri::command]
fn playlists_list(state: State<AppState>) -> CmdResult<Vec<db::Playlist>> {
    db::playlists(&*state.conn()?)
}

#[tauri::command]
fn playlist_create(state: State<AppState>, name: String, description: String, track_ids: Vec<i64>) -> CmdResult<i64> {
    let mut conn = state.conn()?;
    let id = db::create_playlist(&conn, &name, &description)?;
    if !track_ids.is_empty() {
        db::set_playlist_tracks(&mut conn, id, &track_ids)?;
    }
    Ok(id)
}

#[tauri::command]
fn playlist_update(state: State<AppState>, id: i64, name: String, description: String) -> CmdResult<()> {
    db::update_playlist(&*state.conn()?, id, &name, &description)
}

#[tauri::command]
fn playlist_delete(state: State<AppState>, id: i64) -> CmdResult<()> {
    db::delete_playlist(&*state.conn()?, id)
}

#[tauri::command]
fn playlist_set_tracks(state: State<AppState>, id: i64, track_ids: Vec<i64>) -> CmdResult<()> {
    db::set_playlist_tracks(&mut *state.conn()?, id, &track_ids)
}

#[tauri::command]
fn playlist_add_tracks(state: State<AppState>, id: i64, track_ids: Vec<i64>) -> CmdResult<()> {
    db::add_to_playlist(&mut *state.conn()?, id, &track_ids)
}

// ---------------------------------------------------------------- settings, themes, files

#[tauri::command]
fn settings_all(state: State<AppState>) -> CmdResult<HashMap<String, serde_json::Value>> {
    db::settings(&*state.conn()?)
}

#[tauri::command]
fn settings_set(state: State<AppState>, key: String, value: serde_json::Value) -> CmdResult<()> {
    if key == "shield" {
        return Err("Use the Shield commands to change Shield settings".into());
    }
    db::set_setting(&*state.conn()?, &key, &value)
}

#[tauri::command]
fn themes_list(state: State<AppState>) -> CmdResult<Vec<serde_json::Value>> {
    db::themes(&*state.conn()?)
}

#[tauri::command]
fn theme_save(state: State<AppState>, theme: serde_json::Value) -> CmdResult<()> {
    let id = theme.get("id").and_then(|v| v.as_str()).ok_or("Theme is missing an id")?.to_string();
    db::save_theme(&*state.conn()?, &id, &theme)
}

#[tauri::command]
fn theme_delete(state: State<AppState>, id: String) -> CmdResult<()> {
    db::delete_theme(&*state.conn()?, &id)
}

/// Reads a user-chosen theme file (JSON only, at most 1 MB).
#[tauri::command]
fn read_theme_file(path: String) -> CmdResult<String> {
    let p = PathBuf::from(&path);
    if p.extension().and_then(|e| e.to_str()).map(|e| e.eq_ignore_ascii_case("json")) != Some(true) {
        return Err("Themes must be .json files".into());
    }
    let meta = std::fs::metadata(&p).map_err(|e| format!("Could not open {path}: {e}"))?;
    if meta.len() > 1024 * 1024 {
        return Err("Theme file is larger than 1 MB".into());
    }
    std::fs::read_to_string(&p).map_err(|e| format!("Could not read {path}: {e}"))
}

#[tauri::command]
fn write_theme_file(path: String, contents: String) -> CmdResult<()> {
    let mut p = PathBuf::from(&path);
    if p.extension().and_then(|e| e.to_str()).map(|e| e.eq_ignore_ascii_case("json")) != Some(true) {
        p.set_extension("json");
    }
    std::fs::write(&p, contents).map_err(|e| format!("Could not save {}: {e}", p.display()))
}

/// Copies a user-chosen image into Vyro's data folder for use as a background.
#[tauri::command]
fn background_import(app: AppHandle, state: State<AppState>, path: String) -> CmdResult<String> {
    let src = PathBuf::from(&path);
    let ext = src.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
    if !matches!(ext.as_str(), "jpg" | "jpeg" | "png" | "webp" | "gif" | "avif") {
        return Err("Choose a JPG, PNG, WebP, GIF or AVIF image".into());
    }
    let dir = state.data_dir.join("backgrounds");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let dest = dir.join(format!("bg-{}.{ext}", db::now()));
    std::fs::copy(&src, &dest).map_err(|e| format!("Could not import image: {e}"))?;
    allow_media_path(&app, &dest);
    Ok(dest.to_string_lossy().to_string())
}

// ---------------------------------------------------------------- lyrics

#[tauri::command]
async fn lyrics_get(app: AppHandle, track_id: i64, allow_online: bool, refresh: bool) -> CmdResult<lyrics::Lyrics> {
    let db = app.state::<AppState>().db.clone();
    tauri::async_runtime::spawn_blocking(move || lyrics::resolve(&db, track_id, allow_online, refresh))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
fn lyrics_clear_cache(state: State<AppState>) -> CmdResult<()> {
    db::clear_lyrics_cache(&*state.conn()?)
}

// ---------------------------------------------------------------- YouTube Music

#[tauri::command]
fn ytm_open(app: AppHandle, state: State<AppState>, bounds: ytm::Bounds) -> CmdResult<ytm::Mode> {
    ytm::open(&app, &state.data_dir, state.shield.clone(), bounds)
}

#[tauri::command]
fn ytm_set_bounds(app: AppHandle, bounds: Option<ytm::Bounds>) -> CmdResult<()> {
    ytm::set_bounds(&app, bounds)
}

#[tauri::command]
fn ytm_reload(app: AppHandle) -> CmdResult<()> {
    ytm::reload(&app)
}

#[tauri::command]
fn ytm_close(app: AppHandle) -> CmdResult<()> {
    ytm::close(&app)
}

#[tauri::command]
fn ytm_control(app: AppHandle, action: String, value: Option<f64>) -> CmdResult<()> {
    ytm::control(&app, &action, value)
}

#[tauri::command]
async fn ytm_palette(url: String) -> CmdResult<Vec<String>> {
    tauri::async_runtime::spawn_blocking(move || ytm::artwork_palette(&url)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn lyrics_lookup(title: String, artist: String, album: String, duration: f64) -> CmdResult<lyrics::Lyrics> {
    tauri::async_runtime::spawn_blocking(move || lyrics::lookup(&title, &artist, &album, duration))
        .await
        .map_err(|e| e.to_string())?
}

// ---------------------------------------------------------------- Vyro Shield

fn save_shield_config(state: &AppState) -> CmdResult<()> {
    let cfg = state.shield.config.read().unwrap().clone();
    db::set_setting(&*state.conn()?, "shield", &serde_json::to_value(cfg).map_err(|e| e.to_string())?)
}

/// Rebuilds the matching engine off the UI thread, then refreshes web windows.
fn rebuild_shield(app: AppHandle) {
    app.state::<AppState>().shield.mark_building();
    std::thread::spawn(move || {
        let state = app.state::<AppState>();
        state.shield.build_engine();
        refresh_web_windows(&app);
        let _ = app.emit("shield-changed", state.shield.state());
    });
}

fn refresh_web_windows(app: &AppHandle) {
    #[cfg(target_os = "linux")]
    {
        let shield = app.state::<AppState>().shield.clone();
        for (label, w) in app.webview_windows() {
            if label.starts_with("web-") {
                let _ = shield::linux::apply(w.as_ref(), shield.clone());
            }
        }
        if let Some(w) = app.get_webview(shield::YTM_LABEL) {
            let _ = shield::linux::apply(&w, shield.clone());
        }
    }
    let _ = app;
}

#[tauri::command]
fn shield_state(state: State<AppState>) -> shield::ShieldState {
    state.shield.state()
}

#[tauri::command]
fn shield_set_config(app: AppHandle, state: State<AppState>, config: shield::ShieldConfig) -> CmdResult<shield::ShieldState> {
    let mut config = config;
    config.allowlist = config.allowlist.iter().filter_map(|d| shield::normalize_domain(d)).collect();
    config.allowlist.sort();
    config.allowlist.dedup();
    let prev = state.shield.config.read().unwrap().clone();
    let rules_changed = prev.lists != config.lists
        || prev.custom_rules != config.custom_rules
        || prev.tracker_protection != config.tracker_protection;
    let needs_refresh = rules_changed || prev.enabled != config.enabled || prev.allowlist != config.allowlist || prev.cosmetic_filtering != config.cosmetic_filtering
        || prev.youtube_music != config.youtube_music;
    *state.shield.config.write().unwrap() = config;
    save_shield_config(&state)?;
    if rules_changed {
        rebuild_shield(app);
    } else if needs_refresh {
        refresh_web_windows(&app);
    }
    Ok(state.shield.state())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateResult {
    errors: Vec<String>,
    state: shield::ShieldState,
}

#[tauri::command]
async fn shield_update_lists(app: AppHandle, force: bool, only: Option<String>) -> CmdResult<UpdateResult> {
    let app2 = app.clone();
    let errors = tauri::async_runtime::spawn_blocking(move || {
        let state = app2.state::<AppState>();
        let errors = match only {
            Some(id) => {
                let list = state.shield.config.read().unwrap().lists.iter().find(|l| l.id == id).cloned();
                match list {
                    Some(l) => state.shield.update_list(&l).err().into_iter().collect(),
                    None => vec![format!("Unknown filter list {id}")],
                }
            }
            None => state.shield.update_lists(force),
        };
        state.shield.build_engine();
        refresh_web_windows(&app2);
        errors
    })
    .await
    .map_err(|e| e.to_string())?;
    let state = app.state::<AppState>();
    let s = state.shield.state();
    let _ = app.emit("shield-changed", &s);
    Ok(UpdateResult { errors, state: s })
}

#[tauri::command]
fn shield_add_list(app: AppHandle, state: State<AppState>, name: String, url: String) -> CmdResult<shield::ShieldState> {
    let url = url.trim().to_string();
    if !url.starts_with("https://") || url::Url::parse(&url).is_err() {
        return Err("Enter a valid https:// address for the filter list".into());
    }
    let name = if name.trim().is_empty() { shield::host_of(&url).unwrap_or_else(|| "Custom list".into()) } else { name.trim().to_string() };
    {
        let mut cfg = state.shield.config.write().unwrap();
        if cfg.lists.iter().any(|l| l.url == url) {
            return Err("That list is already added".into());
        }
        let id = format!("custom-{}", db::now());
        cfg.lists.push(shield::FilterList {
            id,
            name,
            url,
            homepage: String::new(),
            license: "Check the list's own license".into(),
            category: "custom".into(),
            enabled: true,
            builtin: false,
        });
    }
    save_shield_config(&state)?;
    rebuild_shield(app);
    Ok(state.shield.state())
}

#[tauri::command]
fn shield_remove_list(app: AppHandle, state: State<AppState>, id: String) -> CmdResult<shield::ShieldState> {
    state.shield.config.write().unwrap().lists.retain(|l| l.builtin || l.id != id);
    save_shield_config(&state)?;
    rebuild_shield(app);
    Ok(state.shield.state())
}

#[tauri::command]
fn shield_test(state: State<AppState>, url: String, source_url: String, request_type: String) -> shield::Decision {
    state.shield.decide(&url, &source_url, &request_type, false)
}

#[tauri::command]
fn shield_reset_defaults(app: AppHandle, state: State<AppState>) -> CmdResult<shield::ShieldState> {
    let enabled = state.shield.config.read().unwrap().enabled;
    *state.shield.config.write().unwrap() = shield::ShieldConfig { enabled, ..Default::default() };
    save_shield_config(&state)?;
    rebuild_shield(app);
    Ok(state.shield.state())
}

// ---------------------------------------------------------------- web windows

fn open_web_window(app: &AppHandle, url: url::Url) -> CmdResult<String> {
    let state = app.state::<AppState>();
    let n = state.web_counter.fetch_add(1, Ordering::SeqCst) + 1;
    let label = format!("web-{n}");
    let shield = state.shield.clone();
    let host = url.host_str().unwrap_or("").to_string();
    shield.set_pending_navigation(&label, url.as_str());

    let nav_shield = shield.clone();
    let nav_label = label.clone();
    let load_shield = shield.clone();
    let popup_shield = shield.clone();
    let popup_label = label.clone();
    let popup_app = app.clone();
    let load_app = app.clone();

    let window = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(url.clone()))
        .title(format!("Vyro Web · {host}"))
        .inner_size(1200.0, 820.0)
        .min_inner_size(480.0, 360.0)
        .data_directory(state.data_dir.join("web-profile"))
        .on_navigation(move |u| {
            nav_shield.set_pending_navigation(&nav_label, u.as_str());
            true
        })
        .on_page_load(move |w, payload| {
            let url = payload.url().to_string();
            if matches!(payload.event(), PageLoadEvent::Started) {
                load_shield.reset_window_count(w.label());
            }
            if let Some(js) = load_shield.cosmetic_script(&url) {
                let _ = w.eval(&js);
            }
            let host = payload.url().host_str().unwrap_or("").to_string();
            let _ = w.set_title(&format!("Vyro Web · {host}"));
            let _ = load_app.emit_to("main", "shield-stats", load_shield.state().windows);
        })
        .on_new_window(move |u, _features| {
            let cfg = popup_shield.config.read().unwrap().clone();
            let source = popup_shield.state().windows.iter().find(|w| w.label == popup_label).map(|w| w.url.clone()).unwrap_or_default();
            let page_host = shield::host_of(&source).unwrap_or_default();
            if cfg.enabled && shield::allowlisted(&cfg.allowlist, &page_host) {
                return NewWindowResponse::Allow;
            }
            if cfg.enabled && cfg.block_popups {
                popup_shield.record_block(&popup_label, u.as_str(), "popup", None);
                return NewWindowResponse::Deny;
            }
            // Open it as another filtered Vyro web window instead.
            let app = popup_app.clone();
            std::thread::spawn(move || {
                let _ = open_web_window(&app, u);
            });
            NewWindowResponse::Deny
        })
        .build()
        .map_err(|e| format!("Could not open the web window: {e}"))?;

    #[cfg(windows)]
    shield::windows::attach(window.as_ref(), shield.clone())?;
    #[cfg(target_os = "linux")]
    shield::linux::apply(window.as_ref(), shield.clone())?;

    let close_label = label.clone();
    let close_app = app.clone();
    window.on_window_event(move |e| {
        if let WindowEvent::Destroyed = e {
            let state = close_app.state::<AppState>();
            state.shield.window_closed(&close_label);
            let _ = close_app.emit_to("main", "shield-stats", state.shield.state().windows);
        }
    });
    Ok(label)
}

#[tauri::command]
async fn web_open(app: AppHandle, url: String) -> CmdResult<String> {
    let input = url.trim();
    let with_scheme = if input.contains("://") { input.to_string() } else { format!("https://{input}") };
    let parsed = url::Url::parse(&with_scheme).map_err(|_| "Enter a valid web address".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("Only http and https pages can be opened".into());
    }
    open_web_window(&app, parsed)
}

#[tauri::command]
fn web_focus(app: AppHandle, label: String) -> CmdResult<()> {
    let w = app.get_webview_window(&label).ok_or("That web window is closed")?;
    w.set_focus().map_err(|e| e.to_string())
}

#[tauri::command]
fn web_close(app: AppHandle, label: String) -> CmdResult<()> {
    if !label.starts_with("web-") {
        return Err("Not a web window".into());
    }
    if let Some(w) = app.get_webview_window(&label) {
        w.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    version: String,
    data_dir: String,
    platform: String,
    formats: Vec<String>,
}

#[tauri::command]
fn app_info(state: State<AppState>) -> AppInfo {
    AppInfo {
        version: env!("CARGO_PKG_VERSION").into(),
        data_dir: state.data_dir.to_string_lossy().to_string(),
        platform: std::env::consts::OS.into(),
        formats: scanner::AUDIO_EXTENSIONS.iter().map(|s| s.to_string()).collect(),
    }
}

/// The main window is a plain window holding Vyro's own webview (label
/// "main", filling the window), so YouTube Music can be added beside it as a
/// child webview (see `ytm.rs`). A config-defined window can't host that on
/// every platform.
fn open_main_window(app: &AppHandle) -> tauri::Result<()> {
    let bg = tauri::window::Color(0x17, 0x17, 0x17, 0xff);
    let window = tauri::window::WindowBuilder::new(app, "main")
        .title("Vyro")
        .inner_size(1440.0, 900.0)
        .min_inner_size(960.0, 620.0)
        .background_color(bg)
        .build()?;
    let size = window.inner_size()?.to_logical::<f64>(window.scale_factor()?);
    // Debug builds can start an automated YouTube Music check (see e2e/ytm-embed-check.ps1).
    let page = if cfg!(debug_assertions) && std::env::var_os("VYRO_E2E_YTM").is_some() { "index.html#e2e-ytm" } else { "index.html" };
    window.add_child(
        tauri::webview::WebviewBuilder::new("main", WebviewUrl::App(page.into()))
            .background_color(bg)
            .auto_resize(),
        tauri::LogicalPosition::new(0.0, 0.0),
        size,
    )?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let conn = db::open(&data_dir.join("vyro.db")).map_err(std::io::Error::other)?;

            let shield_cfg: shield::ShieldConfig = db::get_setting(&conn, "shield")
                .ok()
                .flatten()
                .and_then(|v| serde_json::from_value(v).ok())
                .unwrap_or_default();
            let shield = Arc::new(shield::Shield::new(data_dir.join("shield"), shield_cfg));

            // Re-allow the library folders, artwork and backgrounds for the asset protocol.
            let scope = app.asset_protocol_scope();
            for dir in ["artwork", "backgrounds"] {
                let d = data_dir.join(dir);
                let _ = std::fs::create_dir_all(&d);
                let _ = scope.allow_directory(&d, true);
            }
            if let Ok(folders) = db::folders(&conn) {
                for f in folders {
                    let _ = scope.allow_directory(&f.path, true);
                }
            }
            if let Ok(tracks) = db::all_tracks(&conn) {
                let folders: Vec<String> = db::folders(&conn).unwrap_or_default().into_iter().map(|f| f.path).collect();
                for t in tracks.iter().filter(|t| !folders.iter().any(|f| t.path.starts_with(f.as_str()))) {
                    let _ = scope.allow_file(&t.path);
                }
            }

            app.manage(AppState {
                db: Arc::new(Mutex::new(conn)),
                data_dir,
                scan: Arc::new(Mutex::new(scanner::ScanProgress::default())),
                shield: shield.clone(),
                web_counter: AtomicU64::new(0),
            });

            open_main_window(app.handle())?;

            // Build the filter engine in the background so startup stays fast.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                shield.build_engine();
                let _ = handle.emit("shield-changed", shield.state());
                // Refresh missing or stale lists once per launch while Shield is on.
                if shield.config.read().unwrap().enabled && !shield.lists_to_update(false).is_empty() {
                    let _ = shield.update_lists(false);
                    shield.build_engine();
                    refresh_web_windows(&handle);
                    let _ = handle.emit("shield-changed", shield.state());
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            library_tracks,
            library_folders,
            scan_status,
            library_add_folders,
            library_import_files,
            library_rescan,
            library_remove_folder,
            library_remove_tracks,
            favorites_list,
            favorite_set,
            plays_record,
            plays_recent,
            plays_clear,
            playlists_list,
            playlist_create,
            playlist_update,
            playlist_delete,
            playlist_set_tracks,
            playlist_add_tracks,
            settings_all,
            settings_set,
            themes_list,
            theme_save,
            theme_delete,
            read_theme_file,
            write_theme_file,
            background_import,
            lyrics_get,
            lyrics_clear_cache,
            shield_state,
            shield_set_config,
            shield_update_lists,
            shield_add_list,
            shield_remove_list,
            shield_test,
            shield_reset_defaults,
            web_open,
            web_focus,
            web_close,
            ytm_open,
            ytm_set_bounds,
            ytm_reload,
            ytm_close,
            ytm_control,
            ytm_palette,
            lyrics_lookup,
            app_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Vyro");
}
