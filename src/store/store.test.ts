import { describe, test, expect } from "vitest";
import type {
  FixedScheduleRule,
  PomodoroSession,
  Task,
  TaskAllocation,
} from "../core";
import {
  DEFAULT_SETTINGS,
  emptyPlanningData,
  type PlanningData,
} from "../repository/data";
import { decodeEnvelope } from "../repository/envelope";
import { sampleSession, samplePlanning } from "../repository/fixtures";
import {
  StorageError,
  createMemoryKv,
  type KeyValueStore,
} from "../repository/kv";
import {
  InvalidDataError,
  createStorageRepository,
  type StorageRepository,
} from "../repository/repository";
import { SessionsUnavailableError, StoreNotReadyError } from "./errors";
import { createAlinorStore } from "./store";
import type { NewRuleInput, NewTaskInput } from "./types";

const MON = "2026-10-19"; // Senin
const TUE = "2026-10-20";
const MON_MORNING = new Date(2026, 9, 19, 7, 0);
const TUE_MORNING = new Date(2026, 9, 20, 7, 0);

function setup(options: { kv?: KeyValueStore; start?: Date } = {}) {
  const kv = options.kv ?? createMemoryKv();
  const repository = createStorageRepository(kv);
  let current = options.start ?? MON_MORNING;
  let counter = 0;
  const store = createAlinorStore({
    repository,
    clock: () => current,
    newId: () => `id${++counter}`,
  });
  return {
    repository,
    store,
    state: () => store.getState(),
    setNow: (date: Date) => {
      current = date;
    },
  };
}

async function stored(repository: StorageRepository): Promise<PlanningData> {
  const result = await repository.loadPlanning();
  if (result.status !== "ok")
    throw new Error(`expected stored planning data, got ${result.status}`);
  return result.data;
}

async function preload(
  repository: StorageRepository,
  data: PlanningData,
  sessions: PomodoroSession[] = [],
): Promise<void> {
  await repository.savePlanning(data);
  for (const session of sessions) await repository.appendSession(session);
}

const taskInput = (over: Partial<NewTaskInput> = {}): NewTaskInput => ({
  title: "T",
  isImportant: true,
  estimatedPomodoros: 3,
  ...over,
});

const meetingInput: NewRuleInput = {
  title: "Rapat",
  category: "work",
  startTime: "09:00",
  endTime: "10:00",
  isRecurring: false,
  specificDate: MON,
};

const kelasRule: FixedScheduleRule = {
  id: "kelas",
  title: "Kelas",
  category: "academic",
  startTime: "09:00",
  endTime: "10:00",
  isRecurring: true,
  daysOfWeek: [1],
};

const laporan = (over: Partial<Task> = {}): Task => ({
  ...samplePlanning().tasks[0],
  completedPomodoros: 0,
  status: "TODO",
  ...over,
});

const allocation = (
  id: string,
  startTime: string,
  over: Partial<TaskAllocation> = {},
): TaskAllocation => ({
  id,
  taskId: "laporan",
  date: MON,
  startTime,
  pomodoroCount: 1,
  status: "PLANNED",
  ...over,
});

const withAllocations = (
  allocations: TaskAllocation[],
  over: Partial<PlanningData> = {},
): PlanningData => ({
  ...emptyPlanningData(),
  tasks: [laporan()],
  allocations,
  ...over,
});

const planned = (
  date: string,
  startTime: string,
  taskId: string,
  pomodoroCount: number,
): TaskAllocation => ({
  id: `alloc:${date}:${startTime}:${taskId}`,
  taskId,
  date,
  startTime,
  pomodoroCount,
  status: "PLANNED",
});

describe("hydration", () => {
  test("a fresh install is ready with defaults and writes nothing", async () => {
    const kv = createMemoryKv();
    const { store, state } = setup({ kv });
    await state().hydrate();
    expect(state().hydration).toBe("ready");
    expect(state().tasks).toEqual([]);
    expect(state().settings).toEqual(DEFAULT_SETTINGS);
    expect(state().issues).toEqual([]);
    expect(state().sessionsStatus).toBe("ok");
    expect(state().lastActiveDate).toBe(MON);
    expect(kv.snapshot()).toEqual({});
    expect(store.getState().hydration).toBe("ready");
  });

  test("loads saved planning data and sessions", async () => {
    const { repository, state } = setup();
    await preload(repository, samplePlanning(), [sampleSession("s1")]);
    await state().hydrate();
    expect(state().hydration).toBe("ready");
    expect(state().tasks).toEqual(samplePlanning().tasks);
    expect(state().rules).toEqual(samplePlanning().rules);
    expect(state().exceptions).toEqual(samplePlanning().exceptions);
    expect(state().allocations).toEqual(samplePlanning().allocations);
    expect(state().sessions).toEqual([sampleSession("s1")]);
  });

  test("reconciles an interrupted write and saves the repair", async () => {
    const data = samplePlanning();
    data.tasks[0].completedPomodoros = 0;
    data.tasks[0].status = "TODO";
    data.allocations[0].pomodoroCount = 1;
    const { repository, state } = setup();
    await preload(repository, data, [sampleSession("s1")]);
    await state().hydrate();
    expect(state().tasks[0]).toMatchObject({
      completedPomodoros: 1,
      status: "IN_PROGRESS",
    });
    expect(state().allocations[0].status).toBe("COMPLETED");
    const saved = await stored(repository);
    expect(saved.tasks[0].completedPomodoros).toBe(1);
    expect(saved.allocations[0].status).toBe("COMPLETED");
  });

  test("expires allocations from earlier days and saves the result", async () => {
    const data = samplePlanning();
    data.allocations[0].date = "2026-10-18";
    const { repository, state } = setup();
    await preload(repository, data);
    await state().hydrate();
    expect(state().allocations[0].status).toBe("EXPIRED");
    expect((await stored(repository)).allocations[0].status).toBe("EXPIRED");
  });

  test("unreadable planning data needs attention, blocks changes and is never overwritten", async () => {
    const kv = createMemoryKv({ "alinor:data": "{bad" });
    const { state } = setup({ kv });
    await state().hydrate();
    expect(state().hydration).toBe("needs-attention");
    expect(state().issues).toEqual([
      {
        key: "data",
        reason: expect.stringContaining("valid JSON"),
        backupKey: expect.stringMatching(/^alinor:backup:data:/),
      },
    ]);
    expect(state().tasks).toEqual([]);
    await expect(state().addTask(taskInput())).rejects.toBeInstanceOf(
      StoreNotReadyError,
    );
    expect(kv.snapshot()["alinor:data"]).toBe("{bad");
  });

  test("an unreadable session log degrades the store instead of blocking it", async () => {
    const kv = createMemoryKv();
    const { repository, state } = setup({ kv });
    await repository.savePlanning(samplePlanning());
    await kv.set("alinor:sessions", "{bad");
    await state().hydrate();
    expect(state().hydration).toBe("ready");
    expect(state().sessionsStatus).toBe("unavailable");
    expect(state().issues).toEqual([
      {
        key: "sessions",
        reason: expect.stringContaining("valid JSON"),
        backupKey: expect.stringMatching(/^alinor:backup:sessions:/),
      },
    ]);
    expect(state().tasks).toEqual(samplePlanning().tasks);
  });

  test("a storage failure while loading needs attention and is reported as a load error", async () => {
    const broken: KeyValueStore = {
      get: async () => {
        throw new StorageError("get", "alinor:data");
      },
      set: async () => undefined,
      remove: async () => undefined,
    };
    const { state } = setup({ kv: broken });
    await state().hydrate();
    expect(state().hydration).toBe("needs-attention");
    expect(state().loadError).toContain("Storage get failed");
  });
});

describe("resolveStorageIssue", () => {
  test("reset starts over with empty data and keeps the backup", async () => {
    const kv = createMemoryKv({ "alinor:data": "{bad" });
    const { state } = setup({ kv });
    await state().hydrate();
    await state().resolveStorageIssue("reset");
    expect(state().hydration).toBe("ready");
    expect(state().issues).toEqual([]);
    expect(state().tasks).toEqual([]);
    expect(decodeEnvelope(kv.snapshot()["alinor:data"])).toEqual({
      ok: true,
      envelope: { version: 1, data: emptyPlanningData() },
    });
    expect(
      Object.keys(kv.snapshot()).filter((k) =>
        k.startsWith("alinor:backup:data:"),
      ),
    ).toHaveLength(1);
  });

  test("resetting an unreadable session log makes recording sessions possible again", async () => {
    const kv = createMemoryKv();
    const { repository, state } = setup({ kv });
    await repository.savePlanning(withAllocations([]));
    await kv.set("alinor:sessions", "{bad");
    await state().hydrate();
    expect(state().sessionsStatus).toBe("unavailable");
    await state().resolveStorageIssue("reset");
    expect(state().sessionsStatus).toBe("ok");
    expect(state().issues).toEqual([]);
    await state().completePomodoro(sampleSession("s9"));
    expect(state().sessions.map((s) => s.id)).toEqual(["s9"]);
  });

  test("retry loads again after the cause was fixed", async () => {
    const kv = createMemoryKv({ "alinor:data": "{bad" });
    const { repository, state } = setup({ kv });
    await state().hydrate();
    expect(state().hydration).toBe("needs-attention");
    await repository.savePlanning(samplePlanning());
    await state().resolveStorageIssue("retry");
    expect(state().hydration).toBe("ready");
    expect(state().tasks).toEqual(samplePlanning().tasks);
  });
});

describe("tasks", () => {
  test("addTask is gated, then creates and saves a task", async () => {
    const { repository, state } = setup();
    await expect(state().addTask(taskInput())).rejects.toBeInstanceOf(
      StoreNotReadyError,
    );
    await state().hydrate();
    const task = await state().addTask(
      taskInput({ title: "Laporan", deadline: "2026-10-21" }),
    );
    expect(task).toEqual({
      id: "id1",
      title: "Laporan",
      isImportant: true,
      urgencyOverride: "AUTO",
      deadline: "2026-10-21",
      estimatedPomodoros: 3,
      completedPomodoros: 0,
      status: "TODO",
      createdAt: MON_MORNING.toISOString(),
    });
    expect(state().tasks).toEqual([task]);
    expect((await stored(repository)).tasks).toEqual([task]);
  });

  test("an invalid task is rejected as a whole: state and storage stay untouched", async () => {
    const kv = createMemoryKv();
    const { state } = setup({ kv });
    await state().hydrate();
    await expect(
      state().addTask(taskInput({ estimatedPomodoros: -1 })),
    ).rejects.toBeInstanceOf(InvalidDataError);
    expect(state().tasks).toEqual([]);
    expect(kv.snapshot()).toEqual({});
  });

  test("updateTask changes fields, can clear a deadline, and rejects unknown ids", async () => {
    const { repository, state } = setup();
    await state().hydrate();
    const task = await state().addTask(taskInput({ deadline: "2026-10-25" }));
    const updated = await state().updateTask(task.id, {
      title: "Baru",
      deadline: undefined,
    });
    expect(updated.title).toBe("Baru");
    expect(updated.deadline).toBeUndefined();
    expect(state().tasks[0].title).toBe("Baru");
    expect("deadline" in (await stored(repository)).tasks[0]).toBe(false);
    await expect(
      state().updateTask("ghost", { title: "x" }),
    ).rejects.toBeInstanceOf(RangeError);
  });

  test("removeTask drops its allocations but keeps the session history", async () => {
    const { repository, state } = setup();
    await preload(repository, samplePlanning(), [sampleSession("s1")]);
    await state().hydrate();
    await state().removeTask("laporan");
    expect(state().tasks).toEqual([]);
    expect(state().allocations).toEqual([]);
    expect(state().sessions).toHaveLength(1);
    expect((await stored(repository)).allocations).toEqual([]);
    await expect(state().removeTask("laporan")).rejects.toBeInstanceOf(
      RangeError,
    );
  });

  test("a failed save keeps the in-memory change, reports it, and the next save clears the error", async () => {
    const inner = createMemoryKv();
    let failures = 1;
    const flaky: KeyValueStore = {
      get: inner.get,
      remove: inner.remove,
      set: async (key, value) => {
        if (key === "alinor:data" && failures > 0) {
          failures -= 1;
          throw new StorageError("set", key);
        }
        await inner.set(key, value);
      },
    };
    const { repository, state } = setup({ kv: flaky });
    await state().hydrate();
    await state().addTask(taskInput({ title: "A" }));
    expect(state().tasks).toHaveLength(1);
    expect(state().persistError).toContain("Storage set failed");
    await state().addTask(taskInput({ title: "B" }));
    expect(state().persistError).toBeNull();
    expect((await stored(repository)).tasks.map((t) => t.title)).toEqual([
      "A",
      "B",
    ]);
  });
});

describe("schedule changes and collisions", () => {
  test("a new rule removes the PLANNED allocation it collides with and reports it", async () => {
    const { repository, state } = setup();
    await preload(repository, withAllocations([allocation("A", "09:30")]));
    await state().hydrate();
    const { rule, summary } = await state().addRule(meetingInput);
    expect(rule.id).toBe("id1");
    expect(summary.removed.map((a) => a.id)).toEqual(["A"]);
    expect(summary.flagged).toEqual([]);
    expect(state().rules).toHaveLength(1);
    expect(state().allocations).toEqual([]);
    expect((await stored(repository)).allocations).toEqual([]);
  });

  test("an allocation that was already started is flagged, not removed", async () => {
    const { repository, state } = setup();
    const started: PomodoroSession = {
      ...sampleSession("s1"),
      allocationId: "A",
      completed: false,
    };
    await preload(repository, withAllocations([allocation("A", "09:30")]), [
      started,
    ]);
    await state().hydrate();
    const { summary } = await state().addRule(meetingInput);
    expect(summary.flagged.map((a) => a.id)).toEqual(["A"]);
    expect(summary.removed).toEqual([]);
    expect(state().allocations.map((a) => a.id)).toEqual(["A"]);
  });

  test("fail-safe: with an unreadable session log nothing is removed, collisions are only flagged", async () => {
    const kv = createMemoryKv();
    const { repository, state } = setup({ kv });
    await repository.savePlanning(withAllocations([allocation("A", "09:30")]));
    await kv.set("alinor:sessions", "{bad");
    await state().hydrate();
    expect(state().sessionsStatus).toBe("unavailable");
    const { summary } = await state().addRule(meetingInput);
    expect(summary.flagged.map((a) => a.id)).toEqual(["A"]);
    expect(summary.removed).toEqual([]);
    expect(state().allocations.map((a) => a.id)).toEqual(["A"]);
  });

  test("updateRule, removeRule and cancelOccurrence work, and unknown ids are rejected", async () => {
    const { state } = setup();
    await state().hydrate();
    const { rule } = await state().addRule({
      title: "Kelas",
      category: "academic",
      startTime: "09:00",
      endTime: "10:00",
      isRecurring: true,
      daysOfWeek: [1],
    });
    const updated = await state().updateRule(rule.id, { endTime: "11:00" });
    expect(updated.rule.endTime).toBe("11:00");
    expect(state().rules[0].endTime).toBe("11:00");

    await state().cancelOccurrence(rule.id, MON);
    expect(state().exceptions).toHaveLength(1);
    await state().removeRule(rule.id);
    expect(state().rules).toEqual([]);
    expect(state().exceptions).toEqual([]);

    await expect(state().updateRule("ghost", {})).rejects.toBeInstanceOf(
      RangeError,
    );
    await expect(state().removeRule("ghost")).rejects.toBeInstanceOf(
      RangeError,
    );
    await expect(state().cancelOccurrence("ghost", MON)).rejects.toBeInstanceOf(
      RangeError,
    );
  });

  test("cancelling the same occurrence twice returns the existing exception", async () => {
    const { state } = setup();
    await state().hydrate();
    const { rule } = await state().addRule({
      ...kelasRule,
      id: undefined,
    } as unknown as NewRuleInput);
    const first = await state().cancelOccurrence(rule.id, MON);
    const second = await state().cancelOccurrence(rule.id, MON);
    expect(second.exception).toEqual(first.exception);
    expect(state().exceptions).toHaveLength(1);
  });

  test("restoring a cancelled occurrence can collide with allocations", async () => {
    const { repository, state } = setup();
    await preload(
      repository,
      withAllocations([allocation("A", "09:30")], {
        rules: [kelasRule],
        exceptions: [
          { id: "x1", ruleId: "kelas", originalDate: MON, type: "CANCELLED" },
        ],
      }),
    );
    await state().hydrate();
    const summary = await state().restoreOccurrence("x1");
    expect(summary.removed.map((a) => a.id)).toEqual(["A"]);
    expect(state().exceptions).toEqual([]);
    await expect(state().restoreOccurrence("ghost")).rejects.toBeInstanceOf(
      RangeError,
    );
  });

  test("raising a buffer in the settings can collide with allocations", async () => {
    const meeting: FixedScheduleRule = {
      ...kelasRule,
      id: "rapat",
      isRecurring: false,
      daysOfWeek: undefined,
      specificDate: MON,
    };
    const { repository, state } = setup();
    await preload(
      repository,
      withAllocations([allocation("A", "10:20")], { rules: [meeting] }),
    );
    await state().hydrate();
    const summary = await state().updateSettings({ postEventBufferMin: 30 });
    expect(summary.removed.map((a) => a.id)).toEqual(["A"]);
    expect(state().settings.postEventBufferMin).toBe(30);
    expect((await stored(repository)).settings.postEventBufferMin).toBe(30);
  });
});

describe("days and auto-fill", () => {
  test("any change after midnight first expires the previous day allocations", async () => {
    const { repository, state, setNow } = setup();
    await preload(repository, withAllocations([allocation("A", "09:30")]));
    await state().hydrate();
    setNow(TUE_MORNING);
    await state().addTask(taskInput());
    expect(state().allocations[0].status).toBe("EXPIRED");
    expect(state().lastActiveDate).toBe(TUE);
    expect((await stored(repository)).allocations[0].status).toBe("EXPIRED");
  });

  test("autoFillToday after midnight rolls over first instead of failing", async () => {
    const { state, setNow } = setup();
    await state().hydrate();
    const task = await state().addTask(taskInput({ estimatedPomodoros: 4 }));
    const first = await state().autoFillToday();
    expect(first).toEqual({
      allocations: [planned(MON, "08:00", task.id, 4)],
      warnings: [],
    });

    setNow(TUE_MORNING);
    const second = await state().autoFillToday();
    expect(second).toEqual({
      allocations: [planned(TUE, "08:00", task.id, 4)],
      warnings: [],
    });
    expect(state().allocations.map((a) => [a.date, a.status])).toEqual([
      [MON, "EXPIRED"],
      [TUE, "PLANNED"],
    ]);
  });

  test("a second auto-fill on the same day only places what is still missing", async () => {
    const { repository, state } = setup();
    await state().hydrate();
    await state().addTask(taskInput({ estimatedPomodoros: 4 }));
    await state().autoFillToday();
    const again = await state().autoFillToday();
    expect(again.allocations).toEqual([]);
    expect(state().allocations).toHaveLength(1);
    expect((await stored(repository)).allocations).toHaveLength(1);
  });

  test("autoFillToday returns the Q1 overflow warning together with what it could place", async () => {
    const { state } = setup();
    await state().hydrate();
    const task = await state().addTask(
      taskInput({ deadline: MON, estimatedPomodoros: 7 }),
    );
    expect(await state().autoFillToday()).toEqual({
      allocations: [planned(MON, "08:00", task.id, 5)],
      warnings: [
        { type: "Q1_OVERFLOW", taskIds: [task.id], shortfallPomodoros: 2 },
      ],
    });
  });

  test("autoFillToday only hands today allocations to the allocator, so history cannot break it", async () => {
    const finished = laporan({
      status: "DONE",
      completedPomodoros: 3,
      completedAt: "2026-10-19T10:00:00Z",
    });
    const b: Task = {
      id: "b",
      title: "b",
      isImportant: true,
      urgencyOverride: "AUTO",
      estimatedPomodoros: 2,
      completedPomodoros: 0,
      status: "TODO",
      createdAt: "2026-10-01T00:00:00Z",
    };
    const history = allocation("old", "08:00", {
      pomodoroCount: 3,
      status: "COMPLETED",
    });
    const { repository, state } = setup({ start: TUE_MORNING });
    await preload(repository, {
      ...emptyPlanningData(),
      tasks: [finished, b],
      allocations: [history],
    });
    await state().hydrate();
    const result = await state().autoFillToday();
    expect(result).toEqual({
      allocations: [planned(TUE, "08:00", "b", 2)],
      warnings: [],
    });
    expect(state().allocations.map((a) => a.id)).toEqual([
      "old",
      "alloc:2026-10-20:08:00:b",
    ]);
  });
});

describe("completePomodoro", () => {
  const workData = () =>
    withAllocations([allocation("A", "08:00", { pomodoroCount: 2 })]);
  const done = (
    id: string,
    over: Partial<PomodoroSession> = {},
  ): PomodoroSession => ({
    ...sampleSession(id),
    allocationId: "A",
    ...over,
  });

  test("the session is logged before the planning data is saved", async () => {
    const inner = createMemoryKv();
    const writes: string[] = [];
    const spying: KeyValueStore = {
      get: inner.get,
      remove: inner.remove,
      set: async (key, value) => {
        writes.push(key);
        await inner.set(key, value);
      },
    };
    const { repository, state } = setup({ kv: spying });
    await preload(repository, workData());
    await state().hydrate();
    writes.length = 0;
    await state().completePomodoro(done("s1"));
    expect(writes).toEqual(["alinor:sessions", "alinor:data"]);
  });

  test("updates the counter, completes the allocation, and finishes the task at its estimate", async () => {
    const { repository, state } = setup();
    await preload(repository, workData());
    await state().hydrate();

    await state().completePomodoro(done("s1"));
    expect(state().tasks[0]).toMatchObject({
      completedPomodoros: 1,
      status: "IN_PROGRESS",
    });
    expect(state().allocations[0].status).toBe("PLANNED");

    await state().completePomodoro(done("s2"));
    expect(state().tasks[0].completedPomodoros).toBe(2);
    expect(state().allocations[0].status).toBe("COMPLETED");

    await state().completePomodoro(done("s3", { allocationId: undefined }));
    expect(state().tasks[0]).toMatchObject({
      completedPomodoros: 3,
      status: "DONE",
      completedAt: MON_MORNING.toISOString(),
    });
    expect((await stored(repository)).tasks[0].status).toBe("DONE");
  });

  test("recording the same session twice counts it once", async () => {
    const { repository, state } = setup();
    await preload(repository, workData());
    await state().hydrate();
    await state().completePomodoro(done("s1"));
    await state().completePomodoro(done("s1"));
    expect(state().tasks[0].completedPomodoros).toBe(1);
    expect(state().sessions).toHaveLength(1);
    const log = await repository.loadSessions();
    expect(log.status === "ok" && log.data).toHaveLength(1);
  });

  test("an abandoned session is logged and marks the allocation as started, without counting", async () => {
    const { repository, state } = setup();
    await preload(repository, workData());
    await state().hydrate();
    await state().completePomodoro(done("s1", { completed: false }));
    expect(state().sessions).toHaveLength(1);
    expect(state().tasks[0]).toMatchObject({
      completedPomodoros: 0,
      status: "TODO",
    });
    expect(state().allocations[0].status).toBe("PLANNED");

    const { summary } = await state().addRule({
      ...meetingInput,
      startTime: "07:30",
      endTime: "08:30",
    });
    expect(summary.flagged.map((a) => a.id)).toEqual(["A"]);
    expect(summary.removed).toEqual([]);
  });

  test("finishing a task early drops its remaining PLANNED allocations", async () => {
    const { repository, state } = setup();
    await preload(repository, workData());
    await state().hydrate();
    await state().completePomodoro(done("s1"), { markTaskDone: true });
    expect(state().tasks[0]).toMatchObject({
      status: "DONE",
      completedAt: MON_MORNING.toISOString(),
      completedPomodoros: 1,
    });
    expect(state().allocations).toEqual([]);
  });

  test("markTaskDone finishes a task, drops its PLANNED allocations, and is harmless when repeated", async () => {
    const { repository, state } = setup();
    await preload(repository, workData());
    await state().hydrate();
    await state().markTaskDone("laporan");
    expect(state().tasks[0].status).toBe("DONE");
    expect(state().allocations).toEqual([]);
    await state().markTaskDone("laporan");
    await expect(state().markTaskDone("ghost")).rejects.toBeInstanceOf(
      RangeError,
    );
  });

  test("a session for an unknown task is rejected before anything is recorded", async () => {
    const { repository, state } = setup();
    await preload(repository, workData());
    await state().hydrate();
    await expect(
      state().completePomodoro(done("s1", { taskId: "ghost" })),
    ).rejects.toBeInstanceOf(RangeError);
    expect(await repository.loadSessions()).toEqual({ status: "empty" });
  });

  test("with an unreadable session log, recording is refused and planning data is untouched", async () => {
    const kv = createMemoryKv();
    const { repository, state } = setup({ kv });
    await repository.savePlanning(workData());
    await kv.set("alinor:sessions", "{bad");
    await state().hydrate();
    await expect(state().completePomodoro(done("s1"))).rejects.toBeInstanceOf(
      SessionsUnavailableError,
    );
    expect(state().tasks[0].completedPomodoros).toBe(0);
  });
});
