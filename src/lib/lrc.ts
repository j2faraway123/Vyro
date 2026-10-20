export interface LyricLine {
  time: number; // seconds
  text: string;
}

const STAMP = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const OFFSET = /^\[offset:\s*([+-]?\d+)\]/i;

/**
 * Parses LRC text. Supports multiple stamps per line ("[00:10.00][01:20.00]chorus"),
 * centiseconds or milliseconds, and the [offset:+/-ms] tag. Metadata tags
 * ([ar:], [ti:] ...) are ignored. Lines are returned sorted by time.
 */
export function parseLrc(text: string): LyricLine[] {
  const lines: LyricLine[] = [];
  let offset = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const off = OFFSET.exec(line);
    if (off) {
      offset = Number(off[1]) / 1000;
      continue;
    }
    STAMP.lastIndex = 0;
    const stamps: number[] = [];
    let m: RegExpExecArray | null;
    let end = 0;
    while ((m = STAMP.exec(line)) && m.index === end) {
      const min = Number(m[1]);
      const sec = Number(m[2]);
      const frac = m[3] ? Number(m[3]) / 10 ** m[3].length : 0;
      stamps.push(min * 60 + sec + frac);
      end = STAMP.lastIndex;
    }
    if (!stamps.length) continue;
    const content = line.slice(end).replace(/<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g, "").trim();
    for (const t of stamps) lines.push({ time: Math.max(0, t - offset), text: content });
  }
  return lines.sort((a, b) => a.time - b.time);
}

/** Index of the line active at `time`, or -1 before the first line. Binary search. */
export function activeLineIndex(lines: LyricLine[], time: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].time <= time) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}
