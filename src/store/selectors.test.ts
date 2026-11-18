import { describe, test, expect } from "vitest";
import type {
  FixedScheduleRule,
  PomodoroSession,
  Task,
  TaskAllocation,
} from "../core";
import { DEFAULT_SETTINGS } from "../repository/data";
import {
  selectFeasibility,
  selectFreeSlots,
  selectOccurrences,
  selectStartedAllocationIds,
  selectTasksByQuadrant,
  selectTodayAllocations,
} from "./selectors";
import type { AlinorState } from "./types";

const MON = "2026-10-19";
const TUE = "2026-10-20";
const NOW = new Date(2026, 9, 19, 7, 0);

type View = Pick<
  AlinorState,
  | "settings"
  | "rules"
  | "exceptions"
  | "tasks"
  | "allocations"
  | "sessions"
  | "sessionsStatus"
>;
const view = (over: Partial<View> = {}): View => ({
  settings: DEFAULT_SETTINGS,
  rules: [],
  exceptions: [],
  tasks: [],
  allocations: [],
  sessions: [],
  sessionsStatus: "ok",
  ...over,
});

const task = (id: string, over: Partial<Task> = {}): Task => ({
  id,
  title: id,
  isImportant: true,
  urgencyOverride: "AUTO",
  estimatedPomodoros: 1,
  completedPomodoros: 0,
  status: "TODO",
  createdAt: "2026-10-01T00:00:00Z",
  ...over,
});

const rule = (
  id: string,
  startTime: string,
  endTime: string,
  over: Partial<FixedScheduleRule> = {},
): FixedScheduleRule => ({
  id,
  title: id,
  category: "academic",
  startTime,
  endTime,
  isRecurring: true,
  daysOfWeek: [1],
  ...over,
});

const allocation = (
  id: string,
  date: string,
  startTime: string,
  status: TaskAllocation["status"] = "PLANNED",
): TaskAllocation => ({
  id,
  taskId: "t",
  date,
  startTime,
  pomodoroCount: 1,
  status,
});

describe("selectors", () => {
  test("selectTasksByQuadrant groups unfinished tasks by their derived quadrant", () => {
    const tasks = [
      task("laporan", { deadline: MON }),
      task("proposal"),
      task("email", { isImportant: false, deadline: MON }),
      task("medsos", { isImportant: false }),
      task("selesai", { status: "DONE", deadline: MON }),
    ];
    const grouped = selectTasksByQuadrant(view({ tasks }), NOW);
    expect(grouped.Q1.map((t) => t.id)).toEqual(["laporan"]);
    expect(grouped.Q2.map((t) => t.id)).toEqual(["proposal"]);
    expect(grouped.Q3.map((t) => t.id)).toEqual(["email"]);
    expect(grouped.Q4.map((t) => t.id)).toEqual(["medsos"]);
  });

  test("selectFreeSlots reflects the fixed schedule", () => {
    expect(
      selectFreeSlots(view({ rules: [rule("kelas", "09:00", "10:40")] }), MON),
    ).toEqual([
      { date: MON, startTime: "08:00", endTime: "09:00", capacity: 2 },
      { date: MON, startTime: "10:55", endTime: "22:00", capacity: 20 },
    ]);
  });

  test("selectOccurrences lists the fixed events of a date in time order", () => {
    const rules = [
      rule("gym", "17:00", "18:30", {
        isRecurring: false,
        daysOfWeek: undefined,
        specificDate: MON,
      }),
      rule("kelas", "09:00", "10:40"),
    ];
    expect(selectOccurrences(view({ rules }), MON)).toEqual([
      { ruleId: "kelas", start: 540, end: 640 },
      { ruleId: "gym", start: 1020, end: 1110 },
    ]);
  });

  test("selectFeasibility warns about a task that cannot fit before its deadline", () => {
    const tasks = [task("t", { deadline: MON, estimatedPomodoros: 9 })];
    expect(selectFeasibility(view({ tasks }), NOW)).toEqual([
      { taskId: "t", shortfallPomodoros: 1 },
    ]);
  });

  test("selectTodayAllocations keeps today only, drops expired ones and sorts by start time", () => {
    const allocations = [
      allocation("A", MON, "10:00"),
      allocation("B", MON, "08:00", "COMPLETED"),
      allocation("C", MON, "12:00", "EXPIRED"),
      allocation("D", TUE, "08:00"),
    ];
    expect(
      selectTodayAllocations(view({ allocations }), NOW).map((a) => a.id),
    ).toEqual(["B", "A"]);
  });

  test("selectStartedAllocationIds comes from the session log when it is readable", () => {
    const sessions: PomodoroSession[] = [
      {
        id: "s1",
        taskId: "t",
        startedAt: "2026-10-19T09:00:00",
        endedAt: "2026-10-19T09:25:00",
        completed: false,
        quadrantAtTime: "Q2",
        allocationId: "A",
      },
    ];
    const allocations = [
      allocation("A", MON, "09:00"),
      allocation("B", MON, "10:00"),
    ];
    expect([
      ...selectStartedAllocationIds(view({ allocations, sessions })),
    ]).toEqual(["A"]);
  });

  test("selectStartedAllocationIds fails safe: with an unreadable log every PLANNED allocation counts as started", () => {
    const allocations = [
      allocation("A", MON, "09:00"),
      allocation("B", MON, "10:00", "COMPLETED"),
      allocation("C", MON, "11:00"),
    ];
    expect([
      ...selectStartedAllocationIds(
        view({ allocations, sessionsStatus: "unavailable" }),
      ),
    ]).toEqual(["A", "C"]);
  });
});
