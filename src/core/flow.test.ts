import { describe, test, expect } from "vitest";
import { calculateFreeSlots } from "./slots";
import { generateAutoAllocations } from "./allocator";
import { computeFeasibility } from "./feasibility";
import { resolveCollisions } from "./collisions";
import { rolloverAllocations } from "./rollover";
import { getStartedAllocationIds } from "./sessions";
import type {
  FixedScheduleRule,
  PomodoroSession,
  Task,
  TaskAllocation,
  UserSettings,
} from "./types";

/**
 * Skenario: mahasiswa yang juga bekerja.
 *  - Kelas Senin dan Rabu 09:00-10:40.
 *  - Senin: rapat 14:00-15:00 dan gym 17:00-18:30 (butuh 30 menit setelahnya).
 *  - Lima tugas di empat kuadran; "ujian" jelas terlalu besar untuk tiga hari.
 */
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
const WED = "2026-10-21";

const MON_MORNING = new Date(2026, 9, 19, 7, 0);
const MON_NOON = new Date(2026, 9, 19, 12, 30);
const TUE_MORNING = new Date(2026, 9, 20, 8, 0);

const fixed: FixedScheduleRule[] = [
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
    specificDate: MON,
  },
  {
    id: "gym",
    title: "Gym",
    category: "personal",
    startTime: "17:00",
    endTime: "18:30",
    isRecurring: false,
    specificDate: MON,
    customPostBufferMin: 30,
  },
];

const task = (id: string, override: Partial<Task> = {}): Task => ({
  id,
  title: id,
  isImportant: true,
  urgencyOverride: "AUTO",
  estimatedPomodoros: 1,
  completedPomodoros: 0,
  status: "TODO",
  createdAt: "2026-10-01T00:00:00Z",
  ...override,
});

const tasksMonday: Task[] = [
  task("laporan", { deadline: MON, estimatedPomodoros: 3 }), // Q1
  task("ujian", { deadline: WED, estimatedPomodoros: 22 }), // Q1 (2 hari lagi = urgent)
  task("proposal", { estimatedPomodoros: 6 }), // Q2
  task("balas-email", {
    isImportant: false,
    deadline: MON,
    estimatedPomodoros: 1,
  }), // Q3
  task("medsos", { isImportant: false, estimatedPomodoros: 2 }), // Q4
];

const planned = (
  date: string,
  taskId: string,
  startTime: string,
  pomodoroCount: number,
): TaskAllocation => ({
  id: `alloc:${date}:${startTime}:${taskId}`,
  taskId,
  date,
  startTime,
  pomodoroCount,
  status: "PLANNED",
});

const MONDAY_PLAN: TaskAllocation[] = [
  planned(MON, "laporan", "08:00", 2),
  planned(MON, "laporan", "10:55", 1),
  planned(MON, "ujian", "11:25", 2),
  planned(MON, "proposal", "12:25", 3),
];

const slotsFor = (date: string) =>
  calculateFreeSlots(date, fixed, [], settings);

describe("a busy Monday, end to end", () => {
  test("step 1: fixed events leave four gaps, and auto-fill contains Q1 while protecting Q2", () => {
    // 08:00-09:00 muat 2, 10:55-14:00 muat 6, 15:15-17:00 muat 3, 19:00-22:00 muat 5.
    // Kapasitas fisik 16, tetapi batas harian 8.
    expect(slotsFor(MON)).toEqual([
      { date: MON, startTime: "08:00", endTime: "09:00", capacity: 2 },
      { date: MON, startTime: "10:55", endTime: "14:00", capacity: 6 },
      { date: MON, startTime: "15:15", endTime: "17:00", capacity: 3 },
      { date: MON, startTime: "19:00", endTime: "22:00", capacity: 5 },
    ]);

    const result = generateAutoAllocations(
      {
        date: MON,
        slots: slotsFor(MON),
        tasks: tasksMonday,
        existingAllocations: [],
        settings,
      },
      MON_MORNING,
    );

    // Q1 dibatasi 5: laporan 3 + ujian 2. Kuota Q2 terlindungi, jadi proposal dapat 3.
    // Q3 dan Q4 tidak dijadwalkan. 20 pomodoro ujian tidak muat, dan itu dinyatakan.
    expect(result).toEqual({
      allocations: MONDAY_PLAN,
      warnings: [
        { type: "Q1_OVERFLOW", taskIds: ["ujian"], shortfallPomodoros: 20 },
      ],
    });
  });

  test("step 2: feasibility shows that ujian cannot fit before Wednesday even with all three days", () => {
    // Kapasitas kumulatif (batas harian 8 per hari): Senin 8, Selasa 16, Rabu 24.
    // Sebelum ujian, balas-email (1) dan laporan (3) memakai 4 -> tersisa 20 untuk ujian (22).
    expect(
      computeFeasibility(
        { tasks: tasksMonday, slotsFor, settings },
        MON_MORNING,
      ),
    ).toEqual([{ taskId: "ujian", shortfallPomodoros: 2 }]);
  });

  test("step 3a: auto-fill never produces an allocation that collides with the fixed schedule", () => {
    expect(
      resolveCollisions(
        {
          allocations: MONDAY_PLAN,
          rules: fixed,
          exceptions: [],
          settings,
          startedAllocationIds: new Set<string>(),
        },
        MON_MORNING,
      ),
    ).toEqual({ removed: [], flagged: [] });
  });

  describe("step 3b: at 12:30 a new meeting appears at 13:00-14:00", () => {
    const newMeeting: FixedScheduleRule = {
      id: "dosen-wali",
      title: "Dosen wali",
      category: "academic",
      startTime: "13:00",
      endTime: "14:00",
      isRecurring: false,
      specificDate: MON,
    };
    const proposalBlock = MONDAY_PLAN[3]; // 12:25-13:50, sudah berjalan

    const resolve = (sessions: PomodoroSession[]) =>
      resolveCollisions(
        {
          allocations: MONDAY_PLAN,
          rules: [...fixed, newMeeting],
          exceptions: [],
          settings,
          startedAllocationIds: getStartedAllocationIds(sessions),
        },
        MON_NOON,
      );

    test("a block that has already started is flagged, never silently removed", () => {
      const session: PomodoroSession = {
        id: "s1",
        taskId: "proposal",
        startedAt: "2026-10-19T12:25:00",
        endedAt: "2026-10-19T12:30:00",
        completed: false,
        quadrantAtTime: "Q2",
        allocationId: proposalBlock.id,
      };
      // Blok pagi sudah lewat dan tidak dihitung; hanya proposal yang bentrok.
      expect(resolve([session])).toEqual({
        removed: [],
        flagged: [proposalBlock],
      });
    });

    test("the same block is removed (and its pomodoros return to the pool) when it has not started", () => {
      expect(resolve([])).toEqual({ removed: [proposalBlock], flagged: [] });
    });
  });

  test("step 4: next morning, expired blocks roll over and the unfinished work is planned again", () => {
    // Kemarin: laporan selesai, ujian 2 pomodoro, proposal 2 dari 3.
    const tasksTuesday = tasksMonday.map((t): Task => {
      if (t.id === "laporan")
        return { ...t, status: "DONE", completedPomodoros: 3 };
      if (t.id === "ujian") return { ...t, completedPomodoros: 2 };
      if (t.id === "proposal") return { ...t, completedPomodoros: 2 };
      return t;
    });

    const rolled = rolloverAllocations(MONDAY_PLAN, TUE_MORNING);
    expect(rolled).toHaveLength(4);
    expect(rolled.every((a) => a.status === "EXPIRED")).toBe(true);

    // Selasa tidak ada acara tetap: satu celah penuh 08:00-22:00.
    expect(slotsFor(TUE)).toEqual([
      { date: TUE, startTime: "08:00", endTime: "22:00", capacity: 26 },
    ]);

    // Ujian bersisa 20 (Q1, dibatasi 5). Proposal bersisa 4 (Q2), kuota terlindungi -> 3.
    // Balas-email sudah lewat deadline tetapi Q3, jadi tidak dijadwalkan otomatis.
    expect(
      generateAutoAllocations(
        {
          date: TUE,
          slots: slotsFor(TUE),
          tasks: tasksTuesday,
          existingAllocations: rolled,
          settings,
        },
        TUE_MORNING,
      ),
    ).toEqual({
      allocations: [
        planned(TUE, "ujian", "08:00", 5),
        planned(TUE, "proposal", "10:40", 3),
      ],
      warnings: [
        { type: "Q1_OVERFLOW", taskIds: ["ujian"], shortfallPomodoros: 15 },
      ],
    });
  });
});
