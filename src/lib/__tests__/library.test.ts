import { describe, expect, it } from "vitest";
import type { Track } from "../types";
import { buildAlbums, dailyPick, matches, searchTracks, sortTracks } from "../library";

let id = 0;
const track = (p: Partial<Track>): Track => ({
  id: ++id, path: `/m/${id}.flac`, title: "T", artist: "A", album: "Al", albumArtist: "A", trackNo: null, discNo: null, year: null,
  genre: null, duration: 100, format: "flac", bitrate: null, sampleRate: null, artwork: null, palette: null, fileSize: 1, mtime: 0,
  addedAt: id, playCount: 0, lastPlayed: null, ...p,
});

describe("search", () => {
  it("matches all terms across fields, ignoring case and accents", () => {
    expect(matches("bjork homo", "Homogenic", "Björk")).toBe(true);
    expect(matches("bjork vespertine", "Homogenic", "Björk")).toBe(false);
    expect(matches("", "anything")).toBe(true);
  });
  it("searches tracks", () => {
    const ts = [track({ title: "Neon Rain", artist: "Neon Parish" }), track({ title: "Other" })];
    expect(searchTracks(ts, "neon").length).toBe(1);
  });
});

describe("albums and sorting", () => {
  it("groups by album artist and album", () => {
    const ts = [track({ album: "X", trackNo: 2 }), track({ album: "X", trackNo: 1 }), track({ album: "Y" })];
    expect(buildAlbums(ts).size).toBe(2);
  });
  it("sorts by title", () => {
    const ts = [track({ title: "b" }), track({ title: "a" })];
    expect(sortTracks(ts, "title").map((t) => t.title)).toEqual(["a", "b"]);
    expect(sortTracks(ts, "title", true).map((t) => t.title)).toEqual(["b", "a"]);
  });
  it("picks deterministically per seed", () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    expect(dailyPick(items, 5, "2026-10-20")).toEqual(dailyPick(items, 5, "2026-10-20"));
    expect(dailyPick(items, 5, "x")).toHaveLength(5);
  });
});
