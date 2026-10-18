import { describe, test, expect } from "vitest";
import fc from "fast-check";
import { rolloverAllocations } from "./rollover";
import { generateAutoAllocations } from "./allocator";
import type { Slot, Task, TaskAllocation, UserSettings } from "./types";

const TODAY = "2026-10-19";
const YESTERDAY = "2026-10-18";
const TOMORROW = "2026-10-20";
const NOW = new Date(2026, 9, 19, 9, 0);

const alloc = (
  id: string,
  date: string,
  status: TaskAllocation["status"],
): TaskAllocation => ({
  id,
  taskId: "t",
  date,
  startTime: "08:00",
  pomodoroCount: 2,
  status,
});

describe("rolloverAllocations", () => {
  test("empty input -> empty output", () => {
    expect(rolloverAllocations([], NOW)).toEqual([]);
  });

  test("a PLANNED allocation from a past day expires; nothing else about it changes", () => {
    const before = alloc("a", YESTERDAY, "PLANNED");
    expect(rolloverAllocations([before], NOW)).toEqual([
      { ...before, status: "EXPIRED" },
    ]);
  });

  test.each(["COMPLETED", "EXPIRED"] as const)(
    "a past %s allocation is left alone",
    (status) => {
      const before = alloc("a", YESTERDAY, status);
      expect(rolloverAllocations([before], NOW)).toEqual([before]);
    },
  );

  test("PLANNED allocations for today and the future are left alone", () => {
    const input = [
      alloc("a", TODAY, "PLANNED"),
      alloc("b", TOMORROW, "PLANNED"),
    ];
    expect(rolloverAllocations(input, NOW)).toEqual(input);
  });

  test("the day boundary is midnight", () => {
    const yesterday = alloc("a", YESTERDAY, "PLANNED");
    expect(
      rolloverAllocations([yesterday], new Date(2026, 9, 19, 0, 0))[0].status,
    ).toBe("EXPIRED");
    expect(
      rolloverAllocations([yesterday], new Date(2026, 9, 18, 23, 59))[0].status,
    ).toBe("PLANNED");
  });

  test("does not mutate its input; unchanged items keep their identity", () => {
    const stale = alloc("a", YESTERDAY, "PLANNED");
    const fresh = alloc("b", TODAY, "PLANNED");
    const input = [stale, fresh];
    const result = rolloverAllocations(input, NOW);
    expect(result).not.toBe(input);
    expect(stale.status).toBe("PLANNED");
    expect(result[0]).not.toBe(stale);
    expect(result[1]).toBe(fresh);
  });

  test("invalid input fails loudly", () => {
    expect(() => rolloverAllocations([], new Date(NaN))).toThrow(RangeError);
    expect(() =>
      rolloverAllocations([alloc("a", "2026-02-30", "PLANNED")], NOW),
    ).toThrow(RangeError);
    expect(() => rolloverAllocations([alloc("a", "", "PLANNED")], NOW)).toThrow(
      RangeError,
    );
  });

  test("property: idempotent, order-preserving, and only past PLANNED allocations change", () => {
    const dateFromToday = (offset: number) =>
      new Date(Date.UTC(2026, 9, 19) + offset * 86_400_000)
        .toISOString()
        .slice(0, 10);
    const statusArb = fc.constantFrom<TaskAllocation["status"]>(
      "PLANNED",
      "COMPLETED",
      "EXPIRED",
    );

    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.integer({ min: -30, max: 30 }), statusArb), {
          maxLength: 10,
        }),
        (pairs) => {
          const input = pairs.map(([offset, status], i) =>
            alloc(`a${i}`, dateFromToday(offset), status),
          );
          const once = rolloverAllocations(input, NOW);
          expect(rolloverAllocations(once, NOW)).toEqual(once);
          expect(once).toHaveLength(input.length);
          once.forEach((out, i) => {
            const before = input[i];
            const shouldExpire =
              before.status === "PLANNED" && before.date < TODAY;
            expect(out).toEqual(
              shouldExpire ? { ...before, status: "EXPIRED" } : before,
            );
          });
        },
      ),
    );
  });
});

describe("rollover together with the allocator", () => {
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
  const day: Slot = {
    date: TODAY,
    startTime: "08:00",
    endTime: "22:00",
    capacity: 26,
  };
  const unfinished: Task = {
    id: "c",
    title: "c",
    isImportant: true, // tanpa deadline -> Q2
    urgencyOverride: "AUTO",
    estimatedPomodoros: 3,
    completedPomodoros: 0,
    status: "TODO",
    createdAt: "2026-10-01T00:00:00Z",
  };
  const stale: TaskAllocation[] = [
    {
      id: "old",
      taskId: "c",
      date: YESTERDAY,
      startTime: "08:00",
      pomodoroCount: 3,
      status: "PLANNED",
    },
  ];
  const base = { date: TODAY, slots: [day], tasks: [unfinished], settings };

  test("without rollover the allocator refuses stale allocations", () => {
    expect(() =>
      generateAutoAllocations({ ...base, existingAllocations: stale }, NOW),
    ).toThrow(RangeError);
  });

  test("after rollover the unfinished pomodoros are allocated again today", () => {
    const rolled = rolloverAllocations(stale, NOW);
    expect(
      generateAutoAllocations({ ...base, existingAllocations: rolled }, NOW)
        .allocations,
    ).toEqual([
      {
        id: `alloc:${TODAY}:09:00:c`,
        taskId: "c",
        date: TODAY,
        startTime: "09:00",
        pomodoroCount: 3,
        status: "PLANNED",
      },
    ]);
  });
});
