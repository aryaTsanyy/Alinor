import { describe, test, expect } from "vitest";
import fc from "fast-check";
import { resolveCollisions, type CollisionInput } from "./collisions";
import { pomodoroBlockMinutes } from "./capacity";
import { formatTime } from "./time";
import type {
  FixedScheduleRule,
  ScheduleException,
  TaskAllocation,
  UserSettings,
} from "./types";

const settings: UserSettings = {
  dayStartTime: "08:00",
  dayEndTime: "22:00",
  pomodoroDurationMin: 25,
  shortBreakMin: 5,
  longBreakMin: 15,
  pomodorosBeforeLongBreak: 4,
  preEventBufferMin: 0,
  postEventBufferMin: 15,
  maxDailyPomodoros: 8,
  maxQ1PomodorosPerDay: 5,
  q2ReservedPomodoros: 2,
  autoScheduleQ3: false,
  urgencyThresholdDays: 2,
};

const MON = "2026-10-19";
const TUE = "2026-10-20";
const NEXT_MON = "2026-10-26";
const NOW = new Date(2026, 9, 19, 7, 0);

const alloc = (
  id: string,
  date: string,
  startTime: string,
  pomodoroCount: number,
  status: TaskAllocation["status"] = "PLANNED",
): TaskAllocation => ({
  id,
  taskId: "t",
  date,
  startTime,
  pomodoroCount,
  status,
});

const event = (
  id: string,
  startTime: string,
  endTime: string,
  extra: Partial<FixedScheduleRule> = {},
): FixedScheduleRule => ({
  id,
  title: id,
  category: "work",
  startTime,
  endTime,
  isRecurring: false,
  specificDate: MON,
  ...extra,
});

const recurringMonday = (id: string, startTime: string, endTime: string) =>
  event(id, startTime, endTime, {
    isRecurring: true,
    specificDate: undefined,
    daysOfWeek: [1],
  });

const run = (over: Partial<CollisionInput> = {}, now: Date = NOW) =>
  resolveCollisions(
    {
      allocations: [],
      rules: [],
      exceptions: [],
      settings,
      startedAllocationIds: new Set<string>(),
      ...over,
    },
    now,
  );

const ids = (list: TaskAllocation[]) => list.map((a) => a.id);

describe("resolveCollisions", () => {
  const meeting = event("rapat", "09:00", "10:00");

  test("nothing to resolve without rules", () => {
    expect(run({ allocations: [alloc("a", MON, "09:30", 1)] })).toEqual({
      removed: [],
      flagged: [],
    });
  });

  test("removes a PLANNED allocation inside a fixed event", () => {
    const a = alloc("a", MON, "09:30", 1);
    expect(run({ allocations: [a], rules: [meeting] })).toEqual({
      removed: [a],
      flagged: [],
    });
  });

  test("removes an allocation that partially overlaps", () => {
    const a = alloc("a", MON, "08:30", 2); // 08:30-09:25, menyentuh acara 09:00
    expect(ids(run({ allocations: [a], rules: [meeting] }).removed)).toEqual([
      "a",
    ]);
  });

  test("touching is not a collision", () => {
    const endsAtStart = alloc("a", MON, "08:35", 1); // 08:35-09:00, acara mulai 09:00
    const startsAtBufferEnd = alloc("b", MON, "10:15", 1); // acara + buffer berakhir 10:15
    expect(
      run({ allocations: [endsAtStart, startsAtBufferEnd], rules: [meeting] }),
    ).toEqual({
      removed: [],
      flagged: [],
    });
  });

  test("the post-event buffer counts as occupied, and a custom buffer of 0 overrides it", () => {
    const insideBuffer = alloc("a", MON, "10:10", 1);
    expect(
      ids(run({ allocations: [insideBuffer], rules: [meeting] }).removed),
    ).toEqual(["a"]);

    const atTen = alloc("b", MON, "10:00", 1);
    expect(
      ids(run({ allocations: [atTen], rules: [meeting] }).removed),
    ).toEqual(["b"]);
    const noBuffer = event("rapat", "09:00", "10:00", {
      customPostBufferMin: 0,
    });
    expect(run({ allocations: [atTen], rules: [noBuffer] })).toEqual({
      removed: [],
      flagged: [],
    });
  });

  test("allocations on other dates are unaffected", () => {
    expect(
      run({ allocations: [alloc("a", TUE, "09:30", 1)], rules: [meeting] }),
    ).toEqual({
      removed: [],
      flagged: [],
    });
  });

  test("a started allocation is flagged instead of removed", () => {
    const started = alloc("started", MON, "09:30", 1);
    const fresh = alloc("fresh", MON, "09:40", 1);
    const result = run({
      allocations: [started, fresh],
      rules: [meeting],
      startedAllocationIds: new Set(["started"]),
    });
    expect(ids(result.flagged)).toEqual(["started"]);
    expect(ids(result.removed)).toEqual(["fresh"]);
  });

  test.each(["COMPLETED", "EXPIRED"] as const)(
    "a %s allocation is never touched",
    (status) => {
      const a = alloc("a", MON, "09:30", 1, status);
      expect(run({ allocations: [a], rules: [meeting] })).toEqual({
        removed: [],
        flagged: [],
      });
    },
  );

  test("today: an allocation that already ended is skipped; one in progress or upcoming is not", () => {
    const now = new Date(2026, 9, 19, 11, 0);
    const rules = [
      event("e1", "09:00", "10:00"),
      event("e2", "11:00", "12:00"),
    ];
    const past = alloc("past", MON, "09:30", 1); // berakhir 09:55, sebelum 11:00
    const ongoing = alloc("ongoing", MON, "10:50", 1); // 10:50-11:15, melewati 11:00
    const upcoming = alloc("upcoming", MON, "11:10", 1);
    const result = run({ allocations: [past, ongoing, upcoming], rules }, now);
    expect(ids(result.removed)).toEqual(["ongoing", "upcoming"]);
    expect(result.flagged).toEqual([]);
  });

  test("allocations from previous days are ignored", () => {
    const yesterday = "2026-10-18";
    const a = alloc("a", yesterday, "09:30", 1);
    const rule = event("rapat", "09:00", "10:00", { specificDate: yesterday });
    expect(run({ allocations: [a], rules: [rule] })).toEqual({
      removed: [],
      flagged: [],
    });
  });

  test("a recurring rule affects every matching date", () => {
    const allocations = [
      alloc("mon1", MON, "09:30", 1),
      alloc("mon2", NEXT_MON, "09:30", 1),
      alloc("tue", TUE, "09:30", 1),
    ];
    const result = run({
      allocations,
      rules: [recurringMonday("kelas", "09:00", "10:00")],
    });
    expect(ids(result.removed)).toEqual(["mon1", "mon2"]);
  });

  test("a CANCELLED exception removes the conflict for that date only", () => {
    const exceptions: ScheduleException[] = [
      { id: "x", ruleId: "kelas", originalDate: MON, type: "CANCELLED" },
    ];
    const allocations = [
      alloc("mon1", MON, "09:30", 1),
      alloc("mon2", NEXT_MON, "09:30", 1),
    ];
    const result = run({
      allocations,
      exceptions,
      rules: [recurringMonday("kelas", "09:00", "10:00")],
    });
    expect(ids(result.removed)).toEqual(["mon2"]);
  });

  test("an allocation with zero pomodoros is ignored", () => {
    expect(
      run({ allocations: [alloc("a", MON, "09:30", 0)], rules: [meeting] }),
    ).toEqual({
      removed: [],
      flagged: [],
    });
  });

  test("a MODIFIED exception on an affected date fails loudly (not implemented in MVP)", () => {
    const exceptions: ScheduleException[] = [
      {
        id: "m",
        ruleId: "kelas",
        originalDate: MON,
        type: "MODIFIED",
        newStartTime: "11:00",
        newEndTime: "12:00",
      },
    ];
    const rules = [recurringMonday("kelas", "09:00", "10:00")];
    expect(() =>
      run({ allocations: [alloc("a", MON, "09:30", 1)], rules, exceptions }),
    ).toThrow("MODIFIED");
    expect(() =>
      run({
        allocations: [alloc("a", NEXT_MON, "09:30", 1)],
        rules,
        exceptions,
      }),
    ).not.toThrow();
  });

  test.each([
    ["an invalid date", alloc("a", "2026-02-30", "09:30", 1)],
    ["a negative pomodoro count", alloc("a", MON, "09:30", -1)],
    ["a malformed start time", alloc("a", MON, "9:30", 1)],
  ])("fails loudly on %s", (_label, bad) => {
    expect(() => run({ allocations: [bad], rules: [meeting] })).toThrow(
      RangeError,
    );
  });

  test("fails loudly on an invalid now", () => {
    expect(() => run({}, new Date(NaN))).toThrow(RangeError);
  });

  test("returns the original objects, in input order, without mutating the input", () => {
    const a = alloc("a", MON, "09:30", 1);
    const b = alloc("b", MON, "09:35", 1);
    const input = [a, b];
    const snapshot = structuredClone(input);
    const result = run({ allocations: input, rules: [meeting] });
    expect(result.removed[0]).toBe(a);
    expect(result.removed[1]).toBe(b);
    expect(input).toEqual(snapshot);
  });

  test("property: an allocation is reported exactly when it overlaps the event and its buffer", () => {
    // acara 09:00-10:00 + buffer 15 menit menempati menit 540..615
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            start: fc.integer({ min: 0, max: 1400 }),
            count: fc.integer({ min: 1, max: 4 }),
            started: fc.boolean(),
          }),
          { maxLength: 10 },
        ),
        (specs) => {
          const allocations = specs.map((s, i) =>
            alloc(`a${i}`, MON, formatTime(s.start), s.count),
          );
          const started = new Set(
            specs.flatMap((s, i) => (s.started ? [`a${i}`] : [])),
          );
          const { removed, flagged } = run({
            allocations,
            rules: [meeting],
            startedAllocationIds: started,
          });
          specs.forEach((s, i) => {
            const id = `a${i}`;
            const end = s.start + pomodoroBlockMinutes(s.count, settings);
            const collides = s.start < 615 && 540 < end;
            expect(removed.some((a) => a.id === id)).toBe(
              collides && !s.started,
            );
            expect(flagged.some((a) => a.id === id)).toBe(
              collides && s.started,
            );
          });
        },
      ),
    );
  });
});
