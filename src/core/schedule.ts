import { dayOfWeek, isValidDate } from "./dates";
import type { Interval } from "./intervals";
import { parseTime } from "./time";
import type {
  FixedScheduleRule,
  ScheduleException,
  UserSettings,
} from "./types";

export interface Occurrence {
  ruleId: string;
  start: number; // menit sejak 00:00, inklusif
  end: number; // eksklusif
  customPreBufferMin?: number;
  customPostBufferMin?: number;
}

function assertValidRule(rule: FixedScheduleRule): {
  start: number;
  end: number;
} {
  const start = parseTime(rule.startTime);
  const end = parseTime(rule.endTime);
  if (end <= start) {
    throw new RangeError(
      `Rule "${rule.id}": endTime must be after startTime (events crossing midnight are not supported)`,
    );
  }
  if (rule.isRecurring) {
    if (!rule.daysOfWeek || rule.daysOfWeek.length === 0) {
      throw new RangeError(
        `Rule "${rule.id}": recurring rule needs at least one day in daysOfWeek`,
      );
    }
    for (const bound of [rule.validFrom, rule.validUntil]) {
      if (bound !== undefined && !isValidDate(bound)) {
        throw new RangeError(
          `Rule "${rule.id}": invalid validFrom/validUntil "${bound}"`,
        );
      }
    }
    if (
      rule.validFrom !== undefined &&
      rule.validUntil !== undefined &&
      rule.validFrom > rule.validUntil
    ) {
      throw new RangeError(`Rule "${rule.id}": validFrom is after validUntil`);
    }
  } else if (
    rule.specificDate === undefined ||
    !isValidDate(rule.specificDate)
  ) {
    throw new RangeError(
      `Rule "${rule.id}": non-recurring rule needs a valid specificDate`,
    );
  }
  return { start, end };
}

function occursOn(rule: FixedScheduleRule, date: string): boolean {
  if (!rule.isRecurring) return rule.specificDate === date;
  if (!(rule.daysOfWeek ?? []).includes(dayOfWeek(date))) return false;
  // Perbandingan string aman: semua tanggal sudah tervalidasi berformat YYYY-MM-DD.
  if (rule.validFrom !== undefined && date < rule.validFrom) return false;
  if (rule.validUntil !== undefined && date > rule.validUntil) return false;
  return true;
}

/** Aturan -> kejadian nyata pada `date`, setelah exception CANCELLED diterapkan. */
export function expandRulesForDate(
  date: string,
  rules: readonly FixedScheduleRule[],
  exceptions: readonly ScheduleException[],
): Occurrence[] {
  if (!isValidDate(date)) {
    throw new RangeError(
      `Invalid date "${date}", expected a real YYYY-MM-DD date`,
    );
  }
  const result: Occurrence[] = [];
  for (const rule of rules) {
    const { start, end } = assertValidRule(rule);
    if (!occursOn(rule, date)) continue;

    const matching = exceptions.filter(
      (e) => e.ruleId === rule.id && e.originalDate === date,
    );
    if (matching.some((e) => e.type === "MODIFIED")) {
      throw new Error("ScheduleException type MODIFIED is not supported yet");
    }
    if (matching.some((e) => e.type === "CANCELLED")) continue;

    result.push({
      ruleId: rule.id,
      start,
      end,
      customPreBufferMin: rule.customPreBufferMin,
      customPostBufferMin: rule.customPostBufferMin,
    });
  }
  return result.sort(
    (a, b) =>
      a.start - b.start ||
      a.end - b.end ||
      (a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0),
  );
}

function assertBuffer(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer`);
  }
}

/** Perluas tiap kejadian dengan buffer sebelum/sesudah. Hasil belum digabung dan belum dipotong. */
export function applyBuffers(
  occurrences: readonly Occurrence[],
  defaults: Pick<UserSettings, "preEventBufferMin" | "postEventBufferMin">,
): Interval[] {
  return occurrences.map((o) => {
    const pre = o.customPreBufferMin ?? defaults.preEventBufferMin;
    const post = o.customPostBufferMin ?? defaults.postEventBufferMin;
    assertBuffer("pre-event buffer", pre);
    assertBuffer("post-event buffer", post);
    return { start: o.start - pre, end: o.end + post };
  });
}
