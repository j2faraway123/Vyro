//! Lyrics lookup, in order of preference:
//! 1. A sidecar `.lrc` (synced) or `.txt` (plain) file next to the audio file.
//! 2. Lyrics embedded in the file's tags (USLT / LYRICS / ©lyr).
//! 3. LRCLIB (https://lrclib.net), a free, documented, key-less lyrics API,
//!    only when the user has online lyrics enabled. Results (including misses)
//!    are cached in SQLite; misses are retried after a week.

use crate::db::{self, CachedLyrics, Track};
use lofty::prelude::*;
use serde::{Deserialize, Serialize};
use std::path::Path;

const LRCLIB: &str = "https://lrclib.net/api";
const MISS_RETRY_SECS: i64 = 7 * 24 * 3600;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Lyrics {
    pub synced: Option<String>,
    pub plain: Option<String>,
    pub instrumental: bool,
    /// "sidecar", "embedded", "lrclib" or "none"
    pub source: String,
}

impl From<CachedLyrics> for Lyrics {
    fn from(c: CachedLyrics) -> Self {
        Lyrics { synced: c.synced, plain: c.plain, instrumental: c.instrumental, source: c.source }
    }
}

fn non_empty(s: Option<String>) -> Option<String> {
    s.map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

/// Very small heuristic: does the text contain at least one `[mm:ss` stamp?
pub fn looks_synced(text: &str) -> bool {
    text.lines().any(|l| {
        let l = l.trim_start();
        l.len() > 6 && l.starts_with('[') && l.as_bytes()[1].is_ascii_digit() && l[1..].contains(':')
    })
}

pub fn local_lyrics(path: &Path) -> Option<Lyrics> {
    for (ext, synced) in [("lrc", true), ("txt", false)] {
        let side = path.with_extension(ext);
        if let Ok(text) = std::fs::read_to_string(&side) {
            if let Some(text) = non_empty(Some(text)) {
                let is_synced = synced && looks_synced(&text);
                return Some(Lyrics {
                    synced: is_synced.then(|| text.clone()),
                    plain: (!is_synced).then_some(text),
                    instrumental: false,
                    source: "sidecar".into(),
                });
            }
        }
    }
    let tagged = lofty::read_from_path(path).ok()?;
    for tag in tagged.tags() {
        let text = tag
            .get_string(ItemKey::Lyrics)
            .or_else(|| tag.get_string(ItemKey::UnsyncLyrics))
            .map(str::to_string);
        if let Some(text) = non_empty(text) {
            let is_synced = looks_synced(&text);
            return Some(Lyrics {
                synced: is_synced.then(|| text.clone()),
                plain: (!is_synced).then_some(text),
                instrumental: false,
                source: "embedded".into(),
            });
        }
    }
    None
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LrclibRecord {
    duration: Option<f64>,
    instrumental: Option<bool>,
    plain_lyrics: Option<String>,
    synced_lyrics: Option<String>,
}

fn fetch_lrclib(t: &Track) -> Result<Option<Lyrics>, String> {
    let duration = format!("{}", t.duration.round() as i64);
    let (status, body) = crate::http::get_text(
        &format!("{LRCLIB}/get"),
        &[
            ("track_name", &t.title),
            ("artist_name", &t.artist),
            ("album_name", &t.album),
            ("duration", &duration),
        ],
        2 * 1024 * 1024,
    )?;
    let record: Option<LrclibRecord> = match status {
        200 => Some(serde_json::from_str(&body).map_err(|e| format!("LRCLIB returned malformed data: {e}"))?),
        404 => {
            // Fall back to search and pick the closest duration match.
            let (status, body) = crate::http::get_text(
                &format!("{LRCLIB}/search"),
                &[("track_name", &t.title), ("artist_name", &t.artist)],
                4 * 1024 * 1024,
            )?;
            if status != 200 {
                return Err(format!("LRCLIB search failed (HTTP {status})"));
            }
            let mut results: Vec<LrclibRecord> =
                serde_json::from_str(&body).map_err(|e| format!("LRCLIB returned malformed data: {e}"))?;
            results.retain(|r| r.duration.map(|d| (d - t.duration).abs() <= 3.0).unwrap_or(false));
            results.sort_by_key(|r| r.synced_lyrics.is_none());
            results.into_iter().next()
        }
        429 => return Err("LRCLIB rate limit reached; try again later".into()),
        s => return Err(format!("LRCLIB request failed (HTTP {s})")),
    };
    Ok(record.map(|r| Lyrics {
        synced: non_empty(r.synced_lyrics),
        plain: non_empty(r.plain_lyrics),
        instrumental: r.instrumental.unwrap_or(false),
        source: "lrclib".into(),
    }))
}

/// Resolves lyrics for a track. `conn` is locked only briefly around cache
/// reads/writes so a slow network call never blocks the database.
pub fn resolve(
    conn: &std::sync::Mutex<rusqlite::Connection>,
    track_id: i64,
    allow_online: bool,
    refresh: bool,
) -> Result<Lyrics, String> {
    let (track, cached) = {
        let c = conn.lock().map_err(|e| e.to_string())?;
        let t = db::track_by_id(&c, track_id)?.ok_or("Track not found")?;
        (t, db::cached_lyrics(&c, track_id)?)
    };

    if let Some(local) = local_lyrics(Path::new(&track.path)) {
        return Ok(local);
    }

    let none = Lyrics { synced: None, plain: None, instrumental: false, source: "none".into() };
    if let Some(c) = &cached {
        let is_miss = c.synced.is_none() && c.plain.is_none() && !c.instrumental;
        let fresh = db::now() - c.fetched_at < MISS_RETRY_SECS;
        if !refresh && (!is_miss || fresh) {
            return Ok(c.clone().into());
        }
    }
    if !allow_online {
        return Ok(none);
    }
    let fetched = fetch_lrclib(&track)?.unwrap_or(none);
    let c = conn.lock().map_err(|e| e.to_string())?;
    db::cache_lyrics(
        &c,
        track_id,
        &CachedLyrics {
            synced: fetched.synced.clone(),
            plain: fetched.plain.clone(),
            instrumental: fetched.instrumental,
            source: fetched.source.clone(),
            fetched_at: db::now(),
        },
    )?;
    Ok(fetched)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_synced_text() {
        assert!(looks_synced("[00:12.34] Hello\n[00:15.00] World"));
        assert!(!looks_synced("Hello\nWorld"));
        assert!(!looks_synced("[Chorus]\nla la"));
    }

    #[test]
    fn sidecar_lrc_wins() {
        let dir = tempfile::tempdir().unwrap();
        let audio = dir.path().join("song.mp3");
        std::fs::write(&audio, b"x").unwrap();
        std::fs::write(dir.path().join("song.lrc"), "[00:01.00] first\n[00:02.00] second").unwrap();
        let l = local_lyrics(&audio).unwrap();
        assert_eq!(l.source, "sidecar");
        assert!(l.synced.unwrap().contains("first"));
    }

    #[test]
    fn plain_lrc_without_stamps_is_plain() {
        let dir = tempfile::tempdir().unwrap();
        let audio = dir.path().join("song.mp3");
        std::fs::write(dir.path().join("song.lrc"), "just words").unwrap();
        let l = local_lyrics(&audio).unwrap();
        assert!(l.synced.is_none());
        assert_eq!(l.plain.as_deref(), Some("just words"));
    }
}
