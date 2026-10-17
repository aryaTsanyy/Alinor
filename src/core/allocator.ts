import {
  buildAllocatableGaps,
  createGapCursor,
  minutesOfDay,
  roundUpToStep,
} from "./allocatable";
import { toDateString } from "./dates";
import { deriveTaskQuadrant } from "./quadrant";
import type {
  Quadrant,
  Slot,
  Task,
  TaskAllocation,
  UserSettings,
} from "./types";

export interface AllocationInput {
  date: string; // harus hari ini (auto-fill hanya untuk hari ini)
  slots: readonly Slot[];
  tasks: readonly Task[];
  existingAllocations: readonly TaskAllocation[];
  settings: UserSettings;
}

export interface Q1OverflowWarning {
  type: "Q1_OVERFLOW";
  taskIds: string[];
  shortfallPomodoros: number;
}

export type AllocationWarning = Q1OverflowWarning;

export interface AllocationResult {
  allocations: TaskAllocation[]; // hanya alokasi baru
  warnings: AllocationWarning[];
}

interface Candidate {
  task: Task;
  remaining: number;
}

function assertBudgets(settings: UserSettings): void {
  const budgets: Array<[string, number]> = [
    ["maxDailyPomodoros", settings.maxDailyPomodoros],
    ["maxQ1PomodorosPerDay", settings.maxQ1PomodorosPerDay],
    ["q2ReservedPomodoros", settings.q2ReservedPomodoros],
  ];
  for (const [name, value] of budgets) {
    if (!Number.isInteger(value) || value < 0) {
      throw new RangeError(`${name} must be a non-negative integer`);
    }
  }
}

function assertPomodoroCounts(task: Task): void {
  const ok = (n: number) => Number.isInteger(n) && n >= 0;
  if (!ok(task.estimatedPomodoros) || !ok(task.completedPomodoros)) {
    throw new RangeError(
      `Task "${task.id}": pomodoro counts must be non-negative integers`,
    );
  }
}

/** Deadline terdekat dulu (tanpa deadline terakhir), lalu createdAt terlama, lalu id. */
function compareCandidates(a: Candidate, b: Candidate): number {
  const da = a.task.deadline;
  const db = b.task.deadline;
  if (da !== db) {
    if (da === undefined) return 1;
    if (db === undefined) return -1;
    return da < db ? -1 : 1;
  }
  if (a.task.createdAt !== b.task.createdAt) {
    return a.task.createdAt < b.task.createdAt ? -1 : 1;
  }
  if (a.task.id === b.task.id) return 0;
  return a.task.id < b.task.id ? -1 : 1;
}

const sumRemaining = (list: readonly Candidate[]) =>
  list.reduce((sum, c) => sum + c.remaining, 0);

export function generateAutoAllocations(
  input: AllocationInput,
  now: Date,
): AllocationResult {
  const { date, slots, tasks, existingAllocations, settings } = input;

  const today = toDateString(now);
  if (date !== today) {
    throw new RangeError(
      `Auto-fill only supports today (${today}), got "${date}"`,
    );
  }
  assertBudgets(settings);

  // 1. Pemakaian hari ini dari alokasi yang sudah ada (keputusan B).
  const taskById = new Map(tasks.map((t) => [t.id, t] as const));
  const usedByQuadrant: Record<Quadrant, number> = {
    Q1: 0,
    Q2: 0,
    Q3: 0,
    Q4: 0,
  };
  const plannedByTask = new Map<string, number>();
  let totalUsed = 0;

  for (const a of existingAllocations) {
    if (a.status === "EXPIRED") continue;
    if (a.date !== date) {
      throw new RangeError(
        `Allocation "${a.id}" is on ${a.date}, expected ${date} (run rollover first)`,
      );
    }
    const task = taskById.get(a.taskId);
    if (!task) {
      throw new RangeError(
        `Allocation "${a.id}" references unknown task "${a.taskId}"`,
      );
    }
    totalUsed += a.pomodoroCount;
    usedByQuadrant[deriveTaskQuadrant(task, now, settings)] += a.pomodoroCount;
    if (a.status === "PLANNED") {
      plannedByTask.set(
        a.taskId,
        (plannedByTask.get(a.taskId) ?? 0) + a.pomodoroCount,
      );
    }
  }

  // 2. Kandidat per kuadran. Tugas DONE dan yang tidak bersisa dilewati.
  const byQuadrant: Record<Quadrant, Candidate[]> = {
    Q1: [],
    Q2: [],
    Q3: [],
    Q4: [],
  };
  for (const task of tasks) {
    if (task.status === "DONE") continue;
    assertPomodoroCounts(task);
    const remaining =
      task.estimatedPomodoros -
      task.completedPomodoros -
      (plannedByTask.get(task.id) ?? 0);
    if (remaining <= 0) continue;
    byQuadrant[deriveTaskQuadrant(task, now, settings)].push({
      task,
      remaining,
    });
  }
  for (const list of Object.values(byQuadrant)) list.sort(compareCandidates);

  // 3. Ruang yang tersedia: celah dipotong mulai `now` (keputusan C) dan dibatasi batas harian.
  const gaps = buildAllocatableGaps({
    slots,
    existing: existingAllocations,
    notBefore: roundUpToStep(minutesOfDay(now)),
    timing: settings,
  });
  const cursor = createGapCursor(gaps, settings);
  let roomLeft = Math.min(
    Math.max(0, settings.maxDailyPomodoros - totalUsed),
    cursor.remainingCapacity(),
  );

  // 4. Anggaran Q1 (keputusan A: batas keras) yang menyisakan kuota Q2 yang dilindungi.
  const reserveProtected = Math.min(
    Math.max(0, settings.q2ReservedPomodoros - usedByQuadrant.Q2),
    sumRemaining(byQuadrant.Q2),
  );
  const q1CapRemaining = Math.max(
    0,
    settings.maxQ1PomodorosPerDay - usedByQuadrant.Q1,
  );
  const q1Budget = Math.min(
    q1CapRemaining,
    Math.max(0, roomLeft - reserveProtected),
  );

  const created: TaskAllocation[] = [];
  const fill = (list: Candidate[], budget: number): number => {
    let budgetLeft = budget;
    for (const c of list) {
      if (budgetLeft === 0) break;
      for (const p of cursor.take(Math.min(c.remaining, budgetLeft))) {
        created.push({
          id: `alloc:${date}:${p.startTime}:${c.task.id}`,
          taskId: c.task.id,
          date,
          startTime: p.startTime,
          pomodoroCount: p.pomodoroCount,
          status: "PLANNED",
        });
        c.remaining -= p.pomodoroCount;
        budgetLeft -= p.pomodoroCount;
      }
    }
    return budget - budgetLeft;
  };

  roomLeft -= fill(byQuadrant.Q1, q1Budget);
  roomLeft -= fill(byQuadrant.Q2, roomLeft);
  if (settings.autoScheduleQ3) fill(byQuadrant.Q3, roomLeft);
  // Q4 tidak pernah dijadwalkan otomatis.

  created.sort((a, b) => {
    if (a.startTime !== b.startTime) return a.startTime < b.startTime ? -1 : 1;
    if (a.taskId === b.taskId) return 0;
    return a.taskId < b.taskId ? -1 : 1;
  });

  const overflowed = byQuadrant.Q1.filter((c) => c.remaining > 0);
  const warnings: AllocationWarning[] =
    overflowed.length === 0
      ? []
      : [
          {
            type: "Q1_OVERFLOW",
            taskIds: overflowed.map((c) => c.task.id),
            shortfallPomodoros: sumRemaining(overflowed),
          },
        ];

  return { allocations: created, warnings };
}
