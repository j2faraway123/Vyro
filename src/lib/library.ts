import { normalize } from "./format";
import type { Album, Artist, Track } from "./types";

export const albumKey = (t: Pick<Track, "albumArtist" | "album">) => `${t.albumArtist}\u0000${t.album}`;

export function buildAlbums(tracks: Track[]): Map<string, Album> {
  const albums = new Map<string, Album>();
  for (const t of tracks) {
    const key = albumKey(t);
    let a = albums.get(key);
    if (!a) {
      a = {
        key,
        title: t.album,
        artist: t.albumArtist,
        year: t.year,
        artwork: t.artwork,
        palette: t.palette,
        trackIds: [],
        duration: 0,
        addedAt: t.addedAt,
        lastPlayed: t.lastPlayed,
        playCount: 0,
        genres: [],
      };
      albums.set(key, a);
    }
    a.trackIds.push(t.id);
    a.duration += t.duration;
    a.playCount += t.playCount;
    a.addedAt = Math.max(a.addedAt, t.addedAt);
    if (t.lastPlayed && (!a.lastPlayed || t.lastPlayed > a.lastPlayed)) a.lastPlayed = t.lastPlayed;
    if (!a.artwork && t.artwork) {
      a.artwork = t.artwork;
      a.palette = t.palette;
    }
    if (!a.year && t.year) a.year = t.year;
    if (t.genre && !a.genres.includes(t.genre)) a.genres.push(t.genre);
  }
  return albums;
}

export function sortAlbumTracks(ids: number[], byId: Map<number, Track>): number[] {
  return ids.slice().sort((a, b) => {
    const x = byId.get(a)!;
    const y = byId.get(b)!;
    return (x.discNo ?? 1) - (y.discNo ?? 1) || (x.trackNo ?? 9999) - (y.trackNo ?? 9999) || x.title.localeCompare(y.title);
  });
}

export function buildArtists(tracks: Track[], albums: Map<string, Album>): Map<string, Artist> {
  const artists = new Map<string, Artist>();
  const get = (name: string) => {
    let a = artists.get(name);
    if (!a) {
      a = { name, albumKeys: [], trackIds: [], artwork: null, palette: null };
      artists.set(name, a);
    }
    return a;
  };
  for (const album of albums.values()) {
    const a = get(album.artist);
    a.albumKeys.push(album.key);
    if (!a.artwork && album.artwork) {
      a.artwork = album.artwork;
      a.palette = album.palette;
    }
  }
  for (const t of tracks) {
    const a = get(t.albumArtist);
    a.trackIds.push(t.id);
    if (t.artist !== t.albumArtist && artists.has(t.artist)) artists.get(t.artist)!.trackIds.push(t.id);
  }
  return artists;
}

export type TrackSort = "title" | "artist" | "album" | "added" | "duration" | "plays";

export function sortTracks(tracks: Track[], sort: TrackSort, desc = false): Track[] {
  const cmp: Record<TrackSort, (a: Track, b: Track) => number> = {
    title: (a, b) => a.title.localeCompare(b.title),
    artist: (a, b) => a.artist.localeCompare(b.artist) || a.album.localeCompare(b.album) || (a.trackNo ?? 0) - (b.trackNo ?? 0),
    album: (a, b) => a.album.localeCompare(b.album) || (a.discNo ?? 1) - (b.discNo ?? 1) || (a.trackNo ?? 0) - (b.trackNo ?? 0),
    added: (a, b) => b.addedAt - a.addedAt || a.title.localeCompare(b.title),
    duration: (a, b) => a.duration - b.duration,
    plays: (a, b) => b.playCount - a.playCount || a.title.localeCompare(b.title),
  };
  const out = tracks.slice().sort(cmp[sort]);
  return desc ? out.reverse() : out;
}

export type AlbumSort = "title" | "artist" | "year" | "added" | "played";

export function sortAlbums(albums: Album[], sort: AlbumSort): Album[] {
  const cmp: Record<AlbumSort, (a: Album, b: Album) => number> = {
    title: (a, b) => a.title.localeCompare(b.title),
    artist: (a, b) => a.artist.localeCompare(b.artist) || (a.year ?? 0) - (b.year ?? 0),
    year: (a, b) => (b.year ?? 0) - (a.year ?? 0) || a.title.localeCompare(b.title),
    added: (a, b) => b.addedAt - a.addedAt,
    played: (a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0),
  };
  return albums.slice().sort(cmp[sort]);
}

/** Every whitespace-separated term must appear in one of the fields. */
export function matches(query: string, ...fields: (string | null | undefined)[]): boolean {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const hay = normalize(fields.filter(Boolean).join(" \u0001 "));
  return terms.every((t) => hay.includes(t));
}

export function searchTracks(tracks: Track[], q: string): Track[] {
  return tracks.filter((t) => matches(q, t.title, t.artist, t.album, t.albumArtist, t.genre));
}

/** Deterministic per-day pick so "Rediscover" doesn't reshuffle on every render. */
export function dailyPick<T>(items: T[], n: number, seed = new Date().toDateString()): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const rand = () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}
