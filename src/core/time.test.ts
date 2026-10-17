import { describe, test, expect } from "vitest";
import fc from "fast-check";
import { parseTime, formatTime } from "./time";

describe("parseTime", () => {
  test("parses boundary values", () => {
    expect(parseTime("00:00")).toBe(0);
    expect(parseTime("08:30")).toBe(510);
    expect(parseTime("23:59")).toBe(1439);
  });

  test.each([
    "24:00",
    "9:00",
    "12:60",
    "",
    "ab:cd",
    "12:5",
    " 12:00",
    "12:00 ",
  ])("rejects %j", (value) => {
    expect(() => parseTime(value)).toThrow(RangeError);
  });
});

describe("formatTime", () => {
  test("pads hours and minutes", () => {
    expect(formatTime(0)).toBe("00:00");
    expect(formatTime(65)).toBe("01:05");
    expect(formatTime(1439)).toBe("23:59");
  });

  test.each([-1, 1440, 1.5, NaN])("rejects %s", (value) => {
    expect(() => formatTime(value)).toThrow(RangeError);
  });
});

test("parseTime(formatTime(m)) round-trips for every valid minute", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 1439 }),
      (m) => parseTime(formatTime(m)) === m,
    ),
  );
});
