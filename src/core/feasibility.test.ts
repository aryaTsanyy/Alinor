import { describe, test, expect } from "vitest";
import fc from "fast-check";
import { computeFeasibility, type FeasibilityInput } from "./feasibility";
import { calculateFreeSlots } from "./slots";
import type { FixedScheduleRule, Slot, Task, UserSettings } from "./types";

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

const TODAY = "2026-10-19"; // Senin
const TOMORROW = "2026-10-20";
const DAY_AFTER = "2026-10-21";
const NOW = new Date(2026, 9, 19, 7, 0);

const everyDay = (date: string): Slot[] => [
  { date, startTime: "08:00", endTime: "22:00", capacity: 26 },
];

const due = (
  id: string,
  estimated: number,
  deadline: string,
  extra: Partial<Task> = {},
): Task => ({
  id,
  title: id,
  isImportant: true,
  urgencyOverride: "AUTO",
  deadline,
  estimatedPomodoros: estimated,
  completedPomodoros: 0,
  status: "TODO",
  createdAt: "2026-10-01T00:00:00Z",
  ...extra,
});

const run = (
  tasks: Task[],
  over: Partial<Omit<FeasibilityInput, "tasks">> = {},
  now: Date = NOW,
) => computeFeasibility({ tasks, slotsFor: everyDay, settings, ...over }, now);

describe("computeFeasibility", () => {
  test("nothing to check", () => {
    expect(run([])).toEqual([]);
  });

  test("tasks without a deadline, DONE tasks and finished tasks are ignored", () => {
    const tasks = [
      { ...due("nd", 50, TODAY), deadline: undefined },
      due("done", 50, TODAY, { status: "DONE" }),
      due("finished", 2, TODAY, { completedPomodoros: 2 }),
    ];
    expect(run(tasks)).toEqual([]);
  });

  test("exactly the daily capacity fits; one more does not", () => {
    expect(run([due("a", 8, TODAY)])).toEqual([]);
    expect(run([due("a", 9, TODAY)])).toEqual([
      { taskId: "a", shortfallPomodoros: 1 },
    ]);
  });

  test("capacity is shared: two tasks that fit alone may not fit together", () => {
    expect(run([due("a", 5, TODAY), due("b", 5, TODAY)])).toEqual([
      { taskId: "b", shortfallPomodoros: 2 },
    ]);
  });

  test("capacity accumulates across days (earliest deadline first)", () => {
    expect(run([due("a", 12, TOMORROW), due("b", 10, DAY_AFTER)])).toEqual([]);
    expect(run([due("a", 12, TOMORROW), due("b", 13, DAY_AFTER)])).toEqual([
      { taskId: "b", shortfallPomodoros: 1 },
    ]);
  });

  test("an earlier task uses capacity that a later task could have used", () => {
    expect(run([due("a", 3, TODAY), due("b", 14, TOMORROW)])).toEqual([
      { taskId: "b", shortfallPomodoros: 1 },
    ]);
  });

  test("an overdue task is entirely a shortfall and does not use any capacity", () => {
    expect(run([due("o", 2, "2026-10-10"), due("x", 8, TODAY)])).toEqual([
      { taskId: "o", shortfallPomodoros: 2 },
    ]);
  });

  test("today only counts the time that is left", () => {
    expect(run([due("a", 5, TODAY)], {}, new Date(2026, 9, 19, 20, 0))).toEqual(
      [
        { taskId: "a", shortfallPomodoros: 1 }, // 20:00-22:00 = 120 menit = 4 pomodoro
      ],
    );
    expect(
      run([due("a", 2, TODAY)], {}, new Date(2026, 9, 19, 22, 30)),
    ).toEqual([{ taskId: "a", shortfallPomodoros: 2 }]);
  });

  test("the daily cap limits capacity even when there is free time", () => {
    const cfg = { ...settings, maxDailyPomodoros: 3 };
    expect(run([due("a", 4, TODAY)], { settings: cfg })).toEqual([
      { taskId: "a", shortfallPomodoros: 1 },
    ]);
  });

  test("uses real free slots: a fully booked day adds no capacity", () => {
    const bookedTuesday: FixedScheduleRule = {
      id: "penuh",
      title: "Penuh",
      category: "work",
      startTime: "08:00",
      endTime: "22:00",
      isRecurring: false,
      specificDate: TOMORROW,
    };
    const slotsFor = (date: string) =>
      calculateFreeSlots(date, [bookedTuesday], [], settings);
    expect(run([due("a", 8, TOMORROW)], { slotsFor })).toEqual([]);
    expect(run([due("a", 9, TOMORROW)], { slotsFor })).toEqual([
      { taskId: "a", shortfallPomodoros: 1 },
    ]);
  });

  describe("which days are looked at", () => {
    const recorder = () => {
      const calls: string[] = [];
      return {
        calls,
        slotsFor: (date: string) => {
          calls.push(date);
          return everyDay(date);
        },
      };
    };

    test("today through the deadline, and nothing else", () => {
      const r = recorder();
      run([due("a", 1, DAY_AFTER)], { slotsFor: r.slotsFor });
      expect(r.calls).toEqual([TODAY, TOMORROW, DAY_AFTER]);
    });

    test("no days are looked at when there is nothing to check or only overdue tasks", () => {
      const r = recorder();
      run([], { slotsFor: r.slotsFor });
      run([due("o", 2, "2026-10-10")], { slotsFor: r.slotsFor });
      expect(r.calls).toEqual([]);
    });

    test("a far-away deadline is clamped to the horizon", () => {
      const r = recorder();
      expect(
        run([due("a", 1, "2030-01-01")], { slotsFor: r.slotsFor }),
      ).toEqual([]);
      expect(r.calls).toHaveLength(367);
    });
  });

  test("invalid input fails loudly", () => {
    expect(() => run([], {}, new Date(NaN))).toThrow(RangeError);
    expect(() =>
      run([], { settings: { ...settings, maxDailyPomodoros: -1 } }),
    ).toThrow(RangeError);
    expect(() => run([due("a", 1, "2026-02-30")])).toThrow(RangeError);
    expect(() => run([due("a", 1.5, TODAY)])).toThrow(RangeError);
  });

  test("a DONE task with a corrupt deadline is ignored", () => {
    expect(() =>
      run([due("x", 1, "2026-02-30", { status: "DONE" })]),
    ).not.toThrow();
  });

  test("property: with every deadline today, the total shortfall is demand minus capacity", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 12 }), { maxLength: 8 }),
        (demands) => {
          const tasks = demands.map((n, i) => due(`t${i}`, n, TODAY));
          const warnings = run(tasks);
          const shortfall = warnings.reduce(
            (sum, w) => sum + w.shortfallPomodoros,
            0,
          );
          const total = demands.reduce((sum, n) => sum + n, 0);
          expect(shortfall).toBe(Math.max(0, total - 8));
          for (const w of warnings) {
            expect(w.shortfallPomodoros).toBeGreaterThanOrEqual(1);
            expect(w.shortfallPomodoros).toBeLessThanOrEqual(
              demands[Number(w.taskId.slice(1))],
            );
          }
        },
      ),
    );
  });
});
