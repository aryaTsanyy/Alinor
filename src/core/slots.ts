import { capacityOf } from "./capacity";
import { subtractIntervals } from "./intervals";
import { applyBuffers, expandRulesForDate } from "./schedule";
import { formatTime, parseTime } from "./time";
import type {
  FixedScheduleRule,
  ScheduleException,
  Slot,
  UserSettings,
} from "./types";

export function calculateFreeSlots(
  date: string,
  rules: readonly FixedScheduleRule[],
  exceptions: readonly ScheduleException[],
  settings: UserSettings,
): Slot[] {
  const dayStart = parseTime(settings.dayStartTime);
  const dayEnd = parseTime(settings.dayEndTime);
  if (dayEnd <= dayStart) {
    throw new RangeError("dayEndTime must be after dayStartTime");
  }

  const occurrences = expandRulesForDate(date, rules, exceptions); // juga memvalidasi tanggal dan aturan
  const occupied = applyBuffers(occurrences, settings);
  const gaps = subtractIntervals({ start: dayStart, end: dayEnd }, occupied);

  const slots: Slot[] = [];
  for (const gap of gaps) {
    const capacity = capacityOf(gap.end - gap.start, settings);
    if (capacity > 0) {
      slots.push({
        date,
        startTime: formatTime(gap.start),
        endTime: formatTime(gap.end),
        capacity,
      });
    }
  }
  return slots;
}
