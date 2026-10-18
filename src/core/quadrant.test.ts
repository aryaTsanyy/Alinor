import { describe, test, expect } from "vitest";
import fc from "fast-check";
import { deriveTaskQuadrant, isUrgent } from "./quadrant";
import type { Quadrant, Task } from "./types";

type Input = Pick<Task, "isImportant" | "urgencyOverride" | "deadline">;

const settings = { urgencyThresholdDays: 2 };
const NOW = new Date(2026, 9, 18, 10, 0); // 18 Okt 2026, 10:00 waktu lokal

const task = (override: Partial<Input> = {}): Input => ({
  isImportant: true,
  urgencyOverride: "AUTO",
  deadline: undefined,
  ...override,
});

const dayFromNow = (offset: number) =>
  new Date(Date.UTC(2026, 9, 18) + offset * 86_400_000)
    .toISOString()
    .slice(0, 10);

describe("deriveTaskQuadrant", () => {
  const cases: Array<[string, Partial<Input>, Quadrant]> = [
    ["important, deadline today", { deadline: "2026-10-18" }, "Q1"],
    [
      "important, deadline exactly at the threshold (2 days)",
      { deadline: "2026-10-20" },
      "Q1",
    ],
    [
      "important, deadline one day past the threshold",
      { deadline: "2026-10-21" },
      "Q2",
    ],
    ["important, overdue", { deadline: "2026-10-10" }, "Q1"],
    ["important, no deadline", {}, "Q2"],
    [
      "not important, deadline tomorrow",
      { isImportant: false, deadline: "2026-10-19" },
      "Q3",
    ],
    [
      "not important, deadline far away",
      { isImportant: false, deadline: "2026-12-01" },
      "Q4",
    ],
    ["not important, no deadline", { isImportant: false }, "Q4"],
    [
      "URGENT override, not important, no deadline",
      { isImportant: false, urgencyOverride: "URGENT" },
      "Q3",
    ],
    ["URGENT override, important", { urgencyOverride: "URGENT" }, "Q1"],
    [
      "NOT_URGENT override beats a deadline tomorrow (drag to Q2)",
      { urgencyOverride: "NOT_URGENT", deadline: "2026-10-19" },
      "Q2",
    ],
    [
      "NOT_URGENT override, not important, deadline tomorrow",
      {
        isImportant: false,
        urgencyOverride: "NOT_URGENT",
        deadline: "2026-10-19",
      },
      "Q4",
    ],
  ];

  test.each(cases)("%s -> %s", (_label, override, expected) => {
    expect(deriveTaskQuadrant(task(override), NOW, settings)).toBe(expected);
  });

  test("threshold 0 makes only today (and overdue) urgent", () => {
    const zero = { urgencyThresholdDays: 0 };
    expect(
      deriveTaskQuadrant(task({ deadline: "2026-10-18" }), NOW, zero),
    ).toBe("Q1");
    expect(
      deriveTaskQuadrant(task({ deadline: "2026-10-19" }), NOW, zero),
    ).toBe("Q2");
  });

  test("time of day does not change the result", () => {
    const early = new Date(2026, 9, 18, 0, 0);
    const late = new Date(2026, 9, 18, 23, 59);
    for (const deadline of ["2026-10-20", "2026-10-21"]) {
      expect(deriveTaskQuadrant(task({ deadline }), early, settings)).toBe(
        deriveTaskQuadrant(task({ deadline }), late, settings),
      );
    }
  });

  test("does not mutate its input", () => {
    const input = task({ deadline: "2026-10-19" });
    const snapshot = structuredClone(input);
    deriveTaskQuadrant(input, NOW, settings);
    expect(input).toEqual(snapshot);
  });

  test("corrupt data fails loudly even when an override would hide it", () => {
    expect(() =>
      deriveTaskQuadrant(
        task({ urgencyOverride: "URGENT", deadline: "2026-02-30" }),
        NOW,
        settings,
      ),
    ).toThrow(RangeError);
    expect(() => deriveTaskQuadrant(task(), new Date(NaN), settings)).toThrow(
      RangeError,
    );
    for (const bad of [-1, 1.5, NaN]) {
      expect(() =>
        deriveTaskQuadrant(task({ urgencyOverride: "NOT_URGENT" }), NOW, {
          urgencyThresholdDays: bad,
        }),
      ).toThrow(RangeError);
    }
  });

  test("property: an override ignores the deadline entirely", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.option(fc.integer({ min: -400, max: 400 }), { nil: undefined }),
        (important, offset) => {
          const deadline =
            offset === undefined ? undefined : dayFromNow(offset);
          const base = { isImportant: important, deadline };
          expect(
            deriveTaskQuadrant(
              task({ ...base, urgencyOverride: "URGENT" }),
              NOW,
              settings,
            ),
          ).toBe(important ? "Q1" : "Q3");
          expect(
            deriveTaskQuadrant(
              task({ ...base, urgencyOverride: "NOT_URGENT" }),
              NOW,
              settings,
            ),
          ).toBe(important ? "Q2" : "Q4");
        },
      ),
    );
  });

  test("property: AUTO is urgent exactly when the deadline is within the threshold", () => {
    fc.assert(
      fc.property(fc.integer({ min: -400, max: 400 }), (offset) => {
        expect(
          isUrgent(task({ deadline: dayFromNow(offset) }), NOW, settings),
        ).toBe(offset <= settings.urgencyThresholdDays);
      }),
    );
  });
});
