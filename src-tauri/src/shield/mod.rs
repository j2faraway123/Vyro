//! Vyro Shield: optional ad and tracker blocking for the web pages Vyro opens
//! in its own browser windows ("Web" page).
//!
//! Scope, deliberately narrow:
//! * Only Vyro web windows are filtered. The main app window (library,
//!   playback, artwork, lyrics) is never filtered, so local music and essential
//!   app requests cannot be blocked.
//! * Matching uses Brave's `adblock` crate against Adblock-Plus-syntax lists
//!   (EasyList, EasyPrivacy, ...), downloaded by the user, never bundled.
//! * Network blocking is wired to the platform's documented request hooks:
//!   WebView2's `WebResourceRequested` on Windows and WebKitGTK content filters
//!   on Linux. macOS has no network hook yet (cosmetic filtering only).
//! * Media requests and top-level page loads are never blocked, and nothing is
//!   rewritten: Shield cannot unlock paid content, defeat DRM or skip ads that a
//!   streaming service serves inside its own player.

#[cfg(target_os = "linux")]
pub mod linux;
#[cfg(windows)]
pub mod windows;

use adblock::lists::{FilterSet, ParseOptions};
use adblock::request::Request;
use adblock::Engine;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::{Arc, Mutex, RwLock};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FilterList {
    pub id: String,
    pub name: String,
    pub url: String,
    pub homepage: String,
    pub license: String,
    /// "ads", "privacy", "annoyances" or "custom"
    pub category: String,
    pub enabled: bool,
    pub builtin: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct ShieldConfig {
    pub enabled: bool,
    /// Enables lists in the "privacy" category (third-party tracker protection).
    pub tracker_protection: bool,
    pub cosmetic_filtering: bool,
    /// Block pop-up windows opened by pages (allowlisted sites may still open them).
    pub block_popups: bool,
    pub lists: Vec<FilterList>,
    /// Sites (by page host) on which Shield is fully disabled.
    pub allowlist: Vec<String>,
    /// Extra user rules in Adblock Plus syntax.
    pub custom_rules: String,
    /// Also filter the YouTube Music window. Off by default: it goes against
    /// YouTube's terms and can break playback when YouTube changes its site.
    pub youtube_music: bool,
}

/// Label of the YouTube Music window (see `ytm.rs`).
pub const YTM_LABEL: &str = "ytm";

pub fn default_lists() -> Vec<FilterList> {
    let l = |id: &str, name: &str, url: &str, homepage: &str, license: &str, category: &str, enabled: bool| FilterList {
        id: id.into(),
        name: name.into(),
        url: url.into(),
        homepage: homepage.into(),
        license: license.into(),
        category: category.into(),
        enabled,
        builtin: true,
    };
    vec![
        l("easylist", "EasyList", "https://easylist.to/easylist/easylist.txt", "https://easylist.to/", "GPLv3 or CC BY-SA 3.0", "ads", true),
        l("easyprivacy", "EasyPrivacy", "https://easylist.to/easylist/easyprivacy.txt", "https://easylist.to/", "GPLv3 or CC BY-SA 3.0", "privacy", true),
        l(
            "peterlowe",
            "Peter Lowe's ad and tracking server list",
            "https://pgl.yoyo.org/adservers/serverlist.php?hostformat=adblockplus&showintro=0&mimetype=plaintext",
            "https://pgl.yoyo.org/adservers/",
            "Free for personal use; see the site's terms",
            "ads",
            false,
        ),
        l(
            "fanboy-annoyance",
            "Fanboy's Annoyance List",
            "https://secure.fanboy.co.nz/fanboy-annoyance.txt",
            "https://easylist.to/",
            "GPLv3 or CC BY-SA 3.0",
            "annoyances",
            false,
        ),
    ]
}

impl Default for ShieldConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            tracker_protection: true,
            cosmetic_filtering: true,
            block_popups: true,
            lists: default_lists(),
            allowlist: vec![],
            custom_rules: String::new(),
            youtube_music: false,
        }
    }
}

impl ShieldConfig {
    pub fn active_lists(&self) -> impl Iterator<Item = &FilterList> {
        self.lists
            .iter()
            .filter(move |l| l.enabled && (l.category != "privacy" || self.tracker_protection))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ListStatus {
    pub downloaded: bool,
    pub updated_at: Option<i64>,
    pub bytes: u64,
    pub rules: usize,
    pub error: Option<String>,
    pub title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct EngineInfo {
    pub ready: bool,
    pub building: bool,
    pub network_rules: usize,
    pub cosmetic_rules: usize,
    pub error: Option<String>,
    pub built_at: Option<i64>,
    /// Bumped when a rebuild starts, so the UI can tell which snapshot is newer.
    pub revision: u64,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WindowStats {
    pub label: String,
    pub url: String,
    pub blocked: u64,
    pub recent: VecDeque<BlockedRequest>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BlockedRequest {
    pub url: String,
    pub request_type: String,
    pub rule: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Decision {
    pub blocked: bool,
    pub reason: String,
    pub rule: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShieldState {
    pub config: ShieldConfig,
    pub statuses: HashMap<String, ListStatus>,
    pub engine: EngineInfo,
    pub windows: Vec<WindowStats>,
    pub total_blocked: u64,
    pub platform: PlatformSupport,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformSupport {
    pub network_blocking: bool,
    /// Whether the platform hook reports individual blocked requests.
    pub block_counts: bool,
    pub cosmetic_filtering: bool,
    pub note: String,
}

/// Lists older than this are refreshed in the background at startup.
pub const STALE_AFTER: std::time::Duration = std::time::Duration::from_secs(4 * 24 * 60 * 60);

pub fn platform_support() -> PlatformSupport {
    #[cfg(windows)]
    return PlatformSupport {
        network_blocking: true,
        block_counts: true,
        cosmetic_filtering: true,
        note: "WebView2 request filtering (WebResourceRequested) is active in Vyro web windows.".into(),
    };
    #[cfg(target_os = "linux")]
    return PlatformSupport {
        network_blocking: true,
        block_counts: false,
        cosmetic_filtering: true,
        note: "WebKitGTK content filters are compiled from your lists and applied to Vyro web windows. WebKitGTK doesn't report which requests it blocked, so counts only include blocked pop-ups.".into(),
    };
    #[allow(unreachable_code)]
    PlatformSupport {
        network_blocking: false,
        block_counts: false,
        cosmetic_filtering: true,
        note: "Network blocking is not implemented on this platform yet; only element hiding is applied.".into(),
    }
}

pub struct Shield {
    dir: PathBuf,
    pub config: RwLock<ShieldConfig>,
    statuses: RwLock<HashMap<String, ListStatus>>,
    engine: RwLock<Option<Arc<Engine>>>,
    info: RwLock<EngineInfo>,
    stats: Mutex<HashMap<String, WindowStats>>,
    pending_nav: Mutex<HashMap<String, String>>,
    total: Mutex<u64>,
    /// Bumped whenever the compiled engine changes, so platform hooks can refresh.
    pub generation: Mutex<u64>,
}

pub fn host_of(url: &str) -> Option<String> {
    url::Url::parse(url).ok()?.host_str().map(|h| h.trim_start_matches("www.").to_ascii_lowercase())
}

/// `host` is covered by an allowlist entry if it equals it or is a subdomain.
pub fn allowlisted(allowlist: &[String], host: &str) -> bool {
    let host = host.trim_start_matches("www.");
    allowlist.iter().any(|d| {
        let d = d.trim().trim_start_matches("www.").to_ascii_lowercase();
        !d.is_empty() && (host == d || host.ends_with(&format!(".{d}")))
    })
}

/// Normalises user input ("https://www.Example.com/path" -> "example.com").
pub fn normalize_domain(input: &str) -> Option<String> {
    let s = input.trim();
    if s.is_empty() {
        return None;
    }
    let with_scheme = if s.contains("://") { s.to_string() } else { format!("https://{s}") };
    let host = host_of(&with_scheme)?;
    if host.contains('.') || host == "localhost" {
        Some(host)
    } else {
        None
    }
}

impl Shield {
    pub fn new(dir: PathBuf, config: ShieldConfig) -> Self {
        let _ = std::fs::create_dir_all(dir.join("lists"));
        let statuses: HashMap<String, ListStatus> = std::fs::read_to_string(dir.join("status.json"))
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();
        Self {
            dir,
            config: RwLock::new(config),
            statuses: RwLock::new(statuses),
            engine: RwLock::new(None),
            info: RwLock::new(EngineInfo::default()),
            stats: Mutex::new(HashMap::new()),
            pending_nav: Mutex::new(HashMap::new()),
            total: Mutex::new(0),
            generation: Mutex::new(0),
        }
    }

    #[cfg_attr(not(target_os = "linux"), allow(dead_code))]
    pub fn dir(&self) -> &PathBuf {
        &self.dir
    }

    fn list_path(&self, id: &str) -> PathBuf {
        let safe: String = id.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_').collect();
        self.dir.join("lists").join(format!("{safe}.txt"))
    }

    fn save_statuses(&self) {
        if let Ok(s) = serde_json::to_string_pretty(&*self.statuses.read().unwrap()) {
            let _ = std::fs::write(self.dir.join("status.json"), s);
        }
    }

    pub fn state(&self) -> ShieldState {
        let mut windows: Vec<WindowStats> = self.stats.lock().unwrap().values().cloned().collect();
        windows.sort_by(|a, b| a.label.cmp(&b.label));
        ShieldState {
            config: self.config.read().unwrap().clone(),
            statuses: self.statuses.read().unwrap().clone(),
            engine: self.info.read().unwrap().clone(),
            windows,
            total_blocked: *self.total.lock().unwrap(),
            platform: platform_support(),
        }
    }

    /// Validates downloaded text looks like a filter list rather than an
    /// error page or captive portal.
    pub fn validate_list_text(text: &str) -> Result<(), String> {
        let head = text.trim_start().chars().take(200).collect::<String>().to_ascii_lowercase();
        if head.starts_with("<!doctype") || head.starts_with("<html") || head.contains("<head") {
            return Err("The server returned a web page instead of a filter list".into());
        }
        if text.lines().filter(|l| !l.trim().is_empty() && !l.starts_with('!')).count() == 0 {
            return Err("The downloaded list is empty".into());
        }
        Ok(())
    }

    /// Downloads one list. Errors are recorded in its status and returned.
    pub fn update_list(&self, list: &FilterList) -> Result<ListStatus, String> {
        let result = (|| {
            if !list.url.starts_with("https://") {
                return Err("Filter lists must be downloaded over HTTPS".to_string());
            }
            let (status, body) = crate::http::get_text(&list.url, &[], 30 * 1024 * 1024)
                .map_err(|e| format!("Could not download {}: {e}", list.name))?;
            if status != 200 {
                return Err(format!("Could not download {}: the server answered HTTP {status}", list.name));
            }
            Self::validate_list_text(&body).map_err(|e| format!("{}: {e}", list.name))?;
            std::fs::write(self.list_path(&list.id), &body).map_err(|e| format!("Could not save {}: {e}", list.name))?;
            let meta = adblock::lists::read_list_metadata(&body);
            Ok(ListStatus {
                downloaded: true,
                updated_at: Some(crate::db::now()),
                bytes: body.len() as u64,
                rules: body.lines().filter(|l| !l.trim().is_empty() && !l.starts_with('!') && !l.starts_with('[')).count(),
                error: None,
                title: meta.title,
            })
        })();
        let mut statuses = self.statuses.write().unwrap();
        let entry = statuses.entry(list.id.clone()).or_default();
        match &result {
            Ok(s) => *entry = s.clone(),
            // Keep the previous copy usable; just surface the error.
            Err(e) => entry.error = Some(e.clone()),
        }
        drop(statuses);
        self.save_statuses();
        result
    }

    /// Downloads every active list (or only missing ones unless `force`).
    /// Downloads active lists: all of them with `force`, otherwise only the
    /// missing ones and those older than `STALE_AFTER`.
    pub fn update_lists(&self, force: bool) -> Vec<String> {
        let mut errors = vec![];
        for list in self.lists_to_update(force) {
            if let Err(e) = self.update_list(&list) {
                errors.push(e);
            }
        }
        errors
    }

    pub fn lists_to_update(&self, force: bool) -> Vec<FilterList> {
        let lists: Vec<FilterList> = self.config.read().unwrap().active_lists().cloned().collect();
        lists
            .into_iter()
            .filter(|l| {
                let age = std::fs::metadata(self.list_path(&l.id))
                    .and_then(|m| m.modified())
                    .ok()
                    .and_then(|t| t.elapsed().ok());
                force || age.map_or(true, |a| a > STALE_AFTER)
            })
            .collect()
    }

    /// Text of every active, downloaded list plus custom rules.
    pub fn active_rules_text(&self) -> Vec<(String, String)> {
        let cfg = self.config.read().unwrap().clone();
        let mut out = vec![];
        for list in cfg.active_lists() {
            if let Ok(text) = std::fs::read_to_string(self.list_path(&list.id)) {
                out.push((list.id.clone(), text));
            }
        }
        if !cfg.custom_rules.trim().is_empty() {
            out.push(("custom".into(), cfg.custom_rules.clone()));
        }
        out
    }

    /// Marks a rebuild as started. Call before handing the build to a thread so
    /// state snapshots taken in between already say `building`.
    pub fn mark_building(&self) {
        let mut info = self.info.write().unwrap();
        info.building = true;
        info.revision += 1;
    }

    pub fn build_engine(&self) {
        if !self.info.read().unwrap().building {
            self.mark_building();
        }
        let revision = self.info.read().unwrap().revision;
        let texts = self.active_rules_text();
        let mut set = FilterSet::new(false);
        let mut network = 0;
        let mut cosmetic = 0;
        for (_, text) in &texts {
            let rec = set.add_filter_list(text.clone(), ParseOptions::default());
            let _ = rec;
            for l in text.lines() {
                let l = l.trim();
                if l.is_empty() || l.starts_with('!') || l.starts_with('[') {
                    continue;
                }
                if l.contains("##") || l.contains("#@#") || l.contains("#?#") {
                    cosmetic += 1;
                } else {
                    network += 1;
                }
            }
        }
        let engine = Engine::new_with_filter_set(set);
        *self.engine.write().unwrap() = if texts.is_empty() { None } else { Some(Arc::new(engine)) };
        *self.info.write().unwrap() = EngineInfo {
            ready: !texts.is_empty(),
            building: false,
            network_rules: network,
            cosmetic_rules: cosmetic,
            error: if texts.is_empty() {
                Some("No filter lists are downloaded yet. Use \"Update lists\" to download them.".into())
            } else {
                None
            },
            built_at: Some(crate::db::now()),
            revision,
        };
        *self.generation.lock().unwrap() += 1;
    }

    pub fn set_pending_navigation(&self, label: &str, url: &str) {
        self.pending_nav.lock().unwrap().insert(label.to_string(), url.to_string());
        let mut stats = self.stats.lock().unwrap();
        let w = stats.entry(label.to_string()).or_insert_with(|| WindowStats { label: label.into(), ..Default::default() });
        w.url = url.to_string();
    }

    pub fn window_closed(&self, label: &str) {
        self.pending_nav.lock().unwrap().remove(label);
        self.stats.lock().unwrap().remove(label);
    }

    /// Pure decision for a request; does not record statistics.
    pub fn decide(&self, url: &str, source_url: &str, request_type: &str, top_level: bool) -> Decision {
        let allow = |reason: &str| Decision { blocked: false, reason: reason.into(), rule: None };
        let cfg = self.config.read().unwrap();
        if !cfg.enabled {
            return allow("Shield is off");
        }
        let lower = url.to_ascii_lowercase();
        if !(lower.starts_with("http://") || lower.starts_with("https://") || lower.starts_with("ws://") || lower.starts_with("wss://")) {
            return allow("Only web requests are filtered");
        }
        if top_level {
            return allow("Pages you open are never blocked");
        }
        if request_type == "media" {
            return allow("Audio and video streams are never blocked");
        }
        let page_host = host_of(source_url).or_else(|| host_of(url)).unwrap_or_default();
        if allowlisted(&cfg.allowlist, &page_host) {
            return allow("Site is on your allowlist");
        }
        drop(cfg);
        let Some(engine) = self.engine.read().unwrap().clone() else {
            return allow("No filter lists loaded");
        };
        let source = if source_url.is_empty() { url } else { source_url };
        let Ok(req) = Request::new(url, source, request_type, "GET") else {
            return allow("Unparseable URL");
        };
        let res = engine.check_network_request(&req);
        if res.should_block() {
            Decision { blocked: true, reason: "Matched a filter rule".into(), rule: res.filter.map(|f| format!("{f:?}")) }
        } else if res.exception.is_some() {
            allow("Matched an exception rule")
        } else {
            allow("No rule matched")
        }
    }

    /// Called from platform hooks (WebView2 on Windows). Returns true when the request must be blocked.
    /// Whether Shield filters the window with this label at all. Web windows
    /// always are; the YouTube Music window only when the user opted in.
    pub fn applies_to(&self, label: &str) -> bool {
        label.starts_with("web-") || (label == YTM_LABEL && self.config.read().unwrap().youtube_music)
    }

    #[cfg_attr(not(windows), allow(dead_code))]
    pub fn check(&self, label: &str, url: &str, source_url: &str, request_type: &str) -> bool {
        if !self.applies_to(label) {
            return false;
        }
        let mut request_type = request_type;
        let mut top_level = false;
        if request_type == "document" {
            let pending = self.pending_nav.lock().unwrap().get(label).cloned();
            if pending.as_deref() == Some(url) || source_url.is_empty() {
                top_level = true;
            } else {
                request_type = "subdocument";
            }
        }
        let d = self.decide(url, source_url, request_type, top_level);
        if d.blocked {
            self.record_block(label, url, request_type, d.rule);
        }
        d.blocked
    }

    pub fn record_block(&self, label: &str, url: &str, request_type: &str, rule: Option<String>) {
        *self.total.lock().unwrap() += 1;
        let mut stats = self.stats.lock().unwrap();
        let w = stats.entry(label.to_string()).or_insert_with(|| WindowStats { label: label.into(), ..Default::default() });
        w.blocked += 1;
        w.recent.push_front(BlockedRequest { url: url.chars().take(300).collect(), request_type: request_type.into(), rule });
        w.recent.truncate(50);
    }

    pub fn reset_window_count(&self, label: &str) {
        if let Some(w) = self.stats.lock().unwrap().get_mut(label) {
            w.blocked = 0;
            w.recent.clear();
        }
    }

    /// CSS-hiding script for `url`, or None when cosmetic filtering doesn't apply.
    pub fn cosmetic_script(&self, url: &str) -> Option<String> {
        let cfg = self.config.read().unwrap();
        if !cfg.enabled || !cfg.cosmetic_filtering {
            return None;
        }
        if allowlisted(&cfg.allowlist, &host_of(url).unwrap_or_default()) {
            return None;
        }
        drop(cfg);
        let engine = self.engine.read().unwrap().clone()?;
        let res = engine.url_cosmetic_resources(url);
        if res.hide_selectors.is_empty() {
            return None;
        }
        let mut selectors: Vec<&String> = res.hide_selectors.iter().collect();
        selectors.sort();
        // Chunked into separate rules: the CSS parser drops a rule whose
        // selector list is invalid, so one bad selector only costs its chunk.
        let css: String = selectors
            .chunks(200)
            .map(|c| format!("{}{{display:none!important}}", c.iter().map(|s| s.as_str()).collect::<Vec<_>>().join(",")))
            .collect::<Vec<_>>()
            .join("\n");
        let css_json = serde_json::to_string(&css).ok()?;
        Some(format!(
            "(function(){{var id='vyro-shield-cosmetic';var put=function(){{if(document.getElementById(id))return;var root=document.head||document.documentElement;if(!root)return setTimeout(put,10);var s=document.createElement('style');s.id=id;s.textContent={css_json};root.appendChild(s);}};try{{put();}}catch(e){{}}}})();"
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn shield_with_rules(rules: &str) -> Shield {
        let dir = tempfile::tempdir().unwrap().keep();
        let mut cfg = ShieldConfig { enabled: true, ..Default::default() };
        cfg.custom_rules = rules.into();
        let s = Shield::new(dir, cfg);
        s.build_engine();
        s
    }

    #[test]
    fn blocks_matching_third_party_ad() {
        let s = shield_with_rules("||ads.example.net^\n");
        let d = s.decide("https://ads.example.net/banner.js", "https://news.example.org/", "script", false);
        assert!(d.blocked, "{d:?}");
        let ok = s.decide("https://cdn.example.org/app.js", "https://news.example.org/", "script", false);
        assert!(!ok.blocked);
    }

    #[test]
    fn never_blocks_media_top_level_or_non_web() {
        let s = shield_with_rules("||ads.example.net^\n");
        assert!(!s.decide("https://ads.example.net/a.mp3", "https://x.org/", "media", false).blocked);
        assert!(!s.decide("https://ads.example.net/", "", "document", true).blocked);
        assert!(!s.decide("asset://localhost/C:/music/a.mp3", "", "media", false).blocked);
        assert!(!s.decide("file:///music/ads.example.net.mp3", "", "other", false).blocked);
    }

    #[test]
    fn allowlist_and_disable_turn_blocking_off() {
        let s = shield_with_rules("||ads.example.net^\n");
        s.config.write().unwrap().allowlist = vec!["example.org".into()];
        assert!(!s.decide("https://ads.example.net/a.js", "https://news.example.org/", "script", false).blocked);
        s.config.write().unwrap().allowlist.clear();
        s.config.write().unwrap().enabled = false;
        assert!(!s.decide("https://ads.example.net/a.js", "https://news.example.org/", "script", false).blocked);
    }

    #[test]
    fn exception_rules_win() {
        let s = shield_with_rules("||ads.example.net^\n@@||ads.example.net/allowed.js\n");
        assert!(!s.decide("https://ads.example.net/allowed.js", "https://x.org/", "script", false).blocked);
    }

    #[test]
    fn check_counts_blocks_per_window_and_treats_subdocuments() {
        let s = shield_with_rules("||ads.example.net^$subdocument\n");
        s.set_pending_navigation("web-1", "https://x.org/");
        assert!(!s.check("web-1", "https://x.org/", "", "document"));
        assert!(s.check("web-1", "https://ads.example.net/frame.html", "https://x.org/", "document"));
        let st = s.state();
        assert_eq!(st.total_blocked, 1);
        assert_eq!(st.windows[0].blocked, 1);
    }

    #[test]
    fn youtube_music_window_is_filtered_only_when_opted_in() {
        let s = shield_with_rules("||ads.example.net^\n");
        let ad = "https://ads.example.net/pagead.js";
        let page = "https://music.youtube.com/";
        assert!(!s.check(YTM_LABEL, ad, page, "script"));
        assert!(!s.applies_to(YTM_LABEL));
        assert!(!s.applies_to("main"));
        s.config.write().unwrap().youtube_music = true;
        assert!(s.applies_to(YTM_LABEL));
        assert!(s.check(YTM_LABEL, ad, page, "script"));
        // Streams stay untouched there too.
        assert!(!s.check(YTM_LABEL, "https://ads.example.net/a.webm", page, "media"));
        s.config.write().unwrap().allowlist = vec!["music.youtube.com".into()];
        assert!(!s.check(YTM_LABEL, ad, page, "script"));
    }

    #[test]
    fn cosmetic_selectors_for_site() {
        let s = shield_with_rules("example.org##.sponsored\n");
        let js = s.cosmetic_script("https://example.org/page").unwrap();
        assert!(js.contains(".sponsored"));
        assert!(s.cosmetic_script("https://other.org/").is_none());
    }

    #[test]
    fn domain_helpers() {
        assert_eq!(normalize_domain("https://www.Example.com/path").as_deref(), Some("example.com"));
        assert_eq!(normalize_domain("music.example.com").as_deref(), Some("music.example.com"));
        assert_eq!(normalize_domain("nonsense"), None);
        assert!(allowlisted(&["example.com".into()], "a.example.com"));
        assert!(!allowlisted(&["example.com".into()], "badexample.com"));
    }

    #[test]
    fn rejects_html_as_list() {
        assert!(Shield::validate_list_text("<!DOCTYPE html><html>").is_err());
        assert!(Shield::validate_list_text("! only comments\n").is_err());
        assert!(Shield::validate_list_text("||ads.example^\n").is_ok());
    }

    #[test]
    fn privacy_lists_follow_tracker_toggle() {
        let mut cfg = ShieldConfig::default();
        assert!(cfg.active_lists().any(|l| l.id == "easyprivacy"));
        cfg.tracker_protection = false;
        assert!(!cfg.active_lists().any(|l| l.id == "easyprivacy"));
    }
}
