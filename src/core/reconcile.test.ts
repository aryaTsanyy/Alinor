import { describe, test, expect } from "vitest";
import fc from "fast-check";
import { reconcile } from "./reconcile";
import type { PomodoroSession, Task, TaskAllocation } from "./types";

const task = (id: string, override: Partial<Task> = {}): Task => ({
  id,
  title: id,
  isImportant: true,
  urgencyOverride: "AUTO",
  estimatedPomodoros: 5,
  completedPomodoros: 0,
  status: "TODO",
  createdAt: "2026-10-01T00:00:00Z",
  ...override,
});

const session = (
  id: string,
  taskId: string,
  override: Partial<PomodoroSession> = {},
): PomodoroSession => ({
  id,
  taskId,
  startedAt: "2026-10-19T09:00:00",
  endedAt: "2026-10-19T09:25:00",
  completed: true,
  quadrantAtTime: "Q2",
  ...override,
});

const alloc = (
  id: string,
  taskId: string,
  pomodoroCount: number,
  status: TaskAllocation["status"] = "PLANNED",
): TaskAllocation => ({
  id,
  taskId,
  date: "2026-10-19",
  startTime: "09:00",
  pomodoroCount,
  status,
});

describe("reconcile", () => {
  test("nothing to do for empty input", () => {
    expect(reconcile({ tasks: [], allocations: [], sessions: [] })).toEqual({
      tasks: [],
      allocations: [],
      changes: [],
    });
  });

  test("raises a stale counter to the number of completed sessions and starts a TODO task", () => {
    const result = reconcile({
      tasks: [task("t")],
      allocations: [],
      sessions: [session("s1", "t"), session("s2", "t")],
    });
    expect(result.tasks).toEqual([
      task("t", { completedPomodoros: 2, status: "IN_PROGRESS" }),
    ]);
    expect(result.changes).toEqual([
      { kind: "task", taskId: "t", from: 0, to: 2 },
    ]);
  });

  test("never lowers a counter that is already higher", () => {
    const higher = task("t", { completedPomodoros: 5 });
    const result = reconcile({
      tasks: [higher],
      allocations: [],
      sessions: [session("s1", "t"), session("s2", "t")],
    });
    expect(result.tasks[0]).toBe(higher);
    expect(result.changes).toEqual([]);
  });

  test("a counter that already matches the sessions is left alone", () => {
    const matching = task("t", {
      completedPomodoros: 2,
      status: "IN_PROGRESS",
    });
    const result = reconcile({
      tasks: [matching],
      allocations: [],
      sessions: [session("s1", "t"), session("s2", "t")],
    });
    expect(result.tasks[0]).toBe(matching);
    expect(result.changes).toEqual([]);
  });

  test("sessions that were not completed do not count", () => {
    const result = reconcile({
      tasks: [task("t")],
      allocations: [],
      sessions: [session("s1", "t", { completed: false })],
    });
    expect(result.tasks).toEqual([task("t")]);
    expect(result.changes).toEqual([]);
  });

  test("only a TODO task changes status; IN_PROGRESS and DONE keep theirs", () => {
    const result = reconcile({
      tasks: [
        task("ip", { status: "IN_PROGRESS" }),
        task("done", { status: "DONE" }),
      ],
      allocations: [],
      sessions: [session("s1", "ip"), session("s2", "done")],
    });
    expect(result.tasks).toEqual([
      task("ip", { status: "IN_PROGRESS", completedPomodoros: 1 }),
      task("done", { status: "DONE", completedPomodoros: 1 }),
    ]);
  });

  test("sessions of tasks and allocations that no longer exist are ignored", () => {
    const result = reconcile({
      tasks: [task("t")],
      allocations: [alloc("A", "t", 1)],
      sessions: [session("s1", "ghost", { allocationId: "ghost-allocation" })],
    });
    expect(result.tasks).toEqual([task("t")]);
    expect(result.allocations).toEqual([alloc("A", "t", 1)]);
    expect(result.changes).toEqual([]);
  });

  test("an allocation completes once its own completed sessions reach its pomodoro count", () => {
    const planned = alloc("A", "t", 2);
    const one = reconcile({
      tasks: [],
      allocations: [planned],
      sessions: [session("s1", "t", { allocationId: "A" })],
    });
    expect(one.allocations[0]).toBe(planned);

    const two = reconcile({
      tasks: [],
      allocations: [planned],
      sessions: [
        session("s1", "t", { allocationId: "A" }),
        session("s2", "t", { allocationId: "A" }),
      ],
    });
    expect(two.allocations).toEqual([alloc("A", "t", 2, "COMPLETED")]);
    expect(two.changes).toEqual([{ kind: "allocation", allocationId: "A" }]);
  });

  test("only PLANNED allocations change", () => {
    const completed = alloc("B", "t", 1, "COMPLETED");
    const expired = alloc("C", "t", 1, "EXPIRED");
    const result = reconcile({
      tasks: [],
      allocations: [completed, expired],
      sessions: [
        session("s1", "t", { allocationId: "B" }),
        session("s2", "t", { allocationId: "C" }),
      ],
    });
    expect(result.allocations[0]).toBe(completed);
    expect(result.allocations[1]).toBe(expired);
    expect(result.changes).toEqual([]);
  });

  test("an allocation with zero pomodoros never completes by itself", () => {
    const empty = alloc("A", "t", 0);
    const result = reconcile({
      tasks: [],
      allocations: [empty],
      sessions: [session("s1", "t", { allocationId: "A" })],
    });
    expect(result.allocations[0]).toBe(empty);
  });

  test("sessions without an allocation raise the task counter but complete no allocation", () => {
    const planned = alloc("A", "t", 1);
    const result = reconcile({
      tasks: [task("t")],
      allocations: [planned],
      sessions: [session("s1", "t")],
    });
    expect(result.tasks[0].completedPomodoros).toBe(1);
    expect(result.allocations[0]).toBe(planned);
  });

  test("more completed sessions than planned pomodoros still completes the allocation", () => {
    const result = reconcile({
      tasks: [],
      allocations: [alloc("A", "t", 1)],
      sessions: [1, 2, 3].map((n) =>
        session(`s${n}`, "t", { allocationId: "A" }),
      ),
    });
    expect(result.allocations).toEqual([alloc("A", "t", 1, "COMPLETED")]);
  });

  test("unchanged items keep their identity, changed ones are new objects, input is not mutated", () => {
    const untouched = task("a", { completedPomodoros: 3 });
    const stale = task("b");
    const tasks = [untouched, stale];
    const sessions = [session("s1", "b")];
    const result = reconcile({ tasks, allocations: [], sessions });
    expect(result.tasks).not.toBe(tasks);
    expect(result.tasks[0]).toBe(untouched);
    expect(result.tasks[1]).not.toBe(stale);
    expect(stale.completedPomodoros).toBe(0);
    expect(stale.status).toBe("TODO");
  });

  test("recovers from a write that was interrupted after the session was logged", () => {
    // Dua pomodoro selesai untuk alokasi A, tetapi data perencanaan baru mencatat yang pertama.
    const result = reconcile({
      tasks: [
        task("laporan", {
          estimatedPomodoros: 3,
          completedPomodoros: 1,
          status: "IN_PROGRESS",
        }),
      ],
      allocations: [alloc("A", "laporan", 2)],
      sessions: [
        session("s1", "laporan", { allocationId: "A" }),
        session("s2", "laporan", { allocationId: "A" }),
      ],
    });
    expect(result.tasks[0].completedPomodoros).toBe(2);
    expect(result.allocations[0].status).toBe("COMPLETED");
    expect(result.changes).toEqual([
      { kind: "task", taskId: "laporan", from: 1, to: 2 },
      { kind: "allocation", allocationId: "A" },
    ]);
  });

  test("property: only raises, matches the sessions exactly, and a second pass changes nothing", () => {
    const sessionArb = fc.record({
      taskId: fc.constantFrom("t1", "t2", "t3", "ghost"),
      completed: fc.boolean(),
      allocationId: fc.option(fc.constantFrom("A1", "A2"), { nil: undefined }),
    });
    const statusArb = fc.constantFrom<TaskAllocation["status"]>(
      "PLANNED",
      "COMPLETED",
      "EXPIRED",
    );
    const counter = fc.integer({ min: 0, max: 4 });
    const allocSpec = fc.tuple(fc.integer({ min: 0, max: 3 }), statusArb);

    fc.assert(
      fc.property(
        fc.array(sessionArb, { maxLength: 12 }),
        fc.tuple(counter, counter, counter),
        fc.tuple(allocSpec, allocSpec),
        (sessionSpecs, counters, allocSpecs) => {
          const tasks = [
            task("t1", { completedPomodoros: counters[0], status: "TODO" }),
            task("t2", {
              completedPomodoros: counters[1],
              status: "IN_PROGRESS",
            }),
            task("t3", { completedPomodoros: counters[2], status: "DONE" }),
          ];
          const allocations = [
            alloc("A1", "t1", allocSpecs[0][0], allocSpecs[0][1]),
            alloc("A2", "t1", allocSpecs[1][0], allocSpecs[1][1]),
          ];
          const sessions = sessionSpecs.map((s, i) =>
            session(`s${i}`, s.taskId, {
              completed: s.completed,
              allocationId: s.allocationId,
            }),
          );
          const completedForTask = (id: string) =>
            sessions.filter((s) => s.completed && s.taskId === id).length;
          const completedForAllocation = (id: string) =>
            sessions.filter((s) => s.completed && s.allocationId === id).length;

          const result = reconcile({ tasks, allocations, sessions });

          result.tasks.forEach((out, i) => {
            const before = tasks[i];
            expect(out.completedPomodoros).toBe(
              Math.max(before.completedPomodoros, completedForTask(before.id)),
            );
            const started =
              before.status === "TODO" &&
              out.completedPomodoros > before.completedPomodoros;
            expect(out.status).toBe(started ? "IN_PROGRESS" : before.status);
          });
          result.allocations.forEach((out, i) => {
            const before = allocations[i];
            const completes =
              before.status === "PLANNED" &&
              before.pomodoroCount > 0 &&
              completedForAllocation(before.id) >= before.pomodoroCount;
            expect(out.status).toBe(completes ? "COMPLETED" : before.status);
          });

          const again = reconcile({
            tasks: result.tasks,
            allocations: result.allocations,
            sessions,
          });
          expect(again.changes).toEqual([]);
          expect(again.tasks).toEqual(result.tasks);
          expect(again.allocations).toEqual(result.allocations);
        },
      ),
    );
  });
});
