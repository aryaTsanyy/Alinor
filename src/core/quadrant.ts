import { daysBetween, toDateString } from "./dates";
import type { Quadrant, Task, UserSettings } from "./types";

type QuadrantInput = Pick<Task, "isImportant" | "urgencyOverride" | "deadline">;
type UrgencySettings = Pick<UserSettings, "urgencyThresholdDays">;

export function isUrgent(
  task: Pick<Task, "urgencyOverride" | "deadline">,
  now: Date,
  settings: UrgencySettings,
): boolean {
  const threshold = settings.urgencyThresholdDays;
  if (!Number.isInteger(threshold) || threshold < 0) {
    throw new RangeError("urgencyThresholdDays must be a non-negative integer");
  }
  const today = toDateString(now);
  const daysUntil =
    task.deadline === undefined ? undefined : daysBetween(today, task.deadline);

  if (task.urgencyOverride === "URGENT") return true;
  if (task.urgencyOverride === "NOT_URGENT") return false;
  return daysUntil !== undefined && daysUntil <= threshold;
}

export function deriveTaskQuadrant(
  task: QuadrantInput,
  now: Date,
  settings: UrgencySettings,
): Quadrant {
  const urgent = isUrgent(task, now, settings);
  if (task.isImportant) return urgent ? "Q1" : "Q2";
  return urgent ? "Q3" : "Q4";
}
