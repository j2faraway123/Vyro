//! Shared HTTP client (lyrics + filter-list downloads). Uses the operating
//! system's certificate store and honours HTTPS_PROXY / HTTP_PROXY.

use std::sync::OnceLock;
use std::time::Duration;
use ureq::tls::{RootCerts, TlsConfig};
use ureq::Agent;

pub const USER_AGENT: &str = concat!("Vyro/", env!("CARGO_PKG_VERSION"), " (desktop music player)");

pub fn agent() -> &'static Agent {
    static AGENT: OnceLock<Agent> = OnceLock::new();
    AGENT.get_or_init(|| {
        Agent::config_builder()
            .user_agent(USER_AGENT)
            .timeout_global(Some(Duration::from_secs(30)))
            .http_status_as_error(false)
            .tls_config(TlsConfig::builder().root_certs(RootCerts::PlatformVerifier).build())
            .build()
            .into()
    })
}

/// GET returning (status, body). Bodies are capped at `limit` bytes.
pub fn get_text(url: &str, query: &[(&str, &str)], limit: u64) -> Result<(u16, String), String> {
    let mut req = agent().get(url);
    for (k, v) in query {
        req = req.query(*k, *v);
    }
    let mut resp = req.call().map_err(describe)?;
    let status = resp.status().as_u16();
    let body = resp
        .body_mut()
        .with_config()
        .limit(limit)
        .read_to_string()
        .map_err(describe)?;
    Ok((status, body))
}

/// GET returning (status, bytes). Bodies are capped at `limit` bytes.
pub fn get_bytes(url: &str, limit: u64) -> Result<(u16, Vec<u8>), String> {
    let mut resp = agent().get(url).call().map_err(describe)?;
    let status = resp.status().as_u16();
    let body = resp.body_mut().with_config().limit(limit).read_to_vec().map_err(describe)?;
    Ok((status, body))
}

fn describe(e: ureq::Error) -> String {
    match e {
        ureq::Error::Timeout(_) => "The request timed out".into(),
        ureq::Error::HostNotFound => "Could not resolve the host (are you offline?)".into(),
        ureq::Error::Io(io) => format!("Network error: {io}"),
        other => other.to_string(),
    }
}
