import type { UserSettings } from "./types";

export type PomodoroTiming = Pick<
  UserSettings,
  | "pomodoroDurationMin"
  | "shortBreakMin"
  | "longBreakMin"
  | "pomodorosBeforeLongBreak"
>;

function assertValidTiming(t: PomodoroTiming): void {
  if (!Number.isInteger(t.pomodoroDurationMin) || t.pomodoroDurationMin <= 0) {
    throw new RangeError("pomodoroDurationMin must be a positive integer");
  }
  if (!Number.isInteger(t.shortBreakMin) || t.shortBreakMin < 0) {
    throw new RangeError("shortBreakMin must be a non-negative integer");
  }
  if (!Number.isInteger(t.longBreakMin) || t.longBreakMin < 0) {
    throw new RangeError("longBreakMin must be a non-negative integer");
  }
  if (
    !Number.isInteger(t.pomodorosBeforeLongBreak) ||
    t.pomodorosBeforeLongBreak < 1
  ) {
    throw new RangeError("pomodorosBeforeLongBreak must be an integer >= 1");
  }
}

/** Total menit untuk `count` pomodoro berurutan. Jeda hanya di antara pomodoro. */
export function pomodoroBlockMinutes(
  count: number,
  timing: PomodoroTiming,
): number {
  assertValidTiming(timing);
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError("count must be a non-negative integer");
  }
  if (count === 0) return 0;
  const breaks = count - 1;
  const longBreaks = Math.floor(breaks / timing.pomodorosBeforeLongBreak);
  const shortBreaks = breaks - longBreaks;
  return (
    count * timing.pomodoroDurationMin +
    longBreaks * timing.longBreakMin +
    shortBreaks * timing.shortBreakMin
  );
}

/** Jumlah pomodoro maksimum yang muat dalam celah `gapMin` menit. */
export function capacityOf(gapMin: number, timing: PomodoroTiming): number {
  assertValidTiming(timing);
  if (!Number.isFinite(gapMin)) {
    throw new RangeError("gapMin must be a finite number");
  }
  let count = 0;
  while (pomodoroBlockMinutes(count + 1, timing) <= gapMin) count++;
  return count;
}
