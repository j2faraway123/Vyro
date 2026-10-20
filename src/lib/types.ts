/** What YouTube Music (in its Vyro window) reports it is playing. */
export interface YtmState {
  active: boolean;
  title: string;
  artist: string;
  album: string;
  artwork: string | null;
  playing: boolean;
  position: number;
  duration: number;
}

export interface Track {
  id: number;
  path: string;
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  trackNo: number | null;
  discNo: number | null;
  year: number | null;
  genre: string | null;
  duration: number;
  format: string;
  bitrate: number | null;
  sampleRate: number | null;
  artwork: string | null;
  palette: string[] | null;
  fileSize: number;
  mtime: number;
  addedAt: number;
  playCount: number;
  lastPlayed: number | null;
}

export interface Folder {
  id: number;
  path: string;
  addedAt: number;
  trackCount: number;
}

export interface Play {
  trackId: number;
  playedAt: number;
}

export interface Playlist {
  id: number;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  trackIds: number[];
}

export interface ScanProgress {
  running: boolean;
  total: number;
  processed: number;
  added: number;
  updated: number;
  removed: number;
  skipped: number;
  current: string | null;
  errors: string[];
}

export interface Lyrics {
  synced: string | null;
  plain: string | null;
  instrumental: boolean;
  source: "sidecar" | "embedded" | "lrclib" | "none" | string;
}

export interface Album {
  key: string;
  title: string;
  artist: string;
  year: number | null;
  artwork: string | null;
  palette: string[] | null;
  trackIds: number[];
  duration: number;
  addedAt: number;
  lastPlayed: number | null;
  playCount: number;
  genres: string[];
}

export interface Artist {
  name: string;
  albumKeys: string[];
  trackIds: number[];
  artwork: string | null;
  palette: string[] | null;
}

export type RepeatMode = "off" | "all" | "one";

// ---- Vyro Shield (mirrors src-tauri/src/shield/mod.rs)

export interface FilterList {
  id: string;
  name: string;
  url: string;
  homepage: string;
  license: string;
  category: "ads" | "privacy" | "annoyances" | "custom" | string;
  enabled: boolean;
  builtin: boolean;
}

export interface ShieldConfig {
  enabled: boolean;
  trackerProtection: boolean;
  cosmeticFiltering: boolean;
  blockPopups: boolean;
  lists: FilterList[];
  allowlist: string[];
  customRules: string;
  /** Also filter the YouTube Music window (opt-in). */
  youtubeMusic: boolean;
}

export interface ListStatus {
  downloaded: boolean;
  updatedAt: number | null;
  bytes: number;
  rules: number;
  error: string | null;
  title: string | null;
}

export interface BlockedRequest {
  url: string;
  requestType: string;
  rule: string | null;
}

export interface WebWindowStats {
  label: string;
  url: string;
  blocked: number;
  recent: BlockedRequest[];
}

export interface ShieldState {
  config: ShieldConfig;
  statuses: Record<string, ListStatus>;
  engine: {
    ready: boolean;
    building: boolean;
    networkRules: number;
    cosmeticRules: number;
    error: string | null;
    builtAt: number | null;
    revision: number;
  };
  windows: WebWindowStats[];
  totalBlocked: number;
  platform: { networkBlocking: boolean; blockCounts: boolean; cosmeticFiltering: boolean; note: string };
}

export interface ShieldDecision {
  blocked: boolean;
  reason: string;
  rule: string | null;
}

export interface AppInfo {
  version: string;
  dataDir: string;
  platform: string;
  formats: string[];
}

/** A YouTube video found through the YouTube Data API. */
export interface YtItem {
  videoId: string;
  /** Song title, cleaned up from the video title where it follows "Artist - Title". */
  title: string;
  artist: string;
  rawTitle: string;
  channel: string;
  thumbnail: string | null;
  duration: number;
}

export interface YtPage {
  items: YtItem[];
  nextPage: string | null;
  /** Results left out because their owner doesn't allow playback outside YouTube. */
  hidden: number;
}

export interface YtPlaylist {
  title: string;
  page: YtPage;
}

export interface YtStatus {
  hasKey: boolean;
  /** Last characters of the saved key, to recognise it. */
  keyHint: string | null;
}
