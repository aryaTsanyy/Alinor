// Public API of the planning engine. Everything not listed here is an internal detail.
export { parseTime, formatTime } from "./time";
export {
  isValidDate,
  dayOfWeek,
  daysBetween,
  toDateString,
  addDays,
} from "./dates";
export { capacityOf, pomodoroBlockMinutes } from "./capacity";
export type { PomodoroTiming } from "./capacity";
export { expandRulesForDate } from "./schedule";
export type { Occurrence } from "./schedule";
export { calculateFreeSlots } from "./slots";
export { deriveTaskQuadrant, isUrgent } from "./quadrant";
export { generateAutoAllocations } from "./allocator";
export type {
  AllocationInput,
  AllocationResult,
  AllocationWarning,
  Q1OverflowWarning,
} from "./allocator";
export { computeFeasibility } from "./feasibility";
export type { FeasibilityInput } from "./feasibility";
export { resolveCollisions } from "./collisions";
export type { CollisionInput } from "./collisions";
export { rolloverAllocations } from "./rollover";
export { getStartedAllocationIds } from "./sessions";
export type {
  DayOfWeek,
  Quadrant,
  UrgencyOverride,
  UserSettings,
  FixedScheduleRule,
  ScheduleException,
  Task,
  TaskAllocation,
  PomodoroSession,
  Slot,
  FeasibilityWarning,
  CollisionSummary,
} from "./types";
