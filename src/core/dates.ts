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

const MS_PER_DAY = 86_400_000;

/** Tanggal kalender lokal perangkat dari `now`, format YYYY-MM-DD. */
export function toDateString(now: Date): string {
  if (Number.isNaN(now.getTime())) {
    throw new RangeError("Invalid Date");
  }
  const result = [
    String(now.getFullYear()).padStart(4, "0"),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  if (!isValidDate(result)) {
    throw new RangeError(`Date out of supported range: ${result}`);
  }
  return result;
}

/** Selisih hari kalender dari `from` ke `to` (negatif bila `to` lebih awal). */
export function daysBetween(from: string, to: string): number {
  const a = parseDate(from);
  const b = parseDate(to);
  if (!a)
    throw new RangeError(
      `Invalid date "${from}", expected a real YYYY-MM-DD date`,
    );
  if (!b)
    throw new RangeError(
      `Invalid date "${to}", expected a real YYYY-MM-DD date`,
    );
  const diff =
    Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day);
  return diff / MS_PER_DAY;
}

/** Menambah (atau mengurangi, bila negatif) hari kalender pada tanggal YYYY-MM-DD. */
export function addDays(value: string, days: number): string {
  const parts = parseDate(value);
  if (!parts) {
    throw new RangeError(
      `Invalid date "${value}", expected a real YYYY-MM-DD date`,
    );
  }
  if (!Number.isInteger(days)) {
    throw new RangeError("days must be an integer");
  }
  const moved = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + days),
  );
  const result = [
    String(moved.getUTCFullYear()).padStart(4, "0"),
    String(moved.getUTCMonth() + 1).padStart(2, "0"),
    String(moved.getUTCDate()).padStart(2, "0"),
  ].join("-");
  if (!isValidDate(result)) {
    throw new RangeError(`Date out of supported range: ${result}`);
  }
  return result;
}
