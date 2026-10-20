//! Linux: network blocking through WebKitGTK content filters
//! (`WebKitUserContentFilterStore`, WebKit's documented content-blocker JSON
//! format). Lists are converted with adblock-rust's content-blocking module,
//! compiled by WebKit once per rule set (cached on disk) and attached to each
//! Vyro web window. WebKit does not report which requests it blocked, so block
//! counts are not available on Linux.

use super::Shield;
use adblock::lists::{FilterSet, ParseOptions};
use std::cell::RefCell;
use std::collections::hash_map::DefaultHasher;
use std::ffi::{c_void, CString};
use std::hash::{Hash, Hasher};
use std::sync::Arc;
use tauri::{Runtime, Webview};
use webkit2gtk::ffi as wk;
use webkit2gtk::glib::translate::ToGlibPtr;
use webkit2gtk::glib::{ffi as glib_ffi, gobject_ffi};
use webkit2gtk::gio::ffi as gio_ffi;
use webkit2gtk::WebViewExt;

/// Builds WebKit content-blocker JSON for the current configuration, or None
/// when Shield is off or no lists are downloaded.
pub fn content_rules_json(shield: &Shield) -> Option<String> {
    let cfg = shield.config.read().unwrap().clone();
    if !cfg.enabled {
        return None;
    }
    let texts = shield.active_rules_text();
    if texts.is_empty() {
        return None;
    }
    let mut set = FilterSet::new(true);
    for (_, text) in texts {
        set.add_filter_list(text, ParseOptions::default());
    }
    let (rules, _) = set.into_content_blocking().ok()?;
    let mut rules: Vec<serde_json::Value> = rules
        .into_iter()
        .filter_map(|r| serde_json::to_value(r).ok())
        .filter(|r| cfg.cosmetic_filtering || r["action"]["type"] != "css-display-none")
        .collect();
    // Never block audio/video streams.
    rules.push(serde_json::json!({
        "trigger": { "url-filter": ".*", "resource-type": ["media"] },
        "action": { "type": "ignore-previous-rules" }
    }));
    let domains: Vec<String> = cfg.allowlist.iter().map(|d| format!("*{}", d.trim().to_ascii_lowercase())).collect();
    if !domains.is_empty() {
        rules.push(serde_json::json!({
            "trigger": { "url-filter": ".*", "if-domain": domains },
            "action": { "type": "ignore-previous-rules" }
        }));
    }
    serde_json::to_string(&rules).ok()
}

struct Compiled {
    key: String,
    filter: *mut wk::WebKitUserContentFilter,
}

thread_local! {
    // GTK objects live on the main thread only.
    static COMPILED: RefCell<Option<Compiled>> = const { RefCell::new(None) };
    static WAITING: RefCell<Vec<webkit2gtk::UserContentManager>> = const { RefCell::new(Vec::new()) };
    static COMPILING: RefCell<Option<String>> = const { RefCell::new(None) };
}

fn add_filter(ucm: &webkit2gtk::UserContentManager, filter: *mut wk::WebKitUserContentFilter) {
    unsafe {
        let ptr: *mut wk::WebKitUserContentManager = ucm.to_glib_none().0;
        wk::webkit_user_content_manager_remove_all_filters(ptr);
        wk::webkit_user_content_manager_add_filter(ptr, filter);
    }
}

struct Job {
    store: *mut wk::WebKitUserContentFilterStore,
    key: String,
    json: String,
    tried_load: bool,
}

unsafe extern "C" fn on_ready(source: *mut gobject_ffi::GObject, res: *mut gio_ffi::GAsyncResult, data: *mut c_void) {
    let job = Box::from_raw(data as *mut Job);
    let store = source as *mut wk::WebKitUserContentFilterStore;
    let mut error: *mut glib_ffi::GError = std::ptr::null_mut();
    let filter = if job.tried_load {
        wk::webkit_user_content_filter_store_save_finish(store, res, &mut error)
    } else {
        wk::webkit_user_content_filter_store_load_finish(store, res, &mut error)
    };
    if !error.is_null() {
        glib_ffi::g_error_free(error);
    }
    if filter.is_null() {
        if !job.tried_load {
            // Not cached yet: compile and save.
            let id = CString::new(job.key.clone()).unwrap();
            let bytes = glib_ffi::g_bytes_new(job.json.as_ptr() as *const c_void, job.json.len());
            let store = job.store;
            let next = Box::new(Job { tried_load: true, ..*job });
            wk::webkit_user_content_filter_store_save(
                store,
                id.as_ptr(),
                bytes,
                std::ptr::null_mut(),
                Some(on_ready),
                Box::into_raw(next) as *mut c_void,
            );
            glib_ffi::g_bytes_unref(bytes);
            return;
        }
        eprintln!("Vyro Shield: WebKit could not compile the content filter");
        COMPILING.with(|c| *c.borrow_mut() = None);
        gobject_ffi::g_object_unref(job.store as *mut _);
        return;
    }
    COMPILING.with(|c| *c.borrow_mut() = None);
    COMPILED.with(|c| {
        if let Some(old) = c.borrow_mut().take() {
            wk::webkit_user_content_filter_unref(old.filter);
        }
        *c.borrow_mut() = Some(Compiled { key: job.key.clone(), filter });
    });
    WAITING.with(|w| {
        for ucm in w.borrow_mut().drain(..) {
            add_filter(&ucm, filter);
        }
    });
    gobject_ffi::g_object_unref(job.store as *mut _);
}

/// Attaches (or removes) the compiled filter on `window`. Compilation happens
/// on first use and whenever the rule set changes; until it finishes the page
/// loads unfiltered.
pub fn apply<R: Runtime>(window: &Webview<R>, shield: Arc<Shield>) -> Result<(), String> {
    let json = if shield.applies_to(window.label()) { content_rules_json(&shield) } else { None };
    let store_dir = shield.dir().join("webkit");
    window
        .with_webview(move |pw| {
            let wv = pw.inner();
            let Some(ucm) = wv.user_content_manager() else {
                return;
            };
            let Some(json) = json else {
                unsafe { wk::webkit_user_content_manager_remove_all_filters(ucm.to_glib_none().0) };
                return;
            };
            let mut h = DefaultHasher::new();
            json.hash(&mut h);
            let key = format!("vyro-shield-{:016x}", h.finish());

            let ready = COMPILED.with(|c| c.borrow().as_ref().filter(|c| c.key == key).map(|c| c.filter));
            if let Some(filter) = ready {
                add_filter(&ucm, filter);
                return;
            }
            WAITING.with(|w| w.borrow_mut().push(ucm));
            let already = COMPILING.with(|c| c.borrow().as_deref() == Some(key.as_str()));
            if already {
                return;
            }
            COMPILING.with(|c| *c.borrow_mut() = Some(key.clone()));
            let _ = std::fs::create_dir_all(&store_dir);
            let path = CString::new(store_dir.to_string_lossy().as_bytes()).unwrap();
            let id = CString::new(key.clone()).unwrap();
            unsafe {
                let store = wk::webkit_user_content_filter_store_new(path.as_ptr());
                let job = Box::new(Job { store, key, json, tried_load: false });
                wk::webkit_user_content_filter_store_load(
                    store,
                    id.as_ptr(),
                    std::ptr::null_mut(),
                    Some(on_ready),
                    Box::into_raw(job) as *mut c_void,
                );
            }
        })
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::shield::ShieldConfig;

    #[test]
    fn json_includes_media_and_allowlist_exceptions() {
        let dir = tempfile::tempdir().unwrap().keep();
        let cfg = ShieldConfig {
            enabled: true,
            custom_rules: "||ads.example.net^\nexample.org##.ad\n".into(),
            allowlist: vec!["trusted.com".into()],
            ..Default::default()
        };
        let s = Shield::new(dir, cfg);
        let json = content_rules_json(&s).unwrap();
        let v: Vec<serde_json::Value> = serde_json::from_str(&json).unwrap();
        assert!(v.iter().any(|r| r["action"]["type"] == "block"));
        assert!(v.iter().any(|r| r["action"]["type"] == "css-display-none"));
        assert!(v.iter().any(|r| r["trigger"]["resource-type"][0] == "media"));
        assert!(v.iter().any(|r| r["trigger"]["if-domain"][0] == "*trusted.com"));
        s.config.write().unwrap().enabled = false;
        assert!(content_rules_json(&s).is_none());
    }
}
