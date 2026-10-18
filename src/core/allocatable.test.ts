import { describe, test, expect } from "vitest";
import fc from "fast-check";
import {
  roundUpToStep,
  minutesOfDay,
  pomodoroStartOffset,
  buildAllocatableGaps,
  createGapCursor,
} from "./allocatable";
import { pomodoroBlockMinutes, type PomodoroTiming } from "./capacity";
import { parseTime } from "./time";
import type { Slot, TaskAllocation } from "./types";

const timing: PomodoroTiming = {
  pomodoroDurationMin: 25,
  shortBreakMin: 5,
  longBreakMin: 15,
  pomodorosBeforeLongBreak: 4,
};

const DATE = "2026-10-19";
const slot = (startTime: string, endTime: string, capacity: number): Slot => ({
  date: DATE,
  startTime,
  endTime,
  capacity,
});
const SLOTS = [slot("08:00", "09:00", 2), slot("10:55", "14:00", 6)];

const alloc = (
  startTime: string,
  pomodoroCount: number,
  status: TaskAllocation["status"] = "PLANNED",
): TaskAllocation => ({
  id: `a-${startTime}`,
  taskId: "t",
  date: DATE,
  startTime,
  pomodoroCount,
  status,
});

describe("roundUpToStep", () => {
  test.each([
    [0, 0],
    [1, 5],
    [4, 5],
    [5, 5],
    [6, 10],
    [600, 600],
    [603, 605],
    [1439, 1440],
  ])("%i -> %i", (minutes, expected) => {
    expect(roundUpToStep(minutes)).toBe(expected);
  });

  test.each([-1, 1.5, NaN])("rejects minutes %s", (v) => {
    expect(() => roundUpToStep(v)).toThrow(RangeError);
  });

  test.each([0, 2.5])("rejects step %s", (step) => {
    expect(() => roundUpToStep(10, step)).toThrow(RangeError);
  });
});

describe("minutesOfDay", () => {
  test.each([
    [new Date(2026, 9, 19, 10, 3, 45), 603],
    [new Date(2026, 9, 19, 0, 0), 0],
    [new Date(2026, 9, 19, 23, 59), 1439],
  ])("%s -> %i", (date, expected) => {
    expect(minutesOfDay(date)).toBe(expected);
  });

  test("throws on an invalid Date", () => {
    expect(() => minutesOfDay(new Date(NaN))).toThrow(RangeError);
  });
});

describe("pomodoroStartOffset", () => {
  test.each([
    [0, 0],
    [1, 30],
    [2, 60],
    [3, 90],
    [4, 130],
    [5, 160],
  ])("pomodoro #%i starts %i minutes into the gap", (index, expected) => {
    expect(pomodoroStartOffset(index, timing)).toBe(expected);
  });

  test.each([-1, 1.5, NaN])("rejects index %s", (v) => {
    expect(() => pomodoroStartOffset(v, timing)).toThrow(RangeError);
  });
});

describe("buildAllocatableGaps", () => {
  const build = (
    over: Partial<Parameters<typeof buildAllocatableGaps>[0]> = {},
  ) =>
    buildAllocatableGaps({
      slots: SLOTS,
      existing: [],
      notBefore: 0,
      timing,
      ...over,
    });

  test("recomputes capacity per slot when nothing is occupied", () => {
    expect(build()).toEqual([
      { start: 480, capacity: 2 },
      { start: 655, capacity: 6 },
    ]);
  });

  test("sorts gaps even when slots are unsorted", () => {
    expect(build({ slots: [SLOTS[1], SLOTS[0]] })).toEqual(build());
  });

  test("clips to notBefore and recomputes capacity", () => {
    expect(build({ notBefore: 510 })).toEqual([
      { start: 510, capacity: 1 },
      { start: 655, capacity: 6 },
    ]);
    expect(build({ notBefore: 535 })).toEqual([{ start: 655, capacity: 6 }]); // sisa 5 menit dibuang
    expect(build({ notBefore: 700 })).toEqual([{ start: 700, capacity: 4 }]);
  });

  test("an existing allocation occupies its block plus one short break", () => {
    expect(build({ existing: [alloc("08:00", 1)] })).toEqual([
      { start: 510, capacity: 1 },
      { start: 655, capacity: 6 },
    ]);
    expect(build({ existing: [alloc("08:00", 2)] })).toEqual([
      { start: 655, capacity: 6 },
    ]);
  });

  test("COMPLETED allocations occupy time too; EXPIRED and empty ones do not", () => {
    expect(build({ existing: [alloc("08:00", 1, "COMPLETED")] })).toEqual(
      build({ existing: [alloc("08:00", 1)] }),
    );
    expect(
      build({ existing: [alloc("08:00", 2, "EXPIRED"), alloc("08:00", 0)] }),
    ).toEqual(build());
  });

  test("an allocation at the end of a slot shrinks the gap before it", () => {
    expect(build({ existing: [alloc("13:00", 2)] })).toEqual([
      { start: 480, capacity: 2 },
      { start: 655, capacity: 4 },
    ]);
  });

  test.each([-1, 1.5, NaN])("rejects notBefore %s", (v) => {
    expect(() => build({ notBefore: v })).toThrow(RangeError);
  });

  test("property: gaps start at or after notBefore, are sorted and fit inside a slot", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1440 }), (notBefore) => {
        const gaps = build({ notBefore });
        for (let i = 0; i < gaps.length; i++) {
          const g = gaps[i];
          expect(g.start).toBeGreaterThanOrEqual(notBefore);
          expect(g.capacity).toBeGreaterThanOrEqual(1);
          if (i > 0) expect(g.start).toBeGreaterThanOrEqual(gaps[i - 1].start);
          const end = g.start + pomodoroBlockMinutes(g.capacity, timing);
          expect(
            SLOTS.some(
              (s) =>
                parseTime(s.startTime) <= g.start &&
                end <= parseTime(s.endTime),
            ),
          ).toBe(true);
        }
      }),
    );
  });
});

describe("createGapCursor", () => {
  const gaps = [
    { start: 480, capacity: 2 },
    { start: 655, capacity: 6 },
  ];

  test("places pomodoros at the earliest gap and continues with the right offset", () => {
    const cursor = createGapCursor(gaps, timing);
    expect(cursor.remainingCapacity()).toBe(8);
    expect(cursor.take(1)).toEqual([{ startTime: "08:00", pomodoroCount: 1 }]);
    expect(cursor.take(2)).toEqual([
      { startTime: "08:30", pomodoroCount: 1 },
      { startTime: "10:55", pomodoroCount: 1 },
    ]);
    expect(cursor.remainingCapacity()).toBe(5);
  });

  test("offsets inside a gap include breaks between earlier placements", () => {
    const cursor = createGapCursor(gaps, timing);
    expect(cursor.take(2)).toEqual([{ startTime: "08:00", pomodoroCount: 2 }]);
    expect(cursor.take(3)).toEqual([{ startTime: "10:55", pomodoroCount: 3 }]);
    expect(cursor.take(1)).toEqual([{ startTime: "12:25", pomodoroCount: 1 }]);
  });

  test("take(0) places nothing; over-asking places only what fits", () => {
    const cursor = createGapCursor(gaps, timing);
    expect(cursor.take(0)).toEqual([]);
    const placed = cursor
      .take(100)
      .reduce((sum, p) => sum + p.pomodoroCount, 0);
    expect(placed).toBe(8);
    expect(cursor.remainingCapacity()).toBe(0);
    expect(cursor.take(1)).toEqual([]);
  });

  test("sorts unsorted gaps", () => {
    expect(createGapCursor([gaps[1], gaps[0]], timing).take(1)).toEqual([
      { startTime: "08:00", pomodoroCount: 1 },
    ]);
  });

  test.each([-1, 1.5, NaN])("rejects count %s", (v) => {
    expect(() => createGapCursor(gaps, timing).take(v)).toThrow(RangeError);
  });
});
