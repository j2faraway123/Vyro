import { describe, expect, it } from "vitest";
import { activeLineIndex, parseLrc } from "../lrc";

describe("parseLrc", () => {
  it("parses stamps, sorts lines and ignores metadata tags", () => {
    const lines = parseLrc("[ar:Someone]\n[00:12.50]second\n[00:02.00]first\nno stamp here");
    expect(lines).toEqual([
      { time: 2, text: "first" },
      { time: 12.5, text: "second" },
    ]);
  });

  it("expands multiple stamps on one line", () => {
    const lines = parseLrc("[00:10.00][01:20.00]chorus");
    expect(lines.map((l) => l.time)).toEqual([10, 80]);
    expect(lines.every((l) => l.text === "chorus")).toBe(true);
  });

  it("handles milliseconds, the offset tag and word-level stamps", () => {
    const lines = parseLrc("[offset:+500]\n[00:01.250]a <00:01.50>b <00:02.00>c");
    expect(lines).toEqual([{ time: 0.75, text: "a b c" }]);
  });

  it("keeps empty lines as instrumental gaps", () => {
    expect(parseLrc("[00:05.00]")).toEqual([{ time: 5, text: "" }]);
  });
});

describe("activeLineIndex", () => {
  const lines = parseLrc("[00:01.00]a\n[00:05.00]b\n[00:09.00]c");
  it("returns -1 before the first line", () => expect(activeLineIndex(lines, 0.5)).toBe(-1));
  it("finds the line at or before the time", () => {
    expect(activeLineIndex(lines, 1)).toBe(0);
    expect(activeLineIndex(lines, 6)).toBe(1);
    expect(activeLineIndex(lines, 100)).toBe(2);
  });
  it("handles an empty list", () => expect(activeLineIndex([], 3)).toBe(-1));
});
