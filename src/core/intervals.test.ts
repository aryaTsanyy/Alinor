import { describe, test, expect } from "vitest";
import fc from "fast-check";
import { mergeIntervals, subtractIntervals, type Interval } from "./intervals";

const interval: fc.Arbitrary<Interval> = fc
  .tuple(fc.integer({ min: 0, max: 1440 }), fc.integer({ min: 0, max: 1440 }))
  .map(([a, b]) => ({ start: Math.min(a, b), end: Math.max(a, b) }));

const overlaps = (a: Interval, b: Interval) =>
  a.start < b.end && b.start < a.end;
const total = (xs: readonly Interval[]) =>
  xs.reduce((s, i) => s + (i.end - i.start), 0);

describe("mergeIntervals", () => {
  test("empty input -> empty output", () => {
    expect(mergeIntervals([])).toEqual([]);
  });

  test("sorts disjoint intervals", () => {
    expect(
      mergeIntervals([
        { start: 300, end: 360 },
        { start: 60, end: 120 },
      ]),
    ).toEqual([
      { start: 60, end: 120 },
      { start: 300, end: 360 },
    ]);
  });

  test("merges overlapping intervals", () => {
    expect(
      mergeIntervals([
        { start: 0, end: 100 },
        { start: 50, end: 150 },
      ]),
    ).toEqual([{ start: 0, end: 150 }]);
  });

  test("merges touching intervals", () => {
    expect(
      mergeIntervals([
        { start: 0, end: 100 },
        { start: 100, end: 200 },
      ]),
    ).toEqual([{ start: 0, end: 200 }]);
  });

  test("absorbs a contained interval", () => {
    expect(
      mergeIntervals([
        { start: 0, end: 300 },
        { start: 50, end: 100 },
      ]),
    ).toEqual([{ start: 0, end: 300 }]);
  });

  test("drops zero-length intervals", () => {
    expect(mergeIntervals([{ start: 50, end: 50 }])).toEqual([]);
  });

  test("throws when start > end", () => {
    expect(() => mergeIntervals([{ start: 10, end: 5 }])).toThrow(RangeError);
  });

  test("does not mutate its input", () => {
    const input = [
      { start: 0, end: 100 },
      { start: 50, end: 150 },
    ];
    const snapshot = structuredClone(input);
    mergeIntervals(input);
    expect(input).toEqual(snapshot);
  });

  test("property: idempotent, sorted, strictly separated, no empty results", () => {
    fc.assert(
      fc.property(fc.array(interval), (xs) => {
        const once = mergeIntervals(xs);
        expect(mergeIntervals(once)).toEqual(once);
        for (const m of once) expect(m.end).toBeGreaterThan(m.start);
        for (let i = 1; i < once.length; i++) {
          expect(once[i].start).toBeGreaterThan(once[i - 1].end);
        }
      }),
    );
  });

  test("property: covers every non-empty input and never grows total length", () => {
    fc.assert(
      fc.property(fc.array(interval), (xs) => {
        const merged = mergeIntervals(xs);
        for (const x of xs) {
          if (x.end > x.start) {
            expect(
              merged.some((m) => m.start <= x.start && x.end <= m.end),
            ).toBe(true);
          }
        }
        expect(total(merged)).toBeLessThanOrEqual(total(xs));
      }),
    );
  });
});

describe("subtractIntervals", () => {
  const window: Interval = { start: 480, end: 1320 }; // 08:00-22:00

  test("nothing occupied -> whole window", () => {
    expect(subtractIntervals(window, [])).toEqual([window]);
  });

  test("block in the middle splits the window", () => {
    expect(subtractIntervals(window, [{ start: 600, end: 660 }])).toEqual([
      { start: 480, end: 600 },
      { start: 660, end: 1320 },
    ]);
  });

  test("block at the start and at the end", () => {
    expect(subtractIntervals(window, [{ start: 480, end: 540 }])).toEqual([
      { start: 540, end: 1320 },
    ]);
    expect(subtractIntervals(window, [{ start: 1200, end: 1320 }])).toEqual([
      { start: 480, end: 1200 },
    ]);
  });

  test("fully covered window -> no gaps", () => {
    expect(subtractIntervals(window, [{ start: 400, end: 1400 }])).toEqual([]);
  });

  test("blocks outside the window are ignored", () => {
    expect(
      subtractIntervals(window, [
        { start: 0, end: 400 },
        { start: 1400, end: 1440 },
      ]),
    ).toEqual([window]);
  });

  test("blocks overlapping the window edges are clipped", () => {
    expect(
      subtractIntervals(window, [
        { start: 400, end: 500 },
        { start: 1300, end: 1400 },
      ]),
    ).toEqual([{ start: 500, end: 1300 }]);
  });

  test("double-booked, touching and unsorted blocks", () => {
    expect(
      subtractIntervals(window, [
        { start: 720, end: 780 },
        { start: 600, end: 700 },
        { start: 650, end: 720 },
      ]),
    ).toEqual([
      { start: 480, end: 600 },
      { start: 780, end: 1320 },
    ]);
  });

  test("zero-length window -> no gaps", () => {
    expect(subtractIntervals({ start: 600, end: 600 }, [])).toEqual([]);
  });

  test("property: gaps stay inside the window, avoid occupied time, and conserve total time", () => {
    fc.assert(
      fc.property(interval, fc.array(interval), (win, occupied) => {
        const gaps = subtractIntervals(win, occupied);
        for (let i = 0; i < gaps.length; i++) {
          const g = gaps[i];
          expect(g.end).toBeGreaterThan(g.start);
          expect(g.start).toBeGreaterThanOrEqual(win.start);
          expect(g.end).toBeLessThanOrEqual(win.end);
          if (i > 0) expect(g.start).toBeGreaterThan(gaps[i - 1].end);
          for (const o of occupied) {
            if (o.end > o.start) expect(overlaps(g, o)).toBe(false);
          }
        }
        const blocked = mergeIntervals(occupied).reduce(
          (s, b) =>
            s +
            Math.max(
              0,
              Math.min(b.end, win.end) - Math.max(b.start, win.start),
            ),
          0,
        );
        expect(total(gaps) + blocked).toBe(win.end - win.start);
      }),
    );
  });
});
