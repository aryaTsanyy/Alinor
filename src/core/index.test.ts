import { test, expect } from "vitest";
import * as api from "./index";

test("the public API surface is exactly what we intend to expose", () => {
  expect(Object.keys(api).sort()).toEqual(
    [
      "addDays",
      "calculateFreeSlots",
      "capacityOf",
      "computeFeasibility",
      "dayOfWeek",
      "daysBetween",
      "deriveTaskQuadrant",
      "expandRulesForDate",
      "formatTime",
      "generateAutoAllocations",
      "getStartedAllocationIds",
      "isUrgent",
      "isValidDate",
      "parseTime",
      "pomodoroBlockMinutes",
      "reconcile",
      "resolveCollisions",
      "rolloverAllocations",
      "toDateString",
    ].sort(),
  );
});
