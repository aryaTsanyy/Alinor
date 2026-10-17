import { describe, test, expect } from "vitest";
import fc from "fast-check";
import { generateAutoAllocations, type AllocationInput } from "./allocator";
import { pomodoroBlockMinutes } from "./capacity";
import { parseTime } from "./time";
import type { Slot, Task, TaskAllocation, UserSettings } from "./types";

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

const DATE = "2026-10-19"; // Senin
const NOW = new Date(2026, 9, 19, 7, 0); // 07:00, sebelum semua slot
const DAY: Slot = {
  date: DATE,
  startTime: "08:00",
  endTime: "22:00",
  capacity: 26,
};
const TWO_SLOTS: Slot[] = [
  { date: DATE, startTime: "08:00", endTime: "09:00", capacity: 2 },
  { date: DATE, startTime: "10:55", endTime: "14:00", capacity: 6 },
];

const task = (id: string, override: Partial<Task> = {}): Task => ({
  id,
  title: id,
  isImportant: true, // tanpa deadline -> Q2
  urgencyOverride: "AUTO",
  estimatedPomodoros: 1,
  completedPomodoros: 0,
  status: "TODO",
  createdAt: "2026-10-01T00:00:00Z",
  ...override,
});
const q1 = (id: string, estimated: number, extra: Partial<Task> = {}) =>
  task(id, { deadline: DATE, estimatedPomodoros: estimated, ...extra });
const q2 = (id: string, estimated: number, extra: Partial<Task> = {}) =>
  task(id, { estimatedPomodoros: estimated, ...extra });
const q3 = (id: string, estimated: number) =>
  task(id, {
    isImportant: false,
    deadline: DATE,
    estimatedPomodoros: estimated,
  });
const q4 = (id: string, estimated: number) =>
  task(id, { isImportant: false, estimatedPomodoros: estimated });

const existing = (
  taskId: string,
  startTime: string,
  pomodoroCount: number,
  status: TaskAllocation["status"] = "PLANNED",
  date: string = DATE,
): TaskAllocation => ({
  id: `e-${taskId}-${startTime}`,
  taskId,
  date,
  startTime,
  pomodoroCount,
  status,
});

const expected = (
  taskId: string,
  startTime: string,
  pomodoroCount: number,
) => ({
  id: `alloc:${DATE}:${startTime}:${taskId}`,
  taskId,
  date: DATE,
  startTime,
  pomodoroCount,
  status: "PLANNED" as const,
});

const run = (over: Partial<AllocationInput> = {}, now: Date = NOW) =>
  generateAutoAllocations(
    {
      date: DATE,
      slots: [DAY],
      tasks: [],
      existingAllocations: [],
      settings,
      ...over,
    },
    now,
  );

describe("basics", () => {
  test("no tasks -> nothing to do", () => {
    expect(run()).toEqual({ allocations: [], warnings: [] });
  });

  test("a Q1 task is placed at the start of the free time", () => {
    expect(run({ tasks: [q1("a", 2)] })).toEqual({
      allocations: [expected("a", "08:00", 2)],
      warnings: [],
    });
  });

  test("DONE tasks and tasks with nothing remaining are ignored", () => {
    const tasks = [
      q1("done", 3, { status: "DONE" }),
      q1("finished", 2, { completedPomodoros: 2 }),
      q1("over", 2, { completedPomodoros: 3 }),
    ];
    expect(run({ tasks })).toEqual({ allocations: [], warnings: [] });
  });

  test("does not mutate its input and is deterministic", () => {
    const tasks = [q1("a", 3), q2("b", 4)];
    const snapshot = structuredClone(tasks);
    const first = run({ tasks });
    expect(tasks).toEqual(snapshot);
    expect(run({ tasks })).toEqual(first);
  });
});

describe("Q1 cap (decision A: hard cap for auto-fill)", () => {
  test("Q1 demand beyond the cap is not scheduled and produces a warning", () => {
    expect(run({ tasks: [q1("a", 7)] })).toEqual({
      allocations: [expected("a", "08:00", 5)],
      warnings: [
        { type: "Q1_OVERFLOW", taskIds: ["a"], shortfallPomodoros: 2 },
      ],
    });
  });

  test("the warning lists every Q1 task that was not fully placed", () => {
    const tasks = [
      q1("a", 3),
      q1("b", 3, { deadline: "2026-10-20" }),
      q1("c", 2, { deadline: "2026-10-20" }),
    ];
    expect(run({ tasks })).toEqual({
      allocations: [expected("a", "08:00", 3), expected("b", "09:30", 2)],
      warnings: [
        { type: "Q1_OVERFLOW", taskIds: ["b", "c"], shortfallPomodoros: 3 },
      ],
    });
  });

  test("Q1 with no room at all produces a warning and no allocations", () => {
    expect(run({ slots: [], tasks: [q1("a", 3)] })).toEqual({
      allocations: [],
      warnings: [
        { type: "Q1_OVERFLOW", taskIds: ["a"], shortfallPomodoros: 3 },
      ],
    });
  });
});

describe("Q2 reservation", () => {
  test("Q1 cannot consume the protected Q2 quota", () => {
    const cfg = { ...settings, maxQ1PomodorosPerDay: 8 };
    expect(run({ settings: cfg, tasks: [q1("a", 10), q2("b", 5)] })).toEqual({
      allocations: [expected("a", "08:00", 6), expected("b", "11:10", 2)],
      warnings: [
        { type: "Q1_OVERFLOW", taskIds: ["a"], shortfallPomodoros: 4 },
      ],
    });
  });

  test("without Q2 demand nothing is held back from Q1", () => {
    const cfg = { ...settings, maxQ1PomodorosPerDay: 8 };
    expect(run({ settings: cfg, tasks: [q1("a", 10)] })).toEqual({
      allocations: [expected("a", "08:00", 8)],
      warnings: [
        { type: "Q1_OVERFLOW", taskIds: ["a"], shortfallPomodoros: 2 },
      ],
    });
  });

  test("Q2 may use all remaining room beyond its quota, limited by the daily cap", () => {
    expect(run({ tasks: [q2("b", 6)] }).allocations).toEqual([
      expected("b", "08:00", 6),
    ]);
    expect(run({ tasks: [q2("b", 12)] }).allocations).toEqual([
      expected("b", "08:00", 8),
    ]);
  });
});

describe("Q3 and Q4", () => {
  test("Q3 is scheduled only when autoScheduleQ3 is on", () => {
    expect(run({ tasks: [q3("c", 2)] }).allocations).toEqual([]);
    expect(
      run({
        settings: { ...settings, autoScheduleQ3: true },
        tasks: [q3("c", 2)],
      }).allocations,
    ).toEqual([expected("c", "08:00", 2)]);
  });

  test("Q4 is never scheduled", () => {
    expect(
      run({
        settings: { ...settings, autoScheduleQ3: true },
        tasks: [q4("d", 2)],
      }).allocations,
    ).toEqual([]);
  });
});

describe("ordering inside a quadrant", () => {
  test("earliest deadline first, tasks without a deadline last", () => {
    const tasks = [
      q2("a", 1, { deadline: "2026-10-30" }),
      q2("b", 1, { deadline: "2026-10-25" }),
      q2("c", 1),
    ];
    expect(run({ tasks }).allocations).toEqual([
      expected("b", "08:00", 1),
      expected("a", "08:30", 1),
      expected("c", "09:00", 1),
    ]);
  });

  test("then oldest createdAt, then id", () => {
    const byAge = [
      q2("x", 1, { createdAt: "2026-10-02T00:00:00Z" }),
      q2("y", 1, { createdAt: "2026-10-01T00:00:00Z" }),
    ];
    expect(run({ tasks: byAge }).allocations).toEqual([
      expected("y", "08:00", 1),
      expected("x", "08:30", 1),
    ]);
    const byId = [q2("b", 1), q2("a", 1)];
    expect(run({ tasks: byId }).allocations).toEqual([
      expected("a", "08:00", 1),
      expected("b", "08:30", 1),
    ]);
  });
});

describe("existing allocations (decision B)", () => {
  test("manual Q1 pomodoros count toward the Q1 cap", () => {
    const tasks = [q1("q", 4), q1("a", 3)];
    expect(
      run({ tasks, existingAllocations: [existing("q", "08:00", 4)] }),
    ).toEqual({
      allocations: [expected("a", "10:00", 1)],
      warnings: [
        { type: "Q1_OVERFLOW", taskIds: ["a"], shortfallPomodoros: 2 },
      ],
    });
  });

  test("manual pomodoros count toward the daily cap", () => {
    const tasks = [q4("z", 7), q2("b", 5)];
    expect(
      run({ tasks, existingAllocations: [existing("z", "08:00", 7)] })
        .allocations,
    ).toEqual([expected("b", "11:40", 1)]);
  });

  test("COMPLETED allocations count toward the cap but are not subtracted from the task twice", () => {
    const tasks = [q2("c", 5, { completedPomodoros: 2 })];
    expect(
      run({
        tasks,
        existingAllocations: [existing("c", "08:00", 2, "COMPLETED")],
      }).allocations,
    ).toEqual([expected("c", "09:00", 3)]);
  });

  test("PLANNED allocations reduce what is still needed", () => {
    const tasks = [q2("c", 3)];
    expect(
      run({ tasks, existingAllocations: [existing("c", "08:00", 3)] })
        .allocations,
    ).toEqual([]);
  });
});

describe("the current time (decision C)", () => {
  test("free time before now is not used; the start is rounded up to 5 minutes", () => {
    const now = new Date(2026, 9, 19, 10, 3);
    expect(run({ tasks: [q2("b", 2)] }, now).allocations).toEqual([
      expected("b", "10:05", 2),
    ]);
  });

  test("a slot that is already past is dropped", () => {
    const now = new Date(2026, 9, 19, 8, 40);
    expect(
      run({ slots: TWO_SLOTS, tasks: [q1("a", 2)] }, now).allocations,
    ).toEqual([expected("a", "10:55", 2)]);
  });

  test("after the last slot there is nothing to allocate", () => {
    const now = new Date(2026, 9, 19, 22, 30);
    expect(run({ tasks: [q1("a", 2)] }, now)).toEqual({
      allocations: [],
      warnings: [
        { type: "Q1_OVERFLOW", taskIds: ["a"], shortfallPomodoros: 2 },
      ],
    });
  });
});

describe("splitting across slots", () => {
  test("a task spills into the next slot when the first is full", () => {
    expect(run({ slots: TWO_SLOTS, tasks: [q1("a", 4)] }).allocations).toEqual([
      expected("a", "08:00", 2),
      expected("a", "10:55", 2),
    ]);
  });
});

describe("invalid input fails loudly", () => {
  test("date must be today", () => {
    expect(() => run({ date: "2026-10-20" })).toThrow(RangeError);
  });

  test("invalid now", () => {
    expect(() => run({}, new Date(NaN))).toThrow(RangeError);
  });

  test("a PLANNED allocation on another day means rollover was skipped", () => {
    const stale = existing("a", "08:00", 1, "PLANNED", "2026-10-18");
    expect(() =>
      run({ tasks: [q1("a", 2)], existingAllocations: [stale] }),
    ).toThrow(RangeError);
  });

  test("an EXPIRED allocation from another day is ignored", () => {
    const old = existing("a", "08:00", 1, "EXPIRED", "2026-10-18");
    expect(() =>
      run({ tasks: [q1("a", 2)], existingAllocations: [old] }),
    ).not.toThrow();
  });

  test("an allocation for an unknown task", () => {
    expect(() =>
      run({ existingAllocations: [existing("ghost", "08:00", 1)] }),
    ).toThrow(RangeError);
  });

  test.each([
    { maxDailyPomodoros: -1 },
    { maxQ1PomodorosPerDay: 1.5 },
    { q2ReservedPomodoros: NaN },
  ])("invalid budget %j", (override) => {
    expect(() => run({ settings: { ...settings, ...override } })).toThrow(
      RangeError,
    );
  });

  test("invalid pomodoro counts on a task", () => {
    expect(() => run({ tasks: [q1("a", 1.5)] })).toThrow(RangeError);
  });
});

describe("invariants", () => {
  type Kind = "Q1" | "Q2" | "Q3" | "Q4";
  const build = (kind: Kind, id: string, estimated: number): Task => ({
    ...task(id, { estimatedPomodoros: estimated }),
    isImportant: kind === "Q1" || kind === "Q2",
    deadline: kind === "Q1" || kind === "Q3" ? DATE : undefined,
  });

  test("property: budgets, ordering and non-overlap hold for any mix of tasks", () => {
    const spec = fc.record({
      kind: fc.constantFrom<Kind>("Q1", "Q2", "Q3", "Q4"),
      estimated: fc.integer({ min: 1, max: 8 }),
    });

    fc.assert(
      fc.property(
        fc.array(spec, { maxLength: 8 }),
        fc.integer({ min: 0, max: 8 }),
        fc.boolean(),
        (specs, maxQ1, withQ3) => {
          const cfg = {
            ...settings,
            maxQ1PomodorosPerDay: maxQ1,
            autoScheduleQ3: withQ3,
          };
          const tasks = specs.map((s, i) =>
            build(s.kind, `t${i}`, s.estimated),
          );
          const kindOf = (id: string): Kind => {
            const index = tasks.findIndex((t) => t.id === id);
            if (index < 0) throw new Error(`unknown task ${id}`);
            return specs[index].kind;
          };
          const { allocations } = run({ tasks, settings: cfg });

          const perTask = new Map<string, number>();
          const perKind: Record<Kind, number> = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
          let total = 0;
          for (const a of allocations) {
            perTask.set(
              a.taskId,
              (perTask.get(a.taskId) ?? 0) + a.pomodoroCount,
            );
            perKind[kindOf(a.taskId)] += a.pomodoroCount;
            total += a.pomodoroCount;
          }

          expect(total).toBeLessThanOrEqual(cfg.maxDailyPomodoros);
          expect(perKind.Q1).toBeLessThanOrEqual(maxQ1);
          expect(perKind.Q4).toBe(0);
          if (!withQ3) expect(perKind.Q3).toBe(0);
          for (const t of tasks) {
            expect(perTask.get(t.id) ?? 0).toBeLessThanOrEqual(
              t.estimatedPomodoros,
            );
          }

          const q2Demand = tasks
            .filter((t) => kindOf(t.id) === "Q2")
            .reduce((sum, t) => sum + t.estimatedPomodoros, 0);
          expect(perKind.Q2).toBeGreaterThanOrEqual(
            Math.min(q2Demand, cfg.q2ReservedPomodoros),
          );

          let previousEnd = 0;
          for (const a of allocations) {
            const start = parseTime(a.startTime);
            const end = start + pomodoroBlockMinutes(a.pomodoroCount, cfg);
            expect(start).toBeGreaterThanOrEqual(Math.max(previousEnd, 480));
            expect(end).toBeLessThanOrEqual(1320);
            previousEnd = end;
          }
        },
      ),
    );
  });
});
