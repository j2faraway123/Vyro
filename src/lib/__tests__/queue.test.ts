import { describe, expect, it } from "vitest";
import { indexAfterMove, moveItem, nextIndex, prevIndex, shuffleAround, shuffled } from "../queue";

describe("queue navigation", () => {
  it("advances and stops at the end with repeat off", () => {
    expect(nextIndex(0, 3, "off", true)).toBe(1);
    expect(nextIndex(2, 3, "off", true)).toBeNull();
  });
  it("wraps with repeat all", () => expect(nextIndex(2, 3, "all", true)).toBe(0));
  it("repeats one only when the track ends on its own", () => {
    expect(nextIndex(1, 3, "one", true)).toBe(1);
    expect(nextIndex(1, 3, "one", false)).toBe(2);
  });
  it("goes back, wrapping only with repeat all", () => {
    expect(prevIndex(2, 3, "off")).toBe(1);
    expect(prevIndex(0, 3, "off")).toBe(0);
    expect(prevIndex(0, 3, "all")).toBe(2);
  });
  it("returns null for an empty queue", () => {
    expect(nextIndex(0, 0, "all", true)).toBeNull();
    expect(prevIndex(0, 0, "all")).toBeNull();
  });
});

describe("shuffle", () => {
  it("is a permutation", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(shuffled(items).sort()).toEqual(items);
  });
  it("keeps the current track first", () => {
    const [q, i] = shuffleAround([10, 20, 30, 40], 2, () => 0.3);
    expect(i).toBe(0);
    expect(q[0]).toBe(30);
    expect(q.slice().sort()).toEqual([10, 20, 30, 40]);
  });
});

describe("reordering", () => {
  it("moves an item", () => expect(moveItem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]));
  it("ignores out-of-range moves", () => expect(moveItem(["a", "b"], 0, 5)).toEqual(["a", "b"]));
  it("keeps the playing index on the same item", () => {
    const items = ["a", "b", "c", "d"];
    for (const [from, to] of [[0, 3], [3, 0], [1, 2], [2, 1], [0, 1]] as const) {
      for (let index = 0; index < items.length; index++) {
        const moved = moveItem(items, from, to);
        expect(moved[indexAfterMove(index, from, to)]).toBe(items[index]);
      }
    }
  });
});
