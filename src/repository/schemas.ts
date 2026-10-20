import { z } from "zod";
import { isValidDate, parseTime } from "../core";
import type { PomodoroSession } from "../core";
import type { PlanningData } from "./data";

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: string };

/** Total (tidak pernah melempar): dipakai di dalam refine. */
const minutesOrNull = (value: string): number | null => {
  try {
    return parseTime(value);
  } catch {
    return null;
  }
};

const timeString = z
  .string()
  .refine((v) => minutesOrNull(v) !== null, "must be HH:mm (00:00-23:59)");
const dateString = z
  .string()
  .refine((v) => isValidDate(v), "must be a real YYYY-MM-DD date");
const dateTimeString = z
  .string()
  .refine(
    (v) =>
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v) && !Number.isNaN(Date.parse(v)),
    "must be an ISO date-time",
  );
const nonEmpty = z.string().min(1);
const count = z.number().int().min(0);
const dayOfWeek = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);

const endsAfterStart = (startTime: string, endTime: string): boolean => {
  const start = minutesOrNull(startTime);
  const end = minutesOrNull(endTime);
  return start === null || end === null || end > start;
};

const userSettingsSchema = z
  .object({
    dayStartTime: timeString,
    dayEndTime: timeString,
    pomodoroDurationMin: z.number().int().min(1),
    shortBreakMin: count,
    longBreakMin: count,
    pomodorosBeforeLongBreak: z.number().int().min(1),
    preEventBufferMin: count,
    postEventBufferMin: count,
    maxDailyPomodoros: count,
    maxQ1PomodorosPerDay: count,
    q2ReservedPomodoros: count,
    autoScheduleQ3: z.boolean(),
    urgencyThresholdDays: count,
  })
  .refine(
    (s) => endsAfterStart(s.dayStartTime, s.dayEndTime),
    "dayEndTime must be after dayStartTime",
  );

const fixedScheduleRuleSchema = z
  .object({
    id: nonEmpty,
    title: z.string(),
    category: z.enum(["academic", "work", "personal"]),
    startTime: timeString,
    endTime: timeString,
    customPreBufferMin: count.optional(),
    customPostBufferMin: count.optional(),
    isRecurring: z.boolean(),
    specificDate: dateString.optional(),
    daysOfWeek: z.array(dayOfWeek).optional(),
    validFrom: dateString.optional(),
    validUntil: dateString.optional(),
  })
  .refine(
    (r) => endsAfterStart(r.startTime, r.endTime),
    "endTime must be after startTime",
  )
  .refine(
    (r) => !r.isRecurring || (r.daysOfWeek?.length ?? 0) > 0,
    "a recurring rule needs at least one day in daysOfWeek",
  )
  .refine(
    (r) => r.isRecurring || r.specificDate !== undefined,
    "a one-off rule needs a specificDate",
  )
  .refine(
    (r) =>
      r.validFrom === undefined ||
      r.validUntil === undefined ||
      r.validFrom <= r.validUntil,
    "validFrom must not be after validUntil",
  );

const scheduleExceptionSchema = z.object({
  id: nonEmpty,
  ruleId: nonEmpty,
  originalDate: dateString,
  type: z.enum(["CANCELLED", "MODIFIED"]),
  newDate: dateString.optional(),
  newStartTime: timeString.optional(),
  newEndTime: timeString.optional(),
});

const taskSchema = z.object({
  id: nonEmpty,
  title: z.string(),
  isImportant: z.boolean(),
  urgencyOverride: z.enum(["AUTO", "URGENT", "NOT_URGENT"]),
  deadline: dateString.optional(),
  estimatedPomodoros: count,
  completedPomodoros: count,
  status: z.enum(["TODO", "IN_PROGRESS", "DONE"]),
  createdAt: dateTimeString,
  completedAt: dateTimeString.optional(),
});

const taskAllocationSchema = z.object({
  id: nonEmpty,
  taskId: nonEmpty,
  date: dateString,
  startTime: timeString,
  pomodoroCount: count,
  status: z.enum(["PLANNED", "COMPLETED", "EXPIRED"]),
});

const pomodoroSessionSchema = z.object({
  id: nonEmpty,
  taskId: nonEmpty,
  startedAt: dateTimeString,
  endedAt: dateTimeString,
  completed: z.boolean(),
  quadrantAtTime: z.enum(["Q1", "Q2", "Q3", "Q4"]),
  allocationId: nonEmpty.optional(),
});

const hasUniqueIds = (items: readonly { id: string }[]): boolean =>
  new Set(items.map((item) => item.id)).size === items.length;

const planningDataSchema = z
  .object({
    settings: userSettingsSchema,
    rules: z.array(fixedScheduleRuleSchema),
    exceptions: z.array(scheduleExceptionSchema),
    tasks: z.array(taskSchema),
    allocations: z.array(taskAllocationSchema),
  })
  .refine((d) => hasUniqueIds(d.rules), "rules must have unique ids")
  .refine((d) => hasUniqueIds(d.exceptions), "exceptions must have unique ids")
  .refine((d) => hasUniqueIds(d.tasks), "tasks must have unique ids")
  .refine(
    (d) => hasUniqueIds(d.allocations),
    "allocations must have unique ids",
  )
  .refine((d) => {
    const taskIds = new Set(d.tasks.map((t) => t.id));
    return d.allocations.every((a) => taskIds.has(a.taskId));
  }, "every allocation must reference an existing task")
  .refine((d) => {
    const ruleIds = new Set(d.rules.map((r) => r.id));
    return d.exceptions.every((e) => ruleIds.has(e.ruleId));
  }, "every exception must reference an existing rule");

const sessionsSchema = z
  .array(pomodoroSessionSchema)
  .refine(hasUniqueIds, "sessions must have unique ids");

function formatIssues(error: z.ZodError): string {
  const shown = error.issues.slice(0, 3).map((issue) => {
    const path = issue.path.map(String).join(".");
    return path === "" ? issue.message : `${path}: ${issue.message}`;
  });
  const hidden = error.issues.length - shown.length;
  return hidden > 0
    ? `${shown.join("; ")} (+${hidden} more)`
    : shown.join("; ");
}

export function validatePlanningData(
  input: unknown,
): ValidationResult<PlanningData> {
  const parsed = planningDataSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: formatIssues(parsed.error) };
  // Penjaga saat kompilasi: keluaran skema harus cocok dengan tipe di core.
  const data: PlanningData = parsed.data;
  return { ok: true, data };
}

export function validateSessions(
  input: unknown,
): ValidationResult<PomodoroSession[]> {
  const parsed = sessionsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: formatIssues(parsed.error) };
  const data: PomodoroSession[] = parsed.data;
  return { ok: true, data };
}
