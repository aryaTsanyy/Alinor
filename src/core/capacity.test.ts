import { describe, test, expect } from "vitest";
import fc from "fast-check";
import {
  pomodoroBlockMinutes,
  capacityOf,
  type PomodoroTiming,
} from "./capacity";

const timing: PomodoroTiming = {
  pomodoroDurationMin: 25,
  shortBreakMin: 5,
  longBreakMin: 15,
  pomodorosBeforeLongBreak: 4,
};

describe("pomodoroBlockMinutes", () => {
  test.each([
    [0, 0],
    [1, 25],
    [2, 55],
    [3, 85],
    [4, 115],
    [5, 155],
    [6, 185],
    [8, 245],
  ])("%i pomodoros -> %i minutes", (count, minutes) => {
    expect(pomodoroBlockMinutes(count, timing)).toBe(minutes);
  });

  test("every break is long when pomodorosBeforeLongBreak is 1", () => {
    expect(
      pomodoroBlockMinutes(2, { ...timing, pomodorosBeforeLongBreak: 1 }),
    ).toBe(65);
  });

  test.each([-1, 1.5, NaN])("rejects count %s", (count) => {
    expect(() => pomodoroBlockMinutes(count, timing)).toThrow(RangeError);
  });
});

describe("capacityOf", () => {
  test.each([
    [-10, 0],
    [0, 0],
    [24, 0],
    [25, 1],
    [29, 1],
    [30, 1],
    [54, 1],
    [55, 2],
    [84, 2],
    [85, 3],
    [114, 3],
    [115, 4],
    [154, 4],
    [155, 5],
    [1454, 44],
    [1455, 45],
  ])("gap of %i min -> %i pomodoros", (gap, expected) => {
    expect(capacityOf(gap, timing)).toBe(expected);
  });

  test("a 25-minute gap holds one pomodoro (no trailing break required)", () => {
    expect(capacityOf(25, timing)).toBe(1);
  });

  test("works with zero-length breaks", () => {
    expect(
      capacityOf(100, { ...timing, shortBreakMin: 0, longBreakMin: 0 }),
    ).toBe(4);
  });

  test("works when every break is long", () => {
    const allLong = { ...timing, pomodorosBeforeLongBreak: 1 };
    expect(capacityOf(64, allLong)).toBe(1);
    expect(capacityOf(65, allLong)).toBe(2);
  });

  test("property: capacity is the exact maximum that fits", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1440 }), (gap) => {
        const c = capacityOf(gap, timing);
        expect(pomodoroBlockMinutes(c, timing)).toBeLessThanOrEqual(gap);
        expect(pomodoroBlockMinutes(c + 1, timing)).toBeGreaterThan(gap);
      }),
    );
  });

  test("property: capacity never decreases as the gap grows", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1439 }), (gap) => {
        expect(capacityOf(gap + 1, timing)).toBeGreaterThanOrEqual(
          capacityOf(gap, timing),
        );
      }),
    );
  });
});

describe("timing validation", () => {
  test.each([
    { pomodoroDurationMin: 0 },
    { pomodoroDurationMin: 25.5 },
    { shortBreakMin: -1 },
    { longBreakMin: -5 },
    { pomodorosBeforeLongBreak: 0 },
    { pomodorosBeforeLongBreak: 2.5 },
  ])("rejects invalid timing %j", (override) => {
    expect(() => capacityOf(100, { ...timing, ...override })).toThrow(
      RangeError,
    );
  });
});
