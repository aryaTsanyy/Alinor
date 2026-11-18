import type { PomodoroSession, Task, TaskAllocation } from "./types";

export interface ReconcileInput {
  tasks: readonly Task[];
  allocations: readonly TaskAllocation[];
  sessions: readonly PomodoroSession[];
}

export type ReconcileChange =
  | { kind: "task"; taskId: string; from: number; to: number }
  | { kind: "allocation"; allocationId: string };

export interface ReconcileResult {
  tasks: Task[];
  allocations: TaskAllocation[];
  changes: ReconcileChange[];
}

/**
 * Menyelaraskan data perencanaan dengan log sesi setelah penulisan yang terputus.
 * Hanya menaikkan penghitung dan status; item yang tidak berubah dikembalikan sebagai objek yang sama.
 */
export function reconcile({
  tasks,
  allocations,
  sessions,
}: ReconcileInput): ReconcileResult {
  const completedByTask = new Map<string, number>();
  const completedByAllocation = new Map<string, number>();
  for (const session of sessions) {
    if (!session.completed) continue;
    completedByTask.set(
      session.taskId,
      (completedByTask.get(session.taskId) ?? 0) + 1,
    );
    if (session.allocationId !== undefined) {
      completedByAllocation.set(
        session.allocationId,
        (completedByAllocation.get(session.allocationId) ?? 0) + 1,
      );
    }
  }

  const changes: ReconcileChange[] = [];

  const nextTasks = tasks.map((task): Task => {
    const fromSessions = completedByTask.get(task.id) ?? 0;
    if (fromSessions <= task.completedPomodoros) return task;
    changes.push({
      kind: "task",
      taskId: task.id,
      from: task.completedPomodoros,
      to: fromSessions,
    });
    return {
      ...task,
      completedPomodoros: fromSessions,
      status: task.status === "TODO" ? "IN_PROGRESS" : task.status,
    };
  });

  const nextAllocations = allocations.map((allocation): TaskAllocation => {
    if (allocation.status !== "PLANNED" || allocation.pomodoroCount <= 0)
      return allocation;
    if (
      (completedByAllocation.get(allocation.id) ?? 0) < allocation.pomodoroCount
    ) {
      return allocation;
    }
    changes.push({ kind: "allocation", allocationId: allocation.id });
    return { ...allocation, status: "COMPLETED" };
  });

  return { tasks: nextTasks, allocations: nextAllocations, changes };
}
