export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type Quadrant = "Q1" | "Q2" | "Q3" | "Q4";
export type UrgencyOverride = "AUTO" | "URGENT" | "NOT_URGENT";

export interface UserSettings {
  dayStartTime: string; // "HH:mm"
  dayEndTime: string;
  pomodoroDurationMin: number;
  shortBreakMin: number;
  longBreakMin: number;
  pomodorosBeforeLongBreak: number;
  preEventBufferMin: number;
  postEventBufferMin: number;
  maxDailyPomodoros: number;
  maxQ1PomodorosPerDay: number;
  q2ReservedPomodoros: number;
  autoScheduleQ3: boolean;
  urgencyThresholdDays: number;
}

export interface FixedScheduleRule {
  id: string;
  title: string;
  category: "academic" | "work" | "personal";
  startTime: string; // harus < endTime
  endTime: string;
  customPreBufferMin?: number;
  customPostBufferMin?: number;
  isRecurring: boolean;
  specificDate?: string; // "YYYY-MM-DD" bila !isRecurring
  daysOfWeek?: DayOfWeek[]; // bila isRecurring
  validFrom?: string;
  validUntil?: string;
}

export interface ScheduleException {
  id: string;
  ruleId: string;
  originalDate: string;
  type: "CANCELLED" | "MODIFIED"; // MODIFIED dicadangkan, belum diimplementasikan di MVP
  newDate?: string;
  newStartTime?: string;
  newEndTime?: string;
}

export interface Task {
  id: string;
  title: string;
  isImportant: boolean;
  urgencyOverride: UrgencyOverride;
  deadline?: string; // "YYYY-MM-DD"
  estimatedPomodoros: number;
  completedPomodoros: number;
  status: "TODO" | "IN_PROGRESS" | "DONE";
  createdAt: string;
  completedAt?: string;
}

export interface TaskAllocation {
  id: string;
  taskId: string;
  date: string;
  startTime: string;
  pomodoroCount: number;
  status: "PLANNED" | "COMPLETED" | "EXPIRED";
}

export interface PomodoroSession {
  id: string;
  taskId: string;
  startedAt: string; // ISO datetime
  endedAt: string;
  completed: boolean;
  quadrantAtTime: Quadrant;
  allocationId?: string; // alokasi tempat sesi ini dijalankan, bila ada
}

export interface Slot {
  date: string;
  startTime: string;
  endTime: string;
  capacity: number;
}
export interface FeasibilityWarning {
  taskId: string;
  shortfallPomodoros: number;
}
export interface CollisionSummary {
  removed: TaskAllocation[];
  flagged: TaskAllocation[];
}
