import { describe, test, expect } from "vitest";
import { expandRulesForDate, applyBuffers } from "./schedule";
import type { FixedScheduleRule, ScheduleException } from "./types";

const klass: FixedScheduleRule = {
  id: "kelas",
  title: "Kelas",
  category: "academic",
  startTime: "09:00",
  endTime: "10:40",
  isRecurring: true,
  daysOfWeek: [1, 3], // Senin, Rabu
};

const MON = "2026-10-19";
const TUE = "2026-10-20";
const WED = "2026-10-21";
const NEXT_MON = "2026-10-26";

const cancel = (ruleId: string, originalDate: string): ScheduleException => ({
  id: `x-${ruleId}-${originalDate}`,
  ruleId,
  originalDate,
  type: "CANCELLED",
});

describe("expandRulesForDate", () => {
  test("recurring rule occurs on matching weekdays only", () => {
    expect(expandRulesForDate(MON, [klass], [])).toEqual([
      { ruleId: "kelas", start: 540, end: 640 },
    ]);
    expect(expandRulesForDate(WED, [klass], [])).toHaveLength(1);
    expect(expandRulesForDate(TUE, [klass], [])).toEqual([]);
  });

  test("validFrom and validUntil are inclusive", () => {
    const bounded: FixedScheduleRule = {
      ...klass,
      validFrom: WED,
      validUntil: WED,
    };
    expect(expandRulesForDate(MON, [bounded], [])).toEqual([]);
    expect(expandRulesForDate(WED, [bounded], [])).toHaveLength(1);
    expect(expandRulesForDate(NEXT_MON, [bounded], [])).toEqual([]);
  });

  test("one-off rule occurs only on its specificDate", () => {
    const oneOff: FixedScheduleRule = {
      ...klass,
      id: "ujian",
      isRecurring: false,
      daysOfWeek: undefined,
      specificDate: TUE,
    };
    expect(expandRulesForDate(TUE, [oneOff], [])).toHaveLength(1);
    expect(expandRulesForDate(MON, [oneOff], [])).toEqual([]);
  });

  test("CANCELLED exception removes only that occurrence", () => {
    const exceptions = [cancel("kelas", MON)];
    expect(expandRulesForDate(MON, [klass], exceptions)).toEqual([]);
    expect(expandRulesForDate(NEXT_MON, [klass], exceptions)).toHaveLength(1);
  });

  test("exception for another rule does not affect this rule", () => {
    expect(
      expandRulesForDate(MON, [klass], [cancel("lain", MON)]),
    ).toHaveLength(1);
  });

  test("MODIFIED exception on an occurring date fails loudly (not implemented in MVP)", () => {
    const modified: ScheduleException = {
      id: "m1",
      ruleId: "kelas",
      originalDate: MON,
      type: "MODIFIED",
      newStartTime: "11:00",
      newEndTime: "12:00",
    };
    expect(() => expandRulesForDate(MON, [klass], [modified])).toThrow(
      "MODIFIED",
    );
    expect(() =>
      expandRulesForDate(NEXT_MON, [klass], [modified]),
    ).not.toThrow();
  });

  test("returns occurrences sorted by start time", () => {
    const work: FixedScheduleRule = {
      ...klass,
      id: "kerja",
      startTime: "13:00",
      endTime: "17:00",
    };
    expect(
      expandRulesForDate(MON, [work, klass], []).map((o) => o.ruleId),
    ).toEqual(["kelas", "kerja"]);
  });

  test("rejects an invalid target date", () => {
    expect(() => expandRulesForDate("2026-02-30", [klass], [])).toThrow(
      RangeError,
    );
  });

  const malformed: Array<[string, Partial<FixedScheduleRule>]> = [
    ["end before start", { startTime: "10:00", endTime: "09:00" }],
    ["end equals start", { startTime: "10:00", endTime: "10:00" }],
    ["malformed time", { startTime: "9:00" }],
    ["recurring without days", { daysOfWeek: undefined }],
    ["recurring with empty days", { daysOfWeek: [] }],
    ["invalid validFrom", { validFrom: "2026-02-30" }],
    ["validFrom after validUntil", { validFrom: WED, validUntil: MON }],
    [
      "one-off without specificDate",
      { isRecurring: false, daysOfWeek: undefined },
    ],
  ];
  test.each(malformed)("rejects malformed rule: %s", (_label, override) => {
    const rule: FixedScheduleRule = { ...klass, ...override };
    expect(() => expandRulesForDate(MON, [rule], [])).toThrow(RangeError);
  });
});

describe("applyBuffers", () => {
  const defaults = { preEventBufferMin: 5, postEventBufferMin: 15 };
  const occurrence = { ruleId: "kelas", start: 540, end: 640 };

  test("empty input -> empty output", () => {
    expect(applyBuffers([], defaults)).toEqual([]);
  });

  test("applies default buffers before and after", () => {
    expect(applyBuffers([occurrence], defaults)).toEqual([
      { start: 535, end: 655 },
    ]);
  });

  test("custom buffers override the defaults, including an explicit 0", () => {
    const custom = {
      ...occurrence,
      customPreBufferMin: 10,
      customPostBufferMin: 0,
    };
    expect(applyBuffers([custom], defaults)).toEqual([
      { start: 530, end: 640 },
    ]);
  });

  test.each([-1, 1.5, NaN])("rejects invalid buffer %s", (value) => {
    expect(() =>
      applyBuffers([occurrence], { ...defaults, postEventBufferMin: value }),
    ).toThrow(RangeError);
    expect(() =>
      applyBuffers([{ ...occurrence, customPreBufferMin: value }], defaults),
    ).toThrow(RangeError);
  });
});
