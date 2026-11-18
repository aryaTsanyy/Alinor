import type { PomodoroSession } from "../core";
import { DEFAULT_SETTINGS, type PlanningData } from "./data";

export const samplePlanning = (): PlanningData => ({
  settings: { ...DEFAULT_SETTINGS },
  rules: [
    {
      id: "kelas",
      title: "Kelas",
      category: "academic",
      startTime: "09:00",
      endTime: "10:40",
      isRecurring: true,
      daysOfWeek: [1, 3],
    },
    {
      id: "rapat",
      title: "Rapat",
      category: "work",
      startTime: "14:00",
      endTime: "15:00",
      isRecurring: false,
      specificDate: "2026-10-19",
      customPostBufferMin: 0,
    },
  ],
  exceptions: [
    {
      id: "x1",
      ruleId: "kelas",
      originalDate: "2026-10-26",
      type: "CANCELLED",
    },
  ],
  tasks: [
    {
      id: "laporan",
      title: "Laporan",
      isImportant: true,
      urgencyOverride: "AUTO",
      deadline: "2026-10-19",
      estimatedPomodoros: 3,
      completedPomodoros: 1,
      status: "IN_PROGRESS",
      createdAt: "2026-10-01T00:00:00Z",
    },
  ],
  allocations: [
    {
      id: "alloc:2026-10-19:08:00:laporan",
      taskId: "laporan",
      date: "2026-10-19",
      startTime: "08:00",
      pomodoroCount: 2,
      status: "PLANNED",
    },
  ],
});

export const sampleSession = (id = "s1"): PomodoroSession => ({
  id,
  taskId: "laporan",
  startedAt: "2026-10-19T09:00:00",
  endedAt: "2026-10-19T09:25:00",
  completed: true,
  quadrantAtTime: "Q1",
  allocationId: "alloc:2026-10-19:08:00:laporan",
});
