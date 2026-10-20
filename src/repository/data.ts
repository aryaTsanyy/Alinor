import type {
  FixedScheduleRule,
  ScheduleException,
  Task,
  TaskAllocation,
  UserSettings,
} from "../core";

export interface PlanningData {
  settings: UserSettings;
  rules: FixedScheduleRule[];
  exceptions: ScheduleException[];
  tasks: Task[];
  allocations: TaskAllocation[];
}

export const DEFAULT_SETTINGS: UserSettings = {
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

export const emptyPlanningData = (): PlanningData => ({
  settings: { ...DEFAULT_SETTINGS },
  rules: [],
  exceptions: [],
  tasks: [],
  allocations: [],
});
