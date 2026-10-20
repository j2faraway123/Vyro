//! SQLite persistence: library, favorites, plays, playlists, settings, themes
//! and the lyrics cache. One connection behind a mutex is plenty for a desktop
//! player; WAL mode keeps the scanner from blocking UI reads for long.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, path::Path};

pub type DbResult<T> = Result<T, String>;

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

pub fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

const SCHEMA: &str = r#"
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS folders (
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  added_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tracks (
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT NOT NULL,
  album_artist TEXT NOT NULL,
  track_no INTEGER,
  disc_no INTEGER,
  year INTEGER,
  genre TEXT,
  duration REAL NOT NULL DEFAULT 0,
  format TEXT NOT NULL,
  bitrate INTEGER,
  sample_rate INTEGER,
  artwork TEXT,
  palette TEXT,
  file_size INTEGER NOT NULL DEFAULT 0,
  mtime INTEGER NOT NULL DEFAULT 0,
  added_at INTEGER NOT NULL,
  play_count INTEGER NOT NULL DEFAULT 0,
  last_played INTEGER
);
CREATE INDEX IF NOT EXISTS tracks_album ON tracks(album_artist, album);
CREATE TABLE IF NOT EXISTS favorites (
  track_id INTEGER PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
  added_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS plays (
  id INTEGER PRIMARY KEY,
  track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  played_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS plays_time ON plays(played_at DESC);
CREATE TABLE IF NOT EXISTS playlists (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS playlist_tracks (
  id INTEGER PRIMARY KEY,
  playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  position INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS playlist_tracks_pos ON playlist_tracks(playlist_id, position);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS themes (
  id TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  installed_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS lyrics_cache (
  track_id INTEGER PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
  synced TEXT,
  plain TEXT,
  instrumental INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
);
"#;

pub fn open(path: &Path) -> DbResult<Connection> {
    let conn = Connection::open(path).map_err(err)?;
    conn.pragma_update(None, "journal_mode", "WAL").map_err(err)?;
    conn.execute_batch(SCHEMA).map_err(err)?;
    Ok(conn)
}

#[cfg(test)]
pub fn open_in_memory() -> DbResult<Connection> {
    let conn = Connection::open_in_memory().map_err(err)?;
    conn.execute_batch(SCHEMA).map_err(err)?;
    Ok(conn)
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub id: i64,
    pub path: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_artist: String,
    pub track_no: Option<i64>,
    pub disc_no: Option<i64>,
    pub year: Option<i64>,
    pub genre: Option<String>,
    pub duration: f64,
    pub format: String,
    pub bitrate: Option<i64>,
    pub sample_rate: Option<i64>,
    pub artwork: Option<String>,
    pub palette: Option<Vec<String>>,
    pub file_size: i64,
    pub mtime: i64,
    pub added_at: i64,
    pub play_count: i64,
    pub last_played: Option<i64>,
}

const TRACK_COLS: &str = "id, path, title, artist, album, album_artist, track_no, disc_no, year, genre, duration, format, bitrate, sample_rate, artwork, palette, file_size, mtime, added_at, play_count, last_played";

fn row_to_track(r: &rusqlite::Row) -> rusqlite::Result<Track> {
    let palette: Option<String> = r.get(15)?;
    Ok(Track {
        id: r.get(0)?,
        path: r.get(1)?,
        title: r.get(2)?,
        artist: r.get(3)?,
        album: r.get(4)?,
        album_artist: r.get(5)?,
        track_no: r.get(6)?,
        disc_no: r.get(7)?,
        year: r.get(8)?,
        genre: r.get(9)?,
        duration: r.get(10)?,
        format: r.get(11)?,
        bitrate: r.get(12)?,
        sample_rate: r.get(13)?,
        artwork: r.get(14)?,
        palette: palette.and_then(|p| serde_json::from_str(&p).ok()),
        file_size: r.get(16)?,
        mtime: r.get(17)?,
        added_at: r.get(18)?,
        play_count: r.get(19)?,
        last_played: r.get(20)?,
    })
}

pub fn all_tracks(conn: &Connection) -> DbResult<Vec<Track>> {
    let mut st = conn
        .prepare(&format!("SELECT {TRACK_COLS} FROM tracks ORDER BY album_artist COLLATE NOCASE, album COLLATE NOCASE, disc_no, track_no, title COLLATE NOCASE"))
        .map_err(err)?;
    let rows = st.query_map([], row_to_track).map_err(err)?;
    rows.collect::<Result<_, _>>().map_err(err)
}

pub fn track_by_id(conn: &Connection, id: i64) -> DbResult<Option<Track>> {
    conn.query_row(&format!("SELECT {TRACK_COLS} FROM tracks WHERE id = ?1"), [id], row_to_track)
        .optional()
        .map_err(err)
}

/// Size and mtime of every known file, so rescans can skip unchanged files.
pub fn file_stamps(conn: &Connection) -> DbResult<HashMap<String, (i64, i64)>> {
    let mut st = conn.prepare("SELECT path, file_size, mtime FROM tracks").map_err(err)?;
    let rows = st
        .query_map([], |r| Ok((r.get::<_, String>(0)?, (r.get(1)?, r.get(2)?))))
        .map_err(err)?;
    rows.collect::<Result<_, _>>().map_err(err)
}

/// Insert or update by path, keeping the row id (and so favorites, plays and
/// playlist entries) stable across rescans.
pub fn upsert_track(conn: &Connection, t: &Track) -> DbResult<i64> {
    let palette = t.palette.as_ref().map(|p| serde_json::to_string(p).unwrap_or_default());
    conn.execute(
        "INSERT INTO tracks (path, title, artist, album, album_artist, track_no, disc_no, year, genre, duration, format, bitrate, sample_rate, artwork, palette, file_size, mtime, added_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)
         ON CONFLICT(path) DO UPDATE SET title=excluded.title, artist=excluded.artist, album=excluded.album,
           album_artist=excluded.album_artist, track_no=excluded.track_no, disc_no=excluded.disc_no, year=excluded.year,
           genre=excluded.genre, duration=excluded.duration, format=excluded.format, bitrate=excluded.bitrate,
           sample_rate=excluded.sample_rate, artwork=excluded.artwork, palette=excluded.palette,
           file_size=excluded.file_size, mtime=excluded.mtime",
        params![
            t.path, t.title, t.artist, t.album, t.album_artist, t.track_no, t.disc_no, t.year, t.genre,
            t.duration, t.format, t.bitrate, t.sample_rate, t.artwork, palette, t.file_size, t.mtime, t.added_at
        ],
    )
    .map_err(err)?;
    conn.query_row("SELECT id FROM tracks WHERE path = ?1", [&t.path], |r| r.get(0))
        .map_err(err)
}

pub fn delete_tracks_by_paths(conn: &Connection, paths: &[String]) -> DbResult<usize> {
    let mut n = 0;
    for p in paths {
        n += conn.execute("DELETE FROM tracks WHERE path = ?1", [p]).map_err(err)?;
    }
    Ok(n)
}

pub fn remove_tracks(conn: &Connection, ids: &[i64]) -> DbResult<()> {
    for id in ids {
        conn.execute("DELETE FROM tracks WHERE id = ?1", [id]).map_err(err)?;
    }
    Ok(())
}

// ---------- folders ----------

/// LIKE pattern matching every file below `path` (and not sibling folders that
/// merely share a prefix).
fn folder_like(path: &str) -> String {
    let sep = if path.contains('\\') { '\\' } else { '/' };
    let mut base = path.trim_end_matches(['/', '\\']).to_string();
    base.push(sep);
    format!("{}%", base.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_"))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub id: i64,
    pub path: String,
    pub added_at: i64,
    pub track_count: i64,
}

pub fn folders(conn: &Connection) -> DbResult<Vec<Folder>> {
    let mut st = conn.prepare("SELECT id, path, added_at FROM folders ORDER BY path").map_err(err)?;
    let rows: Vec<(i64, String, i64)> = st
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
        .map_err(err)?
        .collect::<Result<_, _>>()
        .map_err(err)?;
    let mut out = Vec::new();
    for (id, path, added_at) in rows {
        let like = folder_like(&path);
        let track_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM tracks WHERE path LIKE ?1 ESCAPE '\\'", [like], |r| r.get(0))
            .map_err(err)?;
        out.push(Folder { id, path, added_at, track_count });
    }
    Ok(out)
}

pub fn add_folder(conn: &Connection, path: &str) -> DbResult<()> {
    conn.execute("INSERT OR IGNORE INTO folders (path, added_at) VALUES (?1, ?2)", params![path, now()])
        .map_err(err)?;
    Ok(())
}

/// Removes the folder and every track under it.
pub fn remove_folder(conn: &Connection, id: i64) -> DbResult<()> {
    let path: Option<String> = conn
        .query_row("SELECT path FROM folders WHERE id = ?1", [id], |r| r.get(0))
        .optional()
        .map_err(err)?;
    if let Some(path) = path {
        let like = folder_like(&path);
        conn.execute("DELETE FROM tracks WHERE path LIKE ?1 ESCAPE '\\'", [like]).map_err(err)?;
        conn.execute("DELETE FROM folders WHERE id = ?1", [id]).map_err(err)?;
    }
    Ok(())
}

// ---------- favorites & plays ----------

pub fn favorites(conn: &Connection) -> DbResult<Vec<i64>> {
    let mut st = conn.prepare("SELECT track_id FROM favorites ORDER BY added_at DESC").map_err(err)?;
    let rows = st.query_map([], |r| r.get(0)).map_err(err)?;
    rows.collect::<Result<_, _>>().map_err(err)
}

pub fn set_favorite(conn: &Connection, track_id: i64, fav: bool) -> DbResult<()> {
    if fav {
        conn.execute("INSERT OR IGNORE INTO favorites (track_id, added_at) VALUES (?1, ?2)", params![track_id, now()])
    } else {
        conn.execute("DELETE FROM favorites WHERE track_id = ?1", [track_id])
    }
    .map_err(err)?;
    Ok(())
}

pub fn record_play(conn: &Connection, track_id: i64) -> DbResult<()> {
    let t = now();
    conn.execute("INSERT INTO plays (track_id, played_at) VALUES (?1, ?2)", params![track_id, t]).map_err(err)?;
    conn.execute(
        "UPDATE tracks SET play_count = play_count + 1, last_played = ?2 WHERE id = ?1",
        params![track_id, t],
    )
    .map_err(err)?;
    // Keep the history table bounded.
    conn.execute("DELETE FROM plays WHERE id NOT IN (SELECT id FROM plays ORDER BY played_at DESC, id DESC LIMIT 2000)", [])
        .map_err(err)?;
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Play {
    pub track_id: i64,
    pub played_at: i64,
}

pub fn recent_plays(conn: &Connection, limit: i64) -> DbResult<Vec<Play>> {
    let mut st = conn
        .prepare("SELECT track_id, played_at FROM plays ORDER BY played_at DESC, id DESC LIMIT ?1")
        .map_err(err)?;
    let rows = st
        .query_map([limit], |r| Ok(Play { track_id: r.get(0)?, played_at: r.get(1)? }))
        .map_err(err)?;
    rows.collect::<Result<_, _>>().map_err(err)
}

pub fn clear_history(conn: &Connection) -> DbResult<()> {
    conn.execute("DELETE FROM plays", []).map_err(err)?;
    Ok(())
}

// ---------- playlists ----------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Playlist {
    pub id: i64,
    pub name: String,
    pub description: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub track_ids: Vec<i64>,
}

pub fn playlists(conn: &Connection) -> DbResult<Vec<Playlist>> {
    let mut st = conn
        .prepare("SELECT id, name, description, created_at, updated_at FROM playlists ORDER BY updated_at DESC")
        .map_err(err)?;
    let mut lists: Vec<Playlist> = st
        .query_map([], |r| {
            Ok(Playlist {
                id: r.get(0)?,
                name: r.get(1)?,
                description: r.get(2)?,
                created_at: r.get(3)?,
                updated_at: r.get(4)?,
                track_ids: vec![],
            })
        })
        .map_err(err)?
        .collect::<Result<_, _>>()
        .map_err(err)?;
    let mut st = conn
        .prepare("SELECT track_id FROM playlist_tracks WHERE playlist_id = ?1 ORDER BY position")
        .map_err(err)?;
    for pl in &mut lists {
        pl.track_ids = st
            .query_map([pl.id], |r| r.get(0))
            .map_err(err)?
            .collect::<Result<_, _>>()
            .map_err(err)?;
    }
    Ok(lists)
}

pub fn create_playlist(conn: &Connection, name: &str, description: &str) -> DbResult<i64> {
    let name = name.trim();
    if name.is_empty() {
        return Err("Playlist name cannot be empty".into());
    }
    let t = now();
    conn.execute(
        "INSERT INTO playlists (name, description, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)",
        params![name, description, t],
    )
    .map_err(err)?;
    Ok(conn.last_insert_rowid())
}

pub fn update_playlist(conn: &Connection, id: i64, name: &str, description: &str) -> DbResult<()> {
    let name = name.trim();
    if name.is_empty() {
        return Err("Playlist name cannot be empty".into());
    }
    conn.execute(
        "UPDATE playlists SET name = ?2, description = ?3, updated_at = ?4 WHERE id = ?1",
        params![id, name, description, now()],
    )
    .map_err(err)?;
    Ok(())
}

pub fn delete_playlist(conn: &Connection, id: i64) -> DbResult<()> {
    conn.execute("DELETE FROM playlists WHERE id = ?1", [id]).map_err(err)?;
    Ok(())
}

/// Replaces the playlist's contents with `track_ids` in order.
pub fn set_playlist_tracks(conn: &mut Connection, id: i64, track_ids: &[i64]) -> DbResult<()> {
    let tx = conn.transaction().map_err(err)?;
    tx.execute("DELETE FROM playlist_tracks WHERE playlist_id = ?1", [id]).map_err(err)?;
    {
        let mut st = tx
            .prepare("INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?1, ?2, ?3)")
            .map_err(err)?;
        for (pos, tid) in track_ids.iter().enumerate() {
            st.execute(params![id, tid, pos as i64]).map_err(err)?;
        }
    }
    tx.execute("UPDATE playlists SET updated_at = ?2 WHERE id = ?1", params![id, now()]).map_err(err)?;
    tx.commit().map_err(err)
}

pub fn add_to_playlist(conn: &mut Connection, id: i64, track_ids: &[i64]) -> DbResult<()> {
    let mut current: Vec<i64> = playlists(conn)?
        .into_iter()
        .find(|p| p.id == id)
        .ok_or("Playlist not found")?
        .track_ids;
    current.extend_from_slice(track_ids);
    set_playlist_tracks(conn, id, &current)
}

// ---------- settings & themes ----------

pub fn settings(conn: &Connection) -> DbResult<HashMap<String, serde_json::Value>> {
    let mut st = conn.prepare("SELECT key, value FROM settings").map_err(err)?;
    let rows = st
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(err)?;
    let mut out = HashMap::new();
    for row in rows {
        let (k, v) = row.map_err(err)?;
        if let Ok(v) = serde_json::from_str(&v) {
            out.insert(k, v);
        }
    }
    Ok(out)
}

pub fn get_setting(conn: &Connection, key: &str) -> DbResult<Option<serde_json::Value>> {
    let v: Option<String> = conn
        .query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| r.get(0))
        .optional()
        .map_err(err)?;
    Ok(v.and_then(|v| serde_json::from_str(&v).ok()))
}

pub fn set_setting(conn: &Connection, key: &str, value: &serde_json::Value) -> DbResult<()> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value.to_string()],
    )
    .map_err(err)?;
    Ok(())
}

pub fn themes(conn: &Connection) -> DbResult<Vec<serde_json::Value>> {
    let mut st = conn.prepare("SELECT json FROM themes ORDER BY installed_at").map_err(err)?;
    let rows = st.query_map([], |r| r.get::<_, String>(0)).map_err(err)?;
    let mut out = vec![];
    for r in rows {
        if let Ok(v) = serde_json::from_str(&r.map_err(err)?) {
            out.push(v);
        }
    }
    Ok(out)
}

pub fn save_theme(conn: &Connection, id: &str, json: &serde_json::Value) -> DbResult<()> {
    conn.execute(
        "INSERT INTO themes (id, json, installed_at) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET json = excluded.json",
        params![id, json.to_string(), now()],
    )
    .map_err(err)?;
    Ok(())
}

pub fn delete_theme(conn: &Connection, id: &str) -> DbResult<()> {
    conn.execute("DELETE FROM themes WHERE id = ?1", [id]).map_err(err)?;
    Ok(())
}

// ---------- lyrics cache ----------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CachedLyrics {
    pub synced: Option<String>,
    pub plain: Option<String>,
    pub instrumental: bool,
    pub source: String,
    pub fetched_at: i64,
}

pub fn cached_lyrics(conn: &Connection, track_id: i64) -> DbResult<Option<CachedLyrics>> {
    conn.query_row(
        "SELECT synced, plain, instrumental, source, fetched_at FROM lyrics_cache WHERE track_id = ?1",
        [track_id],
        |r| {
            Ok(CachedLyrics {
                synced: r.get(0)?,
                plain: r.get(1)?,
                instrumental: r.get::<_, i64>(2)? != 0,
                source: r.get(3)?,
                fetched_at: r.get(4)?,
            })
        },
    )
    .optional()
    .map_err(err)
}

pub fn cache_lyrics(conn: &Connection, track_id: i64, l: &CachedLyrics) -> DbResult<()> {
    conn.execute(
        "INSERT INTO lyrics_cache (track_id, synced, plain, instrumental, source, fetched_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(track_id) DO UPDATE SET synced=excluded.synced, plain=excluded.plain, instrumental=excluded.instrumental,
           source=excluded.source, fetched_at=excluded.fetched_at",
        params![track_id, l.synced, l.plain, l.instrumental as i64, l.source, l.fetched_at],
    )
    .map_err(err)?;
    Ok(())
}

pub fn clear_lyrics_cache(conn: &Connection) -> DbResult<()> {
    conn.execute("DELETE FROM lyrics_cache", []).map_err(err)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn track(path: &str, title: &str) -> Track {
        Track {
            path: path.into(),
            title: title.into(),
            artist: "A".into(),
            album: "B".into(),
            album_artist: "A".into(),
            format: "mp3".into(),
            added_at: now(),
            ..Default::default()
        }
    }

    #[test]
    fn upsert_keeps_ids_stable() {
        let conn = open_in_memory().unwrap();
        let id1 = upsert_track(&conn, &track("/m/a.mp3", "One")).unwrap();
        let id2 = upsert_track(&conn, &track("/m/a.mp3", "One (remaster)")).unwrap();
        assert_eq!(id1, id2);
        let all = all_tracks(&conn).unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].title, "One (remaster)");
    }

    #[test]
    fn favorites_plays_and_cascade() {
        let conn = open_in_memory().unwrap();
        let id = upsert_track(&conn, &track("/m/a.mp3", "One")).unwrap();
        set_favorite(&conn, id, true).unwrap();
        record_play(&conn, id).unwrap();
        record_play(&conn, id).unwrap();
        assert_eq!(favorites(&conn).unwrap(), vec![id]);
        assert_eq!(recent_plays(&conn, 10).unwrap().len(), 2);
        assert_eq!(track_by_id(&conn, id).unwrap().unwrap().play_count, 2);
        remove_tracks(&conn, &[id]).unwrap();
        assert!(favorites(&conn).unwrap().is_empty());
        assert!(recent_plays(&conn, 10).unwrap().is_empty());
    }

    #[test]
    fn playlists_preserve_order() {
        let mut conn = open_in_memory().unwrap();
        let a = upsert_track(&conn, &track("/m/a.mp3", "A")).unwrap();
        let b = upsert_track(&conn, &track("/m/b.mp3", "B")).unwrap();
        let pl = create_playlist(&conn, "Mix", "").unwrap();
        add_to_playlist(&mut conn, pl, &[b, a, b]).unwrap();
        assert_eq!(playlists(&conn).unwrap()[0].track_ids, vec![b, a, b]);
        set_playlist_tracks(&mut conn, pl, &[a]).unwrap();
        assert_eq!(playlists(&conn).unwrap()[0].track_ids, vec![a]);
        assert!(create_playlist(&conn, "  ", "").is_err());
    }

    #[test]
    fn settings_roundtrip() {
        let conn = open_in_memory().unwrap();
        set_setting(&conn, "volume", &serde_json::json!(0.5)).unwrap();
        set_setting(&conn, "volume", &serde_json::json!(0.7)).unwrap();
        assert_eq!(get_setting(&conn, "volume").unwrap(), Some(serde_json::json!(0.7)));
        assert_eq!(settings(&conn).unwrap().len(), 1);
    }

    #[test]
    fn remove_folder_removes_its_tracks_only() {
        let conn = open_in_memory().unwrap();
        add_folder(&conn, "/music/a").unwrap();
        upsert_track(&conn, &track("/music/a/1.mp3", "1")).unwrap();
        upsert_track(&conn, &track("/music/b/2.mp3", "2")).unwrap();
        let f = folders(&conn).unwrap();
        assert_eq!(f[0].track_count, 1);
        remove_folder(&conn, f[0].id).unwrap();
        let all = all_tracks(&conn).unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].path, "/music/b/2.mp3");
    }
}
