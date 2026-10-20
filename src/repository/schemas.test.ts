import { describe, test, expect } from "vitest";
import type { Task } from "../core";
import { emptyPlanningData, type PlanningData } from "./data";
import { sampleSession, samplePlanning } from "./fixtures";
import { validatePlanningData, validateSessions } from "./schemas";

describe("validatePlanningData", () => {
  test("accepts a valid document unchanged", () => {
    expect(validatePlanningData(samplePlanning())).toEqual({
      ok: true,
      data: samplePlanning(),
    });
  });

  test("accepts a fresh, empty document", () => {
    expect(validatePlanningData(emptyPlanningData()).ok).toBe(true);
  });

  test.each([null, undefined, "text", 42, []])(
    "rejects the non-document %j",
    (input) => {
      expect(validatePlanningData(input).ok).toBe(false);
    },
  );

  test("drops unknown fields instead of carrying them along", () => {
    const base = samplePlanning();
    const result = validatePlanningData({
      ...base,
      tasks: [{ ...base.tasks[0], foo: "bar" }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect("foo" in result.data.tasks[0]).toBe(false);
  });

  const corruptions: Array<[string, (d: PlanningData) => void, string]> = [
    [
      "unknown rule category",
      (d) => {
        (d.rules[0] as { category: string }).category = "hobby";
      },
      "rules.0.category",
    ],
    [
      "malformed time",
      (d) => {
        d.rules[0].startTime = "9:00";
      },
      "rules.0.startTime",
    ],
    [
      "end not after start",
      (d) => {
        d.rules[0].endTime = "09:00";
      },
      "endTime must be after startTime",
    ],
    [
      "recurring rule without days",
      (d) => {
        d.rules[0].daysOfWeek = [];
      },
      "at least one day",
    ],
    [
      "one-off rule without a date",
      (d) => {
        delete d.rules[1].specificDate;
      },
      "specificDate",
    ],
    [
      "impossible date",
      (d) => {
        d.rules[1].specificDate = "2026-02-30";
      },
      "rules.1.specificDate",
    ],
    [
      "validFrom after validUntil",
      (d) => {
        d.rules[0].validFrom = "2026-12-01";
        d.rules[0].validUntil = "2026-11-01";
      },
      "validFrom",
    ],
    [
      "negative buffer",
      (d) => {
        d.rules[1].customPostBufferMin = -5;
      },
      "rules.1.customPostBufferMin",
    ],
    [
      "negative pomodoro count",
      (d) => {
        d.tasks[0].estimatedPomodoros = -1;
      },
      "tasks.0.estimatedPomodoros",
    ],
    [
      "fractional pomodoro count",
      (d) => {
        d.tasks[0].completedPomodoros = 0.5;
      },
      "tasks.0.completedPomodoros",
    ],
    [
      "unknown task status",
      (d) => {
        (d.tasks[0] as { status: string }).status = "ARCHIVED";
      },
      "tasks.0.status",
    ],
    [
      "createdAt not ISO",
      (d) => {
        d.tasks[0].createdAt = "yesterday";
      },
      "tasks.0.createdAt",
    ],
    [
      "duplicate task ids",
      (d) => {
        d.tasks.push({ ...d.tasks[0] });
      },
      "unique ids",
    ],
    [
      "allocation of a missing task",
      (d) => {
        d.allocations[0].taskId = "ghost";
      },
      "existing task",
    ],
    [
      "exception of a missing rule",
      (d) => {
        d.exceptions[0].ruleId = "ghost";
      },
      "existing rule",
    ],
    [
      "allocation with a malformed start time",
      (d) => {
        d.allocations[0].startTime = "8:00";
      },
      "allocations.0.startTime",
    ],
    [
      "day ends before it starts",
      (d) => {
        d.settings.dayEndTime = "07:00";
      },
      "dayEndTime must be after dayStartTime",
    ],
    [
      "zero-length pomodoro",
      (d) => {
        d.settings.pomodoroDurationMin = 0;
      },
      "settings.pomodoroDurationMin",
    ],
    [
      "no pomodoros before a long break",
      (d) => {
        d.settings.pomodorosBeforeLongBreak = 0;
      },
      "settings.pomodorosBeforeLongBreak",
    ],
    [
      "missing task title",
      (d) => {
        delete (d.tasks[0] as Partial<Task>).title;
      },
      "tasks.0.title",
    ],
  ];

  test.each(corruptions)("rejects: %s", (_label, corrupt, fragment) => {
    const data = samplePlanning();
    corrupt(data);
    expect(validatePlanningData(data)).toEqual({
      ok: false,
      reason: expect.stringContaining(fragment),
    });
  });
});

describe("validateSessions", () => {
  test("accepts valid sessions", () => {
    const sessions = [sampleSession("s1"), sampleSession("s2")];
    expect(validateSessions(sessions)).toEqual({ ok: true, data: sessions });
  });

  test("accepts an empty log", () => {
    expect(validateSessions([])).toEqual({ ok: true, data: [] });
  });

  test.each([
    [
      "unknown quadrant",
      [{ ...sampleSession("s1"), quadrantAtTime: "Q9" }],
      "quadrantAtTime",
    ],
    [
      "endedAt not ISO",
      [{ ...sampleSession("s1"), endedAt: "later" }],
      "endedAt",
    ],
    ["duplicate ids", [sampleSession("s1"), sampleSession("s1")], "unique ids"],
    [
      "missing taskId",
      [{ ...sampleSession("s1"), taskId: undefined }],
      "taskId",
    ],
  ])("rejects: %s", (_label, input, fragment) => {
    expect(validateSessions(input)).toEqual({
      ok: false,
      reason: expect.stringContaining(fragment),
    });
  });

  test("rejects input that is not an array", () => {
    expect(validateSessions({ sessions: [] }).ok).toBe(false);
  });
});
