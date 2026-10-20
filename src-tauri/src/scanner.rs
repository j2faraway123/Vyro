//! Library import: walks folders, reads tags and properties with `lofty`,
//! extracts embedded (or folder) artwork into the app's artwork cache and
//! computes an accent palette for each distinct cover.

use crate::{db, palette};
use lofty::picture::PictureType;
use lofty::prelude::*;
use rusqlite::Connection;
use serde::Serialize;
use std::collections::{hash_map::DefaultHasher, HashMap, HashSet};
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

pub const AUDIO_EXTENSIONS: &[&str] = &["mp3", "flac", "wav", "m4a", "aac", "ogg", "oga", "opus"];
const COVER_NAMES: &[&str] = &["cover", "folder", "front", "album", "artwork"];

pub fn is_audio(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| AUDIO_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub running: bool,
    pub total: usize,
    pub processed: usize,
    pub added: usize,
    pub updated: usize,
    pub removed: usize,
    pub skipped: usize,
    pub current: Option<String>,
    pub errors: Vec<String>,
}

/// Collects audio files from a mix of folders and individual files.
pub fn collect_files(roots: &[PathBuf]) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    for root in roots {
        if root.is_file() {
            if is_audio(root) && seen.insert(root.clone()) {
                out.push(root.clone());
            }
            continue;
        }
        for entry in WalkDir::new(root).follow_links(true).into_iter().filter_map(Result::ok) {
            let p = entry.path();
            if entry.file_type().is_file() && is_audio(p) && seen.insert(p.to_path_buf()) {
                out.push(p.to_path_buf());
            }
        }
    }
    out
}

pub struct ArtworkCache {
    dir: PathBuf,
    /// cover-bytes hash -> (artwork file, palette)
    seen: HashMap<u64, (String, Vec<String>)>,
    /// folder -> folder cover result
    folder_covers: HashMap<PathBuf, Option<(String, Vec<String>)>>,
}

impl ArtworkCache {
    pub fn new(dir: PathBuf) -> Self {
        let _ = std::fs::create_dir_all(&dir);
        Self { dir, seen: HashMap::new(), folder_covers: HashMap::new() }
    }

    fn store(&mut self, bytes: &[u8]) -> Option<(String, Vec<String>)> {
        let mut h = DefaultHasher::new();
        bytes.hash(&mut h);
        let key = h.finish();
        if let Some(v) = self.seen.get(&key) {
            return Some(v.clone());
        }
        let img = image::load_from_memory(bytes).ok()?;
        let colors = palette::extract(&img, 5);
        // Store a bounded-size JPEG so huge embedded scans don't bloat the cache.
        let file = self.dir.join(format!("{key:016x}.jpg"));
        if !file.exists() {
            let thumb = if img.width() > 800 || img.height() > 800 {
                img.resize(800, 800, image::imageops::FilterType::Lanczos3)
            } else {
                img
            };
            thumb.to_rgb8().save_with_format(&file, image::ImageFormat::Jpeg).ok()?;
        }
        let v = (file.to_string_lossy().to_string(), colors);
        self.seen.insert(key, v.clone());
        Some(v)
    }

    fn folder_cover(&mut self, dir: &Path) -> Option<(String, Vec<String>)> {
        if let Some(v) = self.folder_covers.get(dir) {
            return v.clone();
        }
        let mut found = None;
        if let Ok(entries) = std::fs::read_dir(dir) {
            let mut candidates: Vec<PathBuf> = entries
                .filter_map(Result::ok)
                .map(|e| e.path())
                .filter(|p| {
                    let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
                    let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_ascii_lowercase();
                    matches!(ext.as_str(), "jpg" | "jpeg" | "png" | "webp") && COVER_NAMES.contains(&stem.as_str())
                })
                .collect();
            candidates.sort();
            for c in candidates {
                if let Ok(bytes) = std::fs::read(&c) {
                    if let Some(v) = self.store(&bytes) {
                        found = Some(v);
                        break;
                    }
                }
            }
        }
        self.folder_covers.insert(dir.to_path_buf(), found.clone());
        found
    }
}

fn file_stamp(path: &Path) -> (i64, i64) {
    let meta = std::fs::metadata(path).ok();
    let size = meta.as_ref().map(|m| m.len() as i64).unwrap_or(0);
    let mtime = meta
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    (size, mtime)
}

fn clean(s: Option<std::borrow::Cow<'_, str>>) -> Option<String> {
    s.map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

/// Splits a leading track number off a file name: "02 - Title" -> (Some(2), "Title").
fn split_track_number(stem: &str) -> (Option<i64>, &str) {
    let digits = stem.bytes().take_while(u8::is_ascii_digit).count();
    if digits == 0 || digits > 3 {
        return (None, stem);
    }
    let rest = stem[digits..].trim_start_matches([' ', '.', '-', '_']);
    if rest.len() == stem.len() - digits || rest.trim().is_empty() {
        return (None, stem);
    }
    (stem[..digits].parse().ok(), rest.trim())
}

fn dir_name(dir: Option<&Path>) -> Option<String> {
    dir.and_then(|d| d.file_name()).and_then(|n| n.to_str()).map(str::trim).filter(|n| !n.is_empty()).map(String::from)
}

/// Reads one file into a `Track` (id 0; the database assigns it).
/// Untagged files fall back to the file name for title and track number,
/// and, when the file looks like part of an album (numbered name or a folder
/// cover), to the folder layout "Artist/Album/NN Title.ext".
pub fn read_track(path: &Path, art: &mut ArtworkCache) -> Result<db::Track, String> {
    let tagged = lofty::read_from_path(path).map_err(|e| format!("{}: {e}", path.display()))?;
    let props = tagged.properties();
    let tag = tagged.primary_tag().or_else(|| tagged.first_tag());

    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("Unknown").to_string();
    let format = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
    let (file_size, mtime) = file_stamp(path);

    let (stem_no, stem_title) = split_track_number(&stem);
    let mut t = db::Track {
        path: path.to_string_lossy().to_string(),
        title: stem_title.to_string(),
        track_no: stem_no,
        artist: "Unknown Artist".into(),
        album: "Unknown Album".into(),
        album_artist: String::new(),
        duration: props.duration().as_secs_f64(),
        format,
        bitrate: props.audio_bitrate().map(|b| b as i64),
        sample_rate: props.sample_rate().map(|s| s as i64),
        file_size,
        mtime,
        added_at: db::now(),
        ..Default::default()
    };

    if let Some(tag) = tag {
        if let Some(v) = clean(tag.title()) {
            t.title = v;
        }
        if let Some(v) = clean(tag.artist()) {
            t.artist = v;
        }
        if let Some(v) = clean(tag.album()) {
            t.album = v;
        }
        if let Some(v) = tag.get_string(ItemKey::AlbumArtist).map(str::trim).filter(|s| !s.is_empty()) {
            t.album_artist = v.to_string();
        }
        t.genre = clean(tag.genre());
        t.track_no = tag.track().map(|n| n as i64).or(t.track_no);
        t.disc_no = tag.disk().map(|n| n as i64);
        t.year = tag.date().map(|d| d.year as i64).filter(|y| *y > 0);

        let pic = tag
            .pictures()
            .iter()
            .find(|p| p.pic_type() == PictureType::CoverFront)
            .or_else(|| tag.pictures().first());
        if let Some(pic) = pic {
            if let Some((file, colors)) = art.store(pic.data()) {
                t.artwork = Some(file);
                t.palette = Some(colors);
            }
        }
    }
    let mut folder_cover = false;
    if t.artwork.is_none() {
        if let Some(dir) = path.parent() {
            if let Some((file, colors)) = art.folder_cover(dir) {
                t.artwork = Some(file);
                t.palette = Some(colors);
                folder_cover = true;
            }
        }
    }
    let untagged_album = tag.map_or(true, |tag| clean(tag.album()).is_none());
    if untagged_album && (stem_no.is_some() || folder_cover) {
        let dir = path.parent();
        if let Some(album) = dir_name(dir) {
            t.album = album;
            if t.artist == "Unknown Artist" {
                if let Some(artist) = dir_name(dir.and_then(Path::parent)) {
                    t.artist = artist;
                }
            }
        }
    }
    if t.album_artist.is_empty() {
        t.album_artist = t.artist.clone();
    }
    Ok(t)
}

/// Scans `roots`, upserting changed files and (when `prune_missing` is set)
/// removing tracks under the roots whose files no longer exist.
pub fn scan(
    conn: &std::sync::Mutex<Connection>,
    roots: &[PathBuf],
    art_dir: PathBuf,
    force: bool,
    prune_missing: bool,
    mut progress: impl FnMut(&ScanProgress),
) -> ScanProgress {
    let mut p = ScanProgress { running: true, ..Default::default() };
    progress(&p);
    let files = collect_files(roots);
    p.total = files.len();
    progress(&p);

    let stamps = conn.lock().ok().and_then(|c| db::file_stamps(&c).ok()).unwrap_or_default();
    let mut art = ArtworkCache::new(art_dir);
    let mut batch: Vec<db::Track> = Vec::new();

    let flush = |batch: &mut Vec<db::Track>| {
        if batch.is_empty() {
            return;
        }
        if let Ok(mut c) = conn.lock() {
            if let Ok(tx) = c.transaction() {
                for t in batch.iter() {
                    let _ = db::upsert_track(&tx, t);
                }
                let _ = tx.commit();
            }
        }
        batch.clear();
    };

    for (i, file) in files.iter().enumerate() {
        let key = file.to_string_lossy().to_string();
        let known = stamps.get(&key);
        if !force {
            if let Some(stamp) = known {
                if *stamp == file_stamp(file) {
                    p.skipped += 1;
                    p.processed = i + 1;
                    continue;
                }
            }
        }
        match read_track(file, &mut art) {
            Ok(t) => {
                if known.is_some() {
                    p.updated += 1;
                } else {
                    p.added += 1;
                }
                batch.push(t);
            }
            Err(e) => {
                if p.errors.len() < 50 {
                    p.errors.push(e);
                }
            }
        }
        p.processed = i + 1;
        if batch.len() >= 50 {
            flush(&mut batch);
        }
        if i % 10 == 0 || i + 1 == files.len() {
            p.current = file.file_name().map(|n| n.to_string_lossy().to_string());
            progress(&p);
        }
    }
    flush(&mut batch);

    if prune_missing {
        let found: HashSet<String> = files.iter().map(|f| f.to_string_lossy().to_string()).collect();
        let missing: Vec<String> = stamps
            .keys()
            .filter(|path| {
                !found.contains(*path)
                    && roots.iter().any(|r| r.is_dir() && Path::new(path).starts_with(r))
                    && !Path::new(path).exists()
            })
            .cloned()
            .collect();
        if let Ok(c) = conn.lock() {
            p.removed = db::delete_tracks_by_paths(&c, &missing).unwrap_or(0);
        }
    }

    p.running = false;
    p.current = None;
    progress(&p);
    p
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn track_numbers_split_from_file_names() {
        assert_eq!(split_track_number("02 Red Two"), (Some(2), "Red Two"));
        assert_eq!(split_track_number("07 - Song"), (Some(7), "Song"));
        assert_eq!(split_track_number("1.Intro"), (Some(1), "Intro"));
        assert_eq!(split_track_number("1999"), (None, "1999"));
        assert_eq!(split_track_number("99 Luftballons"), (Some(99), "Luftballons"));
        assert_eq!(split_track_number("2Pac"), (None, "2Pac"));
        assert_eq!(split_track_number("Untagged Tone"), (None, "Untagged Tone"));
    }

    #[test]
    fn audio_extension_filter() {
        assert!(is_audio(Path::new("a/b/Song.FLAC")));
        assert!(is_audio(Path::new("x.m4a")));
        assert!(!is_audio(Path::new("cover.jpg")));
        assert!(!is_audio(Path::new("noext")));
    }

    #[test]
    fn collect_skips_non_audio_and_dedupes() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("a.mp3"), b"x").unwrap();
        std::fs::write(dir.path().join("b.txt"), b"x").unwrap();
        std::fs::create_dir(dir.path().join("sub")).unwrap();
        std::fs::write(dir.path().join("sub/c.flac"), b"x").unwrap();
        let files = collect_files(&[dir.path().to_path_buf(), dir.path().join("a.mp3")]);
        assert_eq!(files.len(), 2);
    }

    #[test]
    fn unreadable_file_reports_error_without_panicking() {
        let dir = tempfile::tempdir().unwrap();
        let f = dir.path().join("broken.mp3");
        std::fs::write(&f, b"not really audio").unwrap();
        let mut art = ArtworkCache::new(dir.path().join("art"));
        assert!(read_track(&f, &mut art).is_err());
    }
}
