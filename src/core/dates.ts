import type { DayOfWeek } from "./types";

const DATE_PATTERN = /^([12]\d{3})-(\d{2})-(\d{2})$/;

interface DateParts {
  year: number;
  month: number; // 1-12
  day: number;
}

function parseDate(value: string): DateParts | null {
  const match = DATE_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // Round-trip lewat UTC menolak tanggal yang tidak nyata (30 Feb, 31 Apr, dst.)
  const probe = new Date(Date.UTC(year, month - 1, day));
  const real =
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day;
  return real ? { year, month, day } : null;
}

export function isValidDate(value: string): boolean {
  return parseDate(value) !== null;
}

/** 0 = Minggu ... 6 = Sabtu. */
export function dayOfWeek(value: string): DayOfWeek {
  const parts = parseDate(value);
  if (!parts) {
    throw new RangeError(
      `Invalid date "${value}", expected a real YYYY-MM-DD date`,
    );
  }
  return new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day),
  ).getUTCDay() as DayOfWeek;
}
