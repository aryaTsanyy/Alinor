import { minutesOfDay } from "./allocatable";
import { pomodoroBlockMinutes } from "./capacity";
import { isValidDate, toDateString } from "./dates";
import { mergeIntervals, type Interval } from "./intervals";
import { applyBuffers, expandRulesForDate } from "./schedule";
import { parseTime } from "./time";
import type {
  CollisionSummary,
  FixedScheduleRule,
  ScheduleException,
  TaskAllocation,
  UserSettings,
} from "./types";

export interface CollisionInput {
  allocations: readonly TaskAllocation[];
  rules: readonly FixedScheduleRule[];
  exceptions: readonly ScheduleException[];
  settings: UserSettings;
  startedAllocationIds: ReadonlySet<string>;
}

export function resolveCollisions(
  input: CollisionInput,
  now: Date,
): CollisionSummary {
  const { allocations, rules, exceptions, settings, startedAllocationIds } =
    input;
  const today = toDateString(now);
  const nowMinutes = minutesOfDay(now);

  const occupiedCache = new Map<string, Interval[]>();
  const occupiedOn = (date: string): Interval[] => {
    let occupied = occupiedCache.get(date);
    if (!occupied) {
      occupied = mergeIntervals(
        applyBuffers(expandRulesForDate(date, rules, exceptions), settings),
      );
      occupiedCache.set(date, occupied);
    }
    return occupied;
  };

  const removed: TaskAllocation[] = [];
  const flagged: TaskAllocation[] = [];

  for (const a of allocations) {
    if (a.status !== "PLANNED" || a.pomodoroCount === 0) continue;
    if (!isValidDate(a.date)) {
      throw new RangeError(
        `Allocation "${a.id}" has an invalid date "${a.date}"`,
      );
    }
    // Perbandingan string aman: kedua tanggal sudah tervalidasi berformat YYYY-MM-DD.
    if (a.date < today) continue;

    const start = parseTime(a.startTime);
    const end = start + pomodoroBlockMinutes(a.pomodoroCount, settings);
    if (a.date === today && end <= nowMinutes) continue;

    const collides = occupiedOn(a.date).some(
      (o) => start < o.end && o.start < end,
    );
    if (!collides) continue;

    if (startedAllocationIds.has(a.id)) flagged.push(a);
    else removed.push(a);
  }

  return { removed, flagged };
}
