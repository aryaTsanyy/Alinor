import { describe, test, expect } from "vitest";
import { isValidDate, dayOfWeek } from "./dates";

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
