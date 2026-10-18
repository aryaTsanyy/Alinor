import {
  buildAllocatableGaps,
  minutesOfDay,
  roundUpToStep,
} from "./allocatable";
import { assertPomodoroCounts } from "./allocator";
import { addDays, daysBetween, toDateString } from "./dates";
import type { FeasibilityWarning, Slot, Task, UserSettings } from "./types";

/** Deadline lebih jauh dari ini dipotong; kapasitas setahun hampir selalu cukup. */
export const MAX_HORIZON_DAYS = 366;

export interface FeasibilityInput {
  tasks: readonly Task[];
  slotsFor: (date: string) => readonly Slot[];
  settings: UserSettings;
}

interface Deadlined {
  task: Task;
  deadline: string;
  remaining: number;
}

function compare(a: Deadlined, b: Deadlined): number {
  if (a.deadline !== b.deadline) return a.deadline < b.deadline ? -1 : 1;
  if (a.task.createdAt !== b.task.createdAt) {
    return a.task.createdAt < b.task.createdAt ? -1 : 1;
  }
  if (a.task.id === b.task.id) return 0;
  return a.task.id < b.task.id ? -1 : 1;
}

/**
 * Tugas ber-deadline yang tidak muat dalam waktu kosong sampai deadline-nya.
 * Kapasitas dibagi antar tugas dengan urutan deadline terdekat dulu.
 */
export function computeFeasibility(
  input: FeasibilityInput,
  now: Date,
): FeasibilityWarning[] {
  const { tasks, slotsFor, settings } = input;
  const today = toDateString(now);
  if (
    !Number.isInteger(settings.maxDailyPomodoros) ||
    settings.maxDailyPomodoros < 0
  ) {
    throw new RangeError("maxDailyPomodoros must be a non-negative integer");
  }

  const candidates: Deadlined[] = [];
  for (const task of tasks) {
    if (task.status === "DONE" || task.deadline === undefined) continue;
    assertPomodoroCounts(task);
    const remaining = task.estimatedPomodoros - task.completedPomodoros;
    if (remaining <= 0) continue;
    candidates.push({ task, deadline: task.deadline, remaining });
  }
  if (candidates.length === 0) return [];
  candidates.sort(compare);

  const offsets = candidates.map((c) => daysBetween(today, c.deadline));
  const lastOffset = Math.min(
    offsets.reduce((max, o) => Math.max(max, o), -1),
    MAX_HORIZON_DAYS,
  );

  // cumulative[k] = total kapasitas pomodoro dari hari ini sampai hari ke-k (inklusif).
  const todayStart = roundUpToStep(minutesOfDay(now));
  const cumulative: number[] = [];
  let running = 0;
  for (let k = 0; k <= lastOffset; k++) {
    const gaps = buildAllocatableGaps({
      slots: slotsFor(addDays(today, k)),
      existing: [],
      notBefore: k === 0 ? todayStart : 0,
      timing: settings,
    });
    const physical = gaps.reduce((sum, g) => sum + g.capacity, 0);
    running += Math.min(physical, settings.maxDailyPomodoros);
    cumulative.push(running);
  }

  const warnings: FeasibilityWarning[] = [];
  let allocatedSoFar = 0;
  candidates.forEach((c, i) => {
    const offset = offsets[i];
    const capacityUntilDeadline =
      offset < 0 ? 0 : cumulative[Math.min(offset, lastOffset)];
    const available = Math.max(0, capacityUntilDeadline - allocatedSoFar);
    const allocated = Math.min(c.remaining, available);
    allocatedSoFar += allocated;
    if (allocated < c.remaining) {
      warnings.push({
        taskId: c.task.id,
        shortfallPomodoros: c.remaining - allocated,
      });
    }
  });
  return warnings;
}
