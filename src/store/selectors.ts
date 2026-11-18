import {
  calculateFreeSlots,
  computeFeasibility,
  deriveTaskQuadrant,
  expandRulesForDate,
  getStartedAllocationIds,
  toDateString,
} from "../core";
import type {
  FeasibilityWarning,
  Occurrence,
  Quadrant,
  Slot,
  Task,
  TaskAllocation,
} from "../core";
import type { AlinorState } from "./types";

type SchedulingView = Pick<AlinorState, "settings" | "rules" | "exceptions">;

/** Tugas yang belum selesai, dikelompokkan menurut kuadran turunan. */
export function selectTasksByQuadrant(
  state: Pick<AlinorState, "tasks" | "settings">,
  now: Date,
): Record<Quadrant, Task[]> {
  const grouped: Record<Quadrant, Task[]> = { Q1: [], Q2: [], Q3: [], Q4: [] };
  for (const task of state.tasks) {
    if (task.status === "DONE") continue;
    grouped[deriveTaskQuadrant(task, now, state.settings)].push(task);
  }
  return grouped;
}

export function selectFreeSlots(state: SchedulingView, date: string): Slot[] {
  return calculateFreeSlots(
    date,
    state.rules,
    state.exceptions,
    state.settings,
  );
}

export function selectOccurrences(
  state: SchedulingView,
  date: string,
): Occurrence[] {
  return expandRulesForDate(date, state.rules, state.exceptions);
}

/** Memanggil calculateFreeSlots untuk tiap hari sampai deadline terjauh; memoize di lapisan UI. */
export function selectFeasibility(
  state: Pick<AlinorState, "tasks" | "settings" | "rules" | "exceptions">,
  now: Date,
): FeasibilityWarning[] {
  return computeFeasibility(
    {
      tasks: state.tasks,
      slotsFor: (date) =>
        calculateFreeSlots(date, state.rules, state.exceptions, state.settings),
      settings: state.settings,
    },
    now,
  );
}

export function selectTodayAllocations(
  state: Pick<AlinorState, "allocations">,
  now: Date,
): TaskAllocation[] {
  const today = toDateString(now);
  return state.allocations
    .filter((a) => a.date === today && a.status !== "EXPIRED")
    .sort((a, b) =>
      a.startTime === b.startTime
        ? a.id.localeCompare(b.id)
        : a.startTime < b.startTime
          ? -1
          : 1,
    );
}

export function selectStartedAllocationIds(
  state: Pick<AlinorState, "allocations" | "sessions" | "sessionsStatus">,
): ReadonlySet<string> {
  if (state.sessionsStatus === "ok")
    return getStartedAllocationIds(state.sessions);
  return new Set(
    state.allocations.filter((a) => a.status === "PLANNED").map((a) => a.id),
  );
}
