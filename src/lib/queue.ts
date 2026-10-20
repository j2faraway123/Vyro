import type { RepeatMode } from "./types";

/** Fisher–Yates shuffle with an injectable RNG (for tests). */
export function shuffled<T>(items: T[], rand: () => number = Math.random): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Shuffles a queue keeping the item at `index` first. Returns [queue, 0]. */
export function shuffleAround(queue: number[], index: number, rand?: () => number): [number[], number] {
  if (index < 0 || index >= queue.length) return [shuffled(queue, rand), 0];
  const current = queue[index];
  const rest = queue.filter((_, i) => i !== index);
  return [[current, ...shuffled(rest, rand)], 0];
}

/** Where to go after the current track. `auto` = the track ended on its own. */
export function nextIndex(index: number, length: number, repeat: RepeatMode, auto: boolean): number | null {
  if (length === 0) return null;
  if (auto && repeat === "one") return index;
  if (index + 1 < length) return index + 1;
  return repeat === "off" ? null : 0;
}

export function prevIndex(index: number, length: number, repeat: RepeatMode): number | null {
  if (length === 0) return null;
  if (index > 0) return index - 1;
  return repeat === "all" ? length - 1 : 0;
}

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  const a = items.slice();
  if (from < 0 || from >= a.length || to < 0 || to >= a.length) return a;
  const [x] = a.splice(from, 1);
  a.splice(to, 0, x);
  return a;
}

/** Keeps `index` pointing at the same item after moving `from` to `to`. */
export function indexAfterMove(index: number, from: number, to: number): number {
  if (index === from) return to;
  if (from < index && to >= index) return index - 1;
  if (from > index && to <= index) return index + 1;
  return index;
}
