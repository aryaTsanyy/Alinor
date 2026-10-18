import { describe, test, expect } from "vitest";
import fc from "fast-check";
import {
  isValidDate,
  dayOfWeek,
  daysBetween,
  toDateString,
  addDays,
} from "./dates";

describe("isValidDate", () => {
  test.each(["2026-10-18", "2024-02-29", "2000-02-29", "1999-12-31"])(
    "accepts %s",
    (v) => {
      expect(isValidDate(v)).toBe(true);
    },
  );

  test.each([
    "2025-02-29",
    "1900-02-29",
    "2026-04-31",
    "2026-13-01",
    "2026-00-10",
    "2026-10-00",
    "2026-1-5",
    "26-10-18",
    "2026/10/18",
    " 2026-10-18",
    "2026-10-18T00:00",
    "",
    "abcd-ef-gh",
  ])("rejects %j", (v) => {
    expect(isValidDate(v)).toBe(false);
  });
});

describe("dayOfWeek", () => {
  test.each([
    ["2026-10-18", 0],
    ["2026-10-19", 1],
    ["2026-10-24", 6],
    ["2024-02-29", 4],
    ["2000-01-01", 6],
    ["1970-01-01", 4],
  ])("%s -> %i", (date, expected) => {
    expect(dayOfWeek(date)).toBe(expected);
  });

  test("seven consecutive days cover 0..6 in order", () => {
    const week = [
      "2026-10-18",
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
    ];
    expect(week.map(dayOfWeek)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  test.each(["2025-02-29", "2026-1-5", ""])("throws on invalid %j", (v) => {
    expect(() => dayOfWeek(v)).toThrow(RangeError);
  });
});

const isoFromOffset = (n: number) =>
  new Date(Date.UTC(2000, 0, 1) + n * 86_400_000).toISOString().slice(0, 10);

describe("daysBetween", () => {
  test.each([
    ["2026-10-18", "2026-10-18", 0],
    ["2026-10-18", "2026-10-20", 2],
    ["2026-10-20", "2026-10-18", -2],
    ["2026-10-30", "2026-11-02", 3],
    ["2024-02-28", "2024-03-01", 2], // tahun kabisat
    ["2025-02-28", "2025-03-01", 1],
    ["2026-12-31", "2027-01-01", 1],
  ])("%s -> %s = %i", (from, to, expected) => {
    expect(daysBetween(from, to)).toBe(expected);
  });

  test("property: matches the difference between day offsets", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 36500 }),
        fc.integer({ min: 0, max: 36500 }),
        (a, b) => {
          expect(daysBetween(isoFromOffset(a), isoFromOffset(b))).toBe(b - a);
        },
      ),
    );
  });

  test.each([
    ["2025-02-29", "2026-01-01"],
    ["2026-01-01", "2026-1-5"],
    ["", "2026-01-01"],
  ])("throws on invalid input (%j, %j)", (from, to) => {
    expect(() => daysBetween(from, to)).toThrow(RangeError);
  });
});

describe("toDateString", () => {
  test.each([
    [new Date(2026, 9, 18, 23, 59), "2026-10-18"],
    [new Date(2026, 0, 1, 0, 0), "2026-01-01"],
    [new Date(2026, 11, 31, 12, 0), "2026-12-31"],
  ])("%s -> %s", (date, expected) => {
    expect(toDateString(date)).toBe(expected);
  });

  test("throws on an invalid Date", () => {
    expect(() => toDateString(new Date(NaN))).toThrow(RangeError);
  });
});

describe("addDays", () => {
  test.each([
    ["2026-10-19", 0, "2026-10-19"],
    ["2026-10-19", 1, "2026-10-20"],
    ["2026-10-19", 12, "2026-10-31"],
    ["2026-10-19", 13, "2026-11-01"],
    ["2026-10-19", -18, "2026-10-01"],
    ["2026-10-19", -19, "2026-09-30"],
    ["2024-02-28", 1, "2024-02-29"], // tahun kabisat
    ["2025-02-28", 1, "2025-03-01"],
    ["2026-12-31", 1, "2027-01-01"],
    ["2027-01-01", -1, "2026-12-31"],
  ])("%s + %i days = %s", (from, days, expected) => {
    expect(addDays(from, days)).toBe(expected);
  });

  test("property: agrees with day offsets and with daysBetween", () => {
    fc.assert(
      fc.property(
        fc
          .tuple(
            fc.integer({ min: 0, max: 36500 }),
            fc.integer({ min: -400, max: 400 }),
          )
          .filter(([k, n]) => k + n >= 0),
        ([k, n]) => {
          const base = isoFromOffset(k);
          expect(addDays(base, n)).toBe(isoFromOffset(k + n));
          expect(daysBetween(base, addDays(base, n))).toBe(n);
        },
      ),
    );
  });

  test.each([
    ["2026-02-30", 1],
    ["", 1],
    ["2026-10-19", 1.5],
    ["2026-10-19", NaN],
  ])("throws on invalid input (%j, %j)", (from, days) => {
    expect(() => addDays(from, days)).toThrow(RangeError);
  });
});
