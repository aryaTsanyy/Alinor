import { describe, test, expect } from "vitest";
import fc from "fast-check";
import { calculateFreeSlots } from "./slots";
import { capacityOf } from "./capacity";
import { formatTime, parseTime } from "./time";
import type {
  FixedScheduleRule,
  ScheduleException,
  UserSettings,
} from "./types";

const settings: UserSettings = {
  dayStartTime: "08:00",
  dayEndTime: "22:00",
  pomodoroDurationMin: 25,
  shortBreakMin: 5,
  longBreakMin: 15,
  pomodorosBeforeLongBreak: 4,
  preEventBufferMin: 0,
  postEventBufferMin: 15,
  maxDailyPomodoros: 8,
  maxQ1PomodorosPerDay: 5,
  q2ReservedPomodoros: 2,
  autoScheduleQ3: false,
  urgencyThresholdDays: 2,
};

const MON = "2026-10-19";
const TUE = "2026-10-20";

const event = (
  id: string,
  startTime: string,
  endTime: string,
  extra: Partial<FixedScheduleRule> = {},
): FixedScheduleRule => ({
  id,
  title: id,
  category: "academic",
  startTime,
  endTime,
  isRecurring: true,
  daysOfWeek: [1],
  ...extra,
});

const slot = (startTime: string, endTime: string, capacity: number) => ({
  date: MON,
  startTime,
  endTime,
  capacity,
});

describe("calculateFreeSlots", () => {
  test("no events -> one slot covering the whole active window", () => {
    expect(calculateFreeSlots(MON, [], [], settings)).toEqual([
      slot("08:00", "22:00", 26),
    ]);
  });

  test("an event splits the day; its post-event buffer is subtracted too", () => {
    // kelas 09:00-10:40 + buffer 15 -> terisi sampai 10:55
    expect(
      calculateFreeSlots(MON, [event("kelas", "09:00", "10:40")], [], settings),
    ).toEqual([slot("08:00", "09:00", 2), slot("10:55", "22:00", 20)]);
  });

  test("back-to-back events merge; the first buffer is absorbed", () => {
    const rules = [event("a", "09:00", "10:00"), event("b", "10:00", "11:00")];
    expect(calculateFreeSlots(MON, rules, [], settings)).toEqual([
      slot("08:00", "09:00", 2),
      slot("11:15", "22:00", 20),
    ]);
  });

  test("a gap shorter than one pomodoro is discarded", () => {
    // gap 09:15-09:35 = 20 menit
    const rules = [event("a", "08:00", "09:00"), event("b", "09:35", "10:00")];
    expect(calculateFreeSlots(MON, rules, [], settings)).toEqual([
      slot("10:15", "22:00", 22),
    ]);
  });

  test("a gap of exactly one pomodoro (25 min) is kept", () => {
    // gap 09:15-09:40 = 25 menit
    const rules = [event("a", "08:00", "09:00"), event("b", "09:40", "10:00")];
    expect(calculateFreeSlots(MON, rules, [], settings)).toEqual([
      slot("09:15", "09:40", 1),
      slot("10:15", "22:00", 22),
    ]);
  });

  test("an event that starts before the active window is clipped, its buffer still applies", () => {
    expect(
      calculateFreeSlots(MON, [event("pagi", "07:00", "08:30")], [], settings),
    ).toEqual([slot("08:45", "22:00", 24)]);
  });

  test("a buffer running past the end of the day is clipped", () => {
    expect(
      calculateFreeSlots(MON, [event("malam", "21:30", "21:55")], [], settings),
    ).toEqual([slot("08:00", "21:30", 25)]);
  });

  test("a fully booked day has no slots", () => {
    expect(
      calculateFreeSlots(
        MON,
        [event("sehari", "08:00", "22:00")],
        [],
        settings,
      ),
    ).toEqual([]);
  });

  test("custom buffer of 0 overrides the default", () => {
    const rules = [
      event("kelas", "09:00", "10:40", { customPostBufferMin: 0 }),
    ];
    expect(calculateFreeSlots(MON, rules, [], settings)).toEqual([
      slot("08:00", "09:00", 2),
      slot("10:40", "22:00", 21),
    ]);
  });

  test("a CANCELLED exception frees the day", () => {
    const exceptions: ScheduleException[] = [
      { id: "x1", ruleId: "kelas", originalDate: MON, type: "CANCELLED" },
    ];
    expect(
      calculateFreeSlots(
        MON,
        [event("kelas", "09:00", "10:40")],
        exceptions,
        settings,
      ),
    ).toEqual([slot("08:00", "22:00", 26)]);
  });

  test("an event on another weekday does not affect this day", () => {
    expect(
      calculateFreeSlots(TUE, [event("kelas", "09:00", "10:40")], [], settings),
    ).toEqual([
      { date: TUE, startTime: "08:00", endTime: "22:00", capacity: 26 },
    ]);
  });

  test("respects a custom active window", () => {
    const narrow = { ...settings, dayStartTime: "09:00", dayEndTime: "10:00" };
    expect(calculateFreeSlots(MON, [], [], narrow)).toEqual([
      slot("09:00", "10:00", 2),
    ]);
  });

  test("rejects an inverted active window, an invalid date and a malformed rule", () => {
    expect(() =>
      calculateFreeSlots(MON, [], [], {
        ...settings,
        dayStartTime: "22:00",
        dayEndTime: "08:00",
      }),
    ).toThrow(RangeError);
    expect(() => calculateFreeSlots("2026-02-30", [], [], settings)).toThrow(
      RangeError,
    );
    expect(() =>
      calculateFreeSlots(MON, [event("x", "10:00", "09:00")], [], settings),
    ).toThrow(RangeError);
  });

  test("property: slots are sorted, inside the window, never touch buffered events, and fit >= 1 pomodoro", () => {
    const spanArb = fc
      .tuple(
        fc.integer({ min: 0, max: 1438 }),
        fc.integer({ min: 1, max: 240 }),
      )
      .map(([start, len]) => ({ start, end: Math.min(start + len, 1439) }));

    fc.assert(
      fc.property(fc.array(spanArb, { maxLength: 6 }), (spans) => {
        const rules = spans.map(
          ({ start, end }, i): FixedScheduleRule => ({
            id: `r${i}`,
            title: "x",
            category: "work",
            startTime: formatTime(start),
            endTime: formatTime(end),
            isRecurring: false,
            specificDate: MON,
          }),
        );
        const slots = calculateFreeSlots(MON, rules, [], settings);
        const blocked = spans.map(({ start, end }) => ({
          start: start - settings.preEventBufferMin,
          end: end + settings.postEventBufferMin,
        }));

        let previousEnd = 0;
        for (const s of slots) {
          const start = parseTime(s.startTime);
          const end = parseTime(s.endTime);
          expect(start).toBeGreaterThanOrEqual(480);
          expect(end).toBeLessThanOrEqual(1320);
          expect(start).toBeGreaterThanOrEqual(previousEnd);
          previousEnd = end;
          expect(s.capacity).toBeGreaterThanOrEqual(1);
          expect(s.capacity).toBe(capacityOf(end - start, settings));
          for (const b of blocked) {
            expect(start < b.end && b.start < end).toBe(false);
          }
        }
      }),
    );
  });
});
