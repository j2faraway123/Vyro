//! YouTube search and public playlists through the official YouTube Data API
//! v3, with the user's own API key. Playback happens in YouTube's embedded
//! player in the frontend; nothing here downloads or touches media.

use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;

const API: &str = "https://www.googleapis.com/youtube/v3";

/// One playable YouTube video, with a best guess at song title and artist.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct YtItem {
    pub video_id: String,
    /// Song title with "(Official Video)" and similar removed.
    pub title: String,
    pub artist: String,
    /// The video's own title and channel, as YouTube shows them.
    pub raw_title: String,
    pub channel: String,
    pub thumbnail: Option<String>,
    pub duration: f64,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct YtPage {
    pub items: Vec<YtItem>,
    pub next_page: Option<String>,
    /// Results YouTube returned that can't be played inside other apps.
    pub hidden: usize,
}

/// Turns a YouTube API error body into a message a person can act on.
fn api_error(status: u16, body: &str) -> String {
    let v: Value = serde_json::from_str(body).unwrap_or(Value::Null);
    let reason = v["error"]["errors"][0]["reason"].as_str().unwrap_or("");
    let detail = v["error"]["details"][0]["reason"].as_str().unwrap_or("");
    match (reason, detail) {
        ("quotaExceeded", _) | ("dailyLimitExceeded", _) => {
            "Today's free YouTube quota for your API key is used up. It resets at midnight Pacific time.".into()
        }
        (_, "API_KEY_INVALID") | ("keyInvalid", _) => "YouTube says this API key isn't valid. Check that you copied all of it.".into(),
        ("accessNotConfigured", _) | (_, "SERVICE_DISABLED") => {
            "YouTube Data API v3 isn't enabled for this key's Google Cloud project. Enable it in the Cloud Console, then try again.".into()
        }
        (_, "API_KEY_HTTP_REFERRER_BLOCKED") | (_, "API_KEY_IP_ADDRESS_BLOCKED") | ("forbidden", _) if status == 403 => {
            "This API key has restrictions that block Vyro. Remove the website or IP restriction on the key, or create a new one.".into()
        }
        ("playlistNotFound", _) => "That playlist doesn't exist or is private.".into(),
        _ => {
            let msg = v["error"]["message"].as_str().unwrap_or("").trim();
            if msg.is_empty() {
                format!("YouTube request failed (HTTP {status})")
            } else {
                format!("YouTube request failed: {}", msg.chars().take(200).collect::<String>())
            }
        }
    }
}

fn call(key: &str, path: &str, params: &[(&str, &str)]) -> Result<Value, String> {
    let mut query: Vec<(&str, &str)> = params.to_vec();
    query.push(("key", key));
    let (status, body) = crate::http::get_text(&format!("{API}/{path}"), &query, 4 * 1024 * 1024)?;
    if status != 200 {
        return Err(api_error(status, &body));
    }
    serde_json::from_str(&body).map_err(|e| format!("Unexpected answer from YouTube: {e}"))
}

/// ISO 8601 durations as YouTube sends them ("PT1H2M3S", "P1DT2S").
pub fn parse_duration(s: &str) -> f64 {
    let mut total = 0.0;
    let mut num = String::new();
    let mut in_time = false;
    for c in s.chars() {
        match c {
            'P' => {}
            'T' => in_time = true,
            '0'..='9' | '.' => num.push(c),
            _ => {
                let n: f64 = num.parse().unwrap_or(0.0);
                num.clear();
                total += n * match (c, in_time) {
                    ('W', false) => 604_800.0,
                    ('D', false) => 86_400.0,
                    ('H', true) => 3600.0,
                    ('M', true) => 60.0,
                    ('S', true) => 1.0,
                    _ => 0.0,
                };
            }
        }
    }
    total
}

/// A playlist id from a pasted link (`...?list=PL...`) or a bare id.
pub fn playlist_id(input: &str) -> Option<String> {
    let input = input.trim();
    let id = if let Ok(u) = url::Url::parse(input) {
        let host = u.host_str().unwrap_or("");
        if !(host == "youtu.be" || host == "youtube.com" || host.ends_with(".youtube.com")) {
            return None;
        }
        u.query_pairs().find(|(k, _)| k == "list").map(|(_, v)| v.to_string())?
    } else {
        input.to_string()
    };
    let ok = (10..=64).contains(&id.len()) && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    ok.then_some(id)
}

const NOISE: &[&str] = &[
    "official", "video", "audio", "lyric", "lyrics", "visualizer", "visualiser", "mv", "m/v", "hd", "hq", "4k", "remastered", "explicit", "clean",
];

/// Removes bracketed tags such as "(Official Video)" or "[HD]".
fn strip_noise(title: &str) -> String {
    let mut out = String::new();
    let mut rest = title;
    while let Some(i) = rest.find(['(', '[']) {
        let close = if rest.as_bytes()[i] == b'(' { ')' } else { ']' };
        let Some(j) = rest[i..].find(close).map(|j| i + j) else { break };
        let inner = rest[i + 1..j].to_lowercase();
        let noisy = inner.split(|c: char| !c.is_alphanumeric() && c != '/').any(|w| NOISE.contains(&w));
        out.push_str(&rest[..i]);
        if !noisy {
            out.push_str(&rest[i..=j]);
        }
        rest = &rest[j + 1..];
    }
    out.push_str(rest);
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Best guess at (title, artist) for lyrics lookups and display.
pub fn song_names(raw_title: &str, channel: &str) -> (String, String) {
    let title = strip_noise(raw_title);
    if let Some(artist) = channel.strip_suffix(" - Topic") {
        return (title, artist.trim().to_string());
    }
    for sep in [" - ", " – ", " — ", " | "] {
        if let Some((a, t)) = title.split_once(sep) {
            if !a.trim().is_empty() && !t.trim().is_empty() {
                return (t.trim().to_string(), a.trim().to_string());
            }
        }
    }
    let artist = channel.strip_suffix("VEVO").unwrap_or(channel).trim().to_string();
    (title, artist)
}

fn thumbnail(snippet: &Value) -> Option<String> {
    // Medium and maxres are 16:9; standard and high are letterboxed 4:3.
    ["maxres", "medium", "high", "standard", "default"]
        .iter()
        .find_map(|k| snippet["thumbnails"][*k]["url"].as_str())
        .filter(|u| u.starts_with("https://"))
        .map(String::from)
}

/// Parses a videos.list answer into items, in the order of `ids`, skipping
/// videos that can't be embedded or aren't public.
pub fn items_from_videos(v: &Value, ids: &[String]) -> (Vec<YtItem>, usize) {
    let mut by_id: HashMap<&str, YtItem> = HashMap::new();
    for it in v["items"].as_array().into_iter().flatten() {
        let Some(id) = it["id"].as_str() else { continue };
        let status = &it["status"];
        let embeddable = status["embeddable"].as_bool().unwrap_or(true);
        let public = status["privacyStatus"].as_str() != Some("private");
        if !embeddable || !public {
            continue;
        }
        let snippet = &it["snippet"];
        let raw_title = snippet["title"].as_str().unwrap_or("").to_string();
        let channel = snippet["channelTitle"].as_str().unwrap_or("").to_string();
        let (title, artist) = song_names(&raw_title, &channel);
        by_id.insert(
            id,
            YtItem {
                video_id: id.to_string(),
                title,
                artist,
                raw_title,
                channel,
                thumbnail: thumbnail(snippet),
                duration: parse_duration(it["contentDetails"]["duration"].as_str().unwrap_or("")),
            },
        );
    }
    let items: Vec<YtItem> = ids.iter().filter_map(|id| by_id.remove(id.as_str())).collect();
    // Videos YouTube left out entirely (deleted or private) count as hidden too.
    let hidden = ids.len() - items.len();
    (items, hidden)
}

fn videos(key: &str, ids: &[String]) -> Result<(Vec<YtItem>, usize), String> {
    if ids.is_empty() {
        return Ok((vec![], 0));
    }
    let joined = ids.join(",");
    let v = call(key, "videos", &[("part", "snippet,contentDetails,status"), ("id", &joined), ("maxResults", "50")])?;
    Ok(items_from_videos(&v, ids))
}

/// Music search (100 quota units per page).
pub fn search(key: &str, query: &str, page: Option<&str>) -> Result<YtPage, String> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(YtPage::default());
    }
    let mut params = vec![
        ("part", "id"),
        ("type", "video"),
        ("videoCategoryId", "10"),
        ("videoEmbeddable", "true"),
        ("maxResults", "25"),
        ("q", query),
    ];
    if let Some(p) = page {
        params.push(("pageToken", p));
    }
    let v = call(key, "search", &params)?;
    let ids: Vec<String> = v["items"].as_array().into_iter().flatten().filter_map(|i| i["id"]["videoId"].as_str().map(String::from)).collect();
    let (items, hidden) = videos(key, &ids)?;
    Ok(YtPage { items, next_page: v["nextPageToken"].as_str().map(String::from), hidden })
}

/// Videos of a public or unlisted playlist (2 quota units per page).
pub fn playlist(key: &str, input: &str, page: Option<&str>) -> Result<(String, YtPage), String> {
    let id = playlist_id(input).ok_or("That doesn't look like a YouTube playlist link")?;
    let mut title = String::new();
    if page.is_none() {
        let p = call(key, "playlists", &[("part", "snippet"), ("id", &id)])?;
        title = p["items"][0]["snippet"]["title"].as_str().ok_or("That playlist doesn't exist or is private.")?.to_string();
    }
    let mut params = vec![("part", "contentDetails"), ("playlistId", id.as_str()), ("maxResults", "50")];
    if let Some(p) = page {
        params.push(("pageToken", p));
    }
    let v = call(key, "playlistItems", &params)?;
    let ids: Vec<String> =
        v["items"].as_array().into_iter().flatten().filter_map(|i| i["contentDetails"]["videoId"].as_str().map(String::from)).collect();
    let (items, hidden) = videos(key, &ids)?;
    Ok((title, YtPage { items, next_page: v["nextPageToken"].as_str().map(String::from), hidden }))
}

/// Checks a key with the cheapest call there is (1 quota unit).
pub fn check_key(key: &str) -> Result<(), String> {
    call(key, "videos", &[("part", "id"), ("chart", "mostPopular"), ("maxResults", "1")]).map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn durations() {
        assert_eq!(parse_duration("PT3M33S"), 213.0);
        assert_eq!(parse_duration("PT1H2M3S"), 3723.0);
        assert_eq!(parse_duration("PT45S"), 45.0);
        assert_eq!(parse_duration("P1DT1S"), 86_401.0);
        assert_eq!(parse_duration("P0D"), 0.0);
        assert_eq!(parse_duration(""), 0.0);
    }

    #[test]
    fn playlist_ids_from_links() {
        let id = "PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI";
        assert_eq!(playlist_id(&format!("https://www.youtube.com/playlist?list={id}")).as_deref(), Some(id));
        assert_eq!(playlist_id(&format!("https://music.youtube.com/playlist?list={id}&si=x")).as_deref(), Some(id));
        assert_eq!(playlist_id(&format!("https://youtu.be/abc?list={id}")).as_deref(), Some(id));
        assert_eq!(playlist_id(id).as_deref(), Some(id));
        assert_eq!(playlist_id("https://evil.example/?list=PLabcdefghijk"), None);
        assert_eq!(playlist_id("https://www.youtube.com/watch?v=abc"), None);
        assert_eq!(playlist_id("not a list!"), None);
    }

    #[test]
    fn song_names_from_video_titles() {
        assert_eq!(song_names("Queen – Bohemian Rhapsody (Official Video Remastered)", "Queen Official"), ("Bohemian Rhapsody".into(), "Queen".into()));
        assert_eq!(song_names("Blinding Lights", "The Weeknd - Topic"), ("Blinding Lights".into(), "The Weeknd".into()));
        assert_eq!(song_names("Adele - Hello [Official Music Video]", "AdeleVEVO"), ("Hello".into(), "Adele".into()));
        assert_eq!(song_names("Shape of You (Acoustic)", "EdSheeranVEVO"), ("Shape of You (Acoustic)".into(), "EdSheeran".into()));
    }

    #[test]
    fn items_skip_unembeddable_and_keep_order() {
        let v = json!({"items": [
            {"id": "b", "snippet": {"title": "Artist - Two", "channelTitle": "Ch", "thumbnails": {"high": {"url": "https://i.ytimg.com/vi/b/hq.jpg"}}},
             "contentDetails": {"duration": "PT2M"}, "status": {"embeddable": true, "privacyStatus": "public"}},
            {"id": "a", "snippet": {"title": "One", "channelTitle": "Band - Topic"},
             "contentDetails": {"duration": "PT1M1S"}, "status": {"embeddable": true, "privacyStatus": "public"}},
            {"id": "c", "snippet": {"title": "Blocked", "channelTitle": "Label"},
             "contentDetails": {"duration": "PT3M"}, "status": {"embeddable": false, "privacyStatus": "public"}}
        ]});
        let ids: Vec<String> = ["a", "b", "c", "gone"].iter().map(|s| s.to_string()).collect();
        let (items, hidden) = items_from_videos(&v, &ids);
        assert_eq!(items.iter().map(|i| i.video_id.as_str()).collect::<Vec<_>>(), ["a", "b"]);
        assert_eq!(items[0].artist, "Band");
        assert_eq!(items[1].title, "Two");
        assert_eq!(items[1].thumbnail.as_deref(), Some("https://i.ytimg.com/vi/b/hq.jpg"));
        assert_eq!(items[0].duration, 61.0);
        assert_eq!(hidden, 2);
    }

    #[test]
    fn friendly_api_errors() {
        let quota = r#"{"error":{"code":403,"message":"quota","errors":[{"reason":"quotaExceeded"}]}}"#;
        assert!(api_error(403, quota).contains("quota"));
        let bad = r#"{"error":{"code":400,"message":"API key not valid.","errors":[{"reason":"badRequest"}],"details":[{"reason":"API_KEY_INVALID"}]}}"#;
        assert!(api_error(400, bad).contains("isn't valid"));
        assert!(api_error(500, "oops").contains("HTTP 500"));
    }
}
