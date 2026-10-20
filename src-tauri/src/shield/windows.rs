//! Windows: network blocking via WebView2's documented `WebResourceRequested`
//! event. A blocked request is answered locally with an empty HTTP 403, which
//! is how WebView2 lets a host cancel a request.

use super::Shield;
use std::sync::Arc;
use tauri::{Runtime, Webview};
use webview2_com::Microsoft::Web::WebView2::Win32::*;
use webview2_com::{take_pwstr, WebResourceRequestedEventHandler};
use windows::core::{w, Interface, PWSTR};

fn context_name(ctx: COREWEBVIEW2_WEB_RESOURCE_CONTEXT) -> &'static str {
    match ctx {
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_DOCUMENT => "document",
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_STYLESHEET => "stylesheet",
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_IMAGE => "image",
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_MEDIA => "media",
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_FONT => "font",
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_SCRIPT => "script",
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_XML_HTTP_REQUEST => "xmlhttprequest",
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_FETCH => "fetch",
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_WEBSOCKET => "websocket",
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_PING => "ping",
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_CSP_VIOLATION_REPORT => "csp_report",
        _ => "other",
    }
}

pub fn attach<R: Runtime>(window: &Webview<R>, shield: Arc<Shield>) -> Result<(), String> {
    let label = window.label().to_string();
    window
        .with_webview(move |pw| unsafe {
            let env = pw.environment();
            let Ok(core) = pw.controller().CoreWebView2() else {
                return;
            };
            // Prefer the newer registration that also covers iframes and
            // workers; fall back to the original API on older runtimes.
            let all_sources = core
                .cast::<ICoreWebView2_22>()
                .ok()
                .map(|c| {
                    c.AddWebResourceRequestedFilterWithRequestSourceKinds(
                        w!("*"),
                        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL,
                        COREWEBVIEW2_WEB_RESOURCE_REQUEST_SOURCE_KINDS_ALL,
                    )
                    .is_ok()
                })
                .unwrap_or(false);
            if !all_sources {
                let _ = core.AddWebResourceRequestedFilter(w!("*"), COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL);
            }

            let page = core.clone();
            let handler = WebResourceRequestedEventHandler::create(Box::new(move |_, args| {
                let Some(args) = args else {
                    return Ok(());
                };
                let request = args.Request()?;
                let mut uri = PWSTR::null();
                request.Uri(&mut uri)?;
                let uri = take_pwstr(uri);

                let mut ctx = COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL;
                args.ResourceContext(&mut ctx)?;

                let mut src = PWSTR::null();
                let source = if page.Source(&mut src).is_ok() { take_pwstr(src) } else { String::new() };

                if shield.check(&label, &uri, &source, context_name(ctx)) {
                    let response = env.CreateWebResourceResponse(None, 403, w!("Blocked by Vyro Shield"), w!(""))?;
                    args.SetResponse(&response)?;
                }
                Ok(())
            }));
            let mut token = 0i64;
            let _ = core.add_WebResourceRequested(&handler, &mut token);
        })
        .map_err(|e| e.to_string())
}
