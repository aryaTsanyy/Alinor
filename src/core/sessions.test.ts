import { describe, test, expect } from "vitest";
import { getStartedAllocationIds } from "./sessions";
import type { PomodoroSession } from "./types";

const session = (
  id: string,
  allocationId?: string,
  completed = true,
): PomodoroSession => ({
  id,
  taskId: "t",
  startedAt: "2026-10-19T09:00:00",
  endedAt: "2026-10-19T09:25:00",
  completed,
  quadrantAtTime: "Q2",
  allocationId,
});

describe("getStartedAllocationIds", () => {
  test("no sessions -> empty set", () => {
    expect(getStartedAllocationIds([]).size).toBe(0);
  });

  test("collects allocation ids and ignores sessions without one", () => {
    const ids = getStartedAllocationIds([
      session("s1", "a1"),
      session("s2"),
      session("s3", "a2"),
    ]);
    expect([...ids].sort()).toEqual(["a1", "a2"]);
  });

  test("an abandoned (incomplete) session still counts as started", () => {
    expect(
      getStartedAllocationIds([session("s1", "a1", false)]).has("a1"),
    ).toBe(true);
  });

  test("several sessions for the same allocation collapse into one id", () => {
    const ids = getStartedAllocationIds([
      session("s1", "a1"),
      session("s2", "a1"),
    ]);
    expect(ids.size).toBe(1);
  });
});
