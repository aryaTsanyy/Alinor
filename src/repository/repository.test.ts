import { describe, test, expect } from "vitest";
import type { PomodoroSession } from "../core";
import { decodeEnvelope, encodeEnvelope } from "./envelope";
import { sampleSession, samplePlanning } from "./fixtures";
import {
  StorageError,
  createMemoryKv,
  type KeyValueStore,
  type MemoryKv,
} from "./kv";
import {
  BACKUP_PREFIX,
  InvalidDataError,
  PLANNING_FORMAT,
  createStorageRepository,
  fnv1a,
  loadStored,
  saveStored,
  type LoadResult,
  type StoredFormat,
} from "./repository";

const dataOf = <T>(result: LoadResult<T>): T => {
  if (result.status !== "ok")
    throw new Error(`expected ok, got ${result.status}`);
  return result.data;
};

const backupKeys = (kv: MemoryKv, prefix = BACKUP_PREFIX) =>
  Object.keys(kv.snapshot()).filter((key) => key.startsWith(prefix));

describe("fnv1a", () => {
  test.each([
    ["", "811c9dc5"],
    ["a", "e40c292c"],
    ["foobar", "bf9cf968"],
  ])("hash of %j is %s", (text, expected) => {
    expect(fnv1a(text)).toBe(expected);
  });
});

describe("loadStored and saveStored", () => {
  test("a missing key is empty, not an error", async () => {
    expect(await loadStored(createMemoryKv(), PLANNING_FORMAT)).toEqual({
      status: "empty",
    });
  });

  test("round-trips valid data", async () => {
    const kv = createMemoryKv();
    await saveStored(kv, PLANNING_FORMAT, samplePlanning());
    expect(await loadStored(kv, PLANNING_FORMAT)).toEqual({
      status: "ok",
      data: samplePlanning(),
    });
  });

  test("broken JSON is reported, backed up, and the original is left in place", async () => {
    const kv = createMemoryKv({ [PLANNING_FORMAT.key]: "{bad" });
    const result = await loadStored(kv, PLANNING_FORMAT);
    expect(result).toEqual({
      status: "invalid",
      reason: expect.stringContaining("valid JSON"),
      backupKey: expect.stringMatching(/^alinor:backup:data:[0-9a-f]{8}$/),
    });
    const snapshot = kv.snapshot();
    expect(snapshot[PLANNING_FORMAT.key]).toBe("{bad");
    if (result.status === "invalid")
      expect(snapshot[result.backupKey]).toBe("{bad");
  });

  test("data that fails the schema is reported and backed up", async () => {
    const raw = encodeEnvelope(1, {});
    const kv = createMemoryKv({ [PLANNING_FORMAT.key]: raw });
    const result = await loadStored(kv, PLANNING_FORMAT);
    expect(result).toMatchObject({
      status: "invalid",
      reason: expect.stringContaining("settings"),
    });
    expect(backupKeys(kv)).toHaveLength(1);
    expect(kv.snapshot()[PLANNING_FORMAT.key]).toBe(raw);
  });

  test("data from a newer version is refused, never downgraded", async () => {
    const raw = encodeEnvelope(2, samplePlanning());
    const kv = createMemoryKv({ [PLANNING_FORMAT.key]: raw });
    expect(await loadStored(kv, PLANNING_FORMAT)).toMatchObject({
      status: "invalid",
      reason: expect.stringContaining("newer"),
    });
    expect(kv.snapshot()[PLANNING_FORMAT.key]).toBe(raw);
    expect(backupKeys(kv)).toHaveLength(1);
  });

  test("reading the same broken data twice creates one backup, not two", async () => {
    const kv = createMemoryKv({ [PLANNING_FORMAT.key]: "{bad" });
    const first = await loadStored(kv, PLANNING_FORMAT);
    const second = await loadStored(kv, PLANNING_FORMAT);
    expect(second).toEqual(first);
    expect(backupKeys(kv)).toHaveLength(1);
  });

  type Doc = { n: number; migrated?: boolean };
  const validateDoc = (input: unknown) =>
    typeof input === "object" &&
    input !== null &&
    typeof (input as Doc).n === "number"
      ? { ok: true as const, data: input as Doc }
      : { ok: false as const, reason: "n must be a number" };
  const v2Format: StoredFormat<Doc> = {
    name: "doc",
    key: "alinor:doc",
    version: 2,
    migrations: { 1: (d) => ({ ...(d as Doc), migrated: true }) },
    validate: validateDoc,
  };

  test("migrates old data, keeps a backup of the old version, and rewrites the new one", async () => {
    const raw = encodeEnvelope(1, { n: 1 });
    const kv = createMemoryKv({ "alinor:doc": raw });
    expect(await loadStored(kv, v2Format)).toEqual({
      status: "ok",
      data: { n: 1, migrated: true },
    });

    const stored = decodeEnvelope(kv.snapshot()["alinor:doc"]);
    expect(stored).toEqual({
      ok: true,
      envelope: { version: 2, data: { n: 1, migrated: true } },
    });
    const [backupKey] = backupKeys(kv, "alinor:backup:doc:v1:");
    expect(kv.snapshot()[backupKey]).toBe(raw);
  });

  test("a failing migration is reported and leaves the stored data untouched", async () => {
    const failing: StoredFormat<Doc> = {
      ...v2Format,
      migrations: {
        1: () => {
          throw new Error("boom");
        },
      },
    };
    const raw = encodeEnvelope(1, { n: 1 });
    const kv = createMemoryKv({ "alinor:doc": raw });
    expect(await loadStored(kv, failing)).toMatchObject({
      status: "invalid",
      reason: expect.stringContaining("migration from version 1 failed"),
    });
    expect(kv.snapshot()["alinor:doc"]).toBe(raw);
    expect(backupKeys(kv)).toHaveLength(1);
  });

  test("saving invalid data throws and writes nothing", async () => {
    const kv = createMemoryKv();
    const bad = samplePlanning();
    bad.tasks[0].estimatedPomodoros = -1;
    await expect(saveStored(kv, PLANNING_FORMAT, bad)).rejects.toBeInstanceOf(
      InvalidDataError,
    );
    expect(kv.snapshot()).toEqual({});
  });
});

describe("createStorageRepository", () => {
  test("a fresh install has nothing stored", async () => {
    const repo = createStorageRepository(createMemoryKv());
    expect(await repo.loadPlanning()).toEqual({ status: "empty" });
    expect(await repo.loadSessions()).toEqual({ status: "empty" });
  });
  test("resetSessions replaces an unreadable log with an empty one and keeps the backup", async () => {
    const kv = createMemoryKv({ "alinor:sessions": "{not json" });
    const repo = createStorageRepository(kv);
    expect((await repo.loadSessions()).status).toBe("invalid");
    await repo.resetSessions();
    expect(dataOf(await repo.loadSessions())).toEqual([]);
    expect(backupKeys(kv, "alinor:backup:sessions:")).toHaveLength(1);
  });

  test("appending works again after a reset", async () => {
    const repo = createStorageRepository(
      createMemoryKv({ "alinor:sessions": "{not json" }),
    );
    await repo.resetSessions();
    await repo.appendSession(sampleSession("s1"));
    expect(dataOf(await repo.loadSessions()).map((s) => s.id)).toEqual(["s1"]);
  });

  test("planning data round-trips", async () => {
    const repo = createStorageRepository(createMemoryKv());
    await repo.savePlanning(samplePlanning());
    expect(dataOf(await repo.loadPlanning())).toEqual(samplePlanning());
  });

  test("planning data is stored as a versioned envelope", async () => {
    const kv = createMemoryKv();
    await createStorageRepository(kv).savePlanning(samplePlanning());
    expect(decodeEnvelope(kv.snapshot()["alinor:data"])).toEqual({
      ok: true,
      envelope: { version: 1, data: samplePlanning() },
    });
  });

  test("sessions are appended in order", async () => {
    const repo = createStorageRepository(createMemoryKv());
    await repo.appendSession(sampleSession("s1"));
    await repo.appendSession(sampleSession("s2"));
    expect(dataOf(await repo.loadSessions()).map((s) => s.id)).toEqual([
      "s1",
      "s2",
    ]);
  });

  test("appending the same session id again changes nothing", async () => {
    const repo = createStorageRepository(createMemoryKv());
    await repo.appendSession(sampleSession("s1"));
    await repo.appendSession(sampleSession("s1"));
    expect(dataOf(await repo.loadSessions())).toHaveLength(1);
  });

  test("an invalid session is rejected and nothing is written", async () => {
    const kv = createMemoryKv();
    const bad = {
      ...sampleSession("s1"),
      quadrantAtTime: "Q9",
    } as unknown as PomodoroSession;
    await expect(
      createStorageRepository(kv).appendSession(bad),
    ).rejects.toBeInstanceOf(InvalidDataError);
    expect(kv.snapshot()).toEqual({});
  });

  test("unreadable stored sessions are never overwritten by an append", async () => {
    const kv = createMemoryKv({ "alinor:sessions": "{not json" });
    await expect(
      createStorageRepository(kv).appendSession(sampleSession("s1")),
    ).rejects.toBeInstanceOf(InvalidDataError);
    expect(kv.snapshot()["alinor:sessions"]).toBe("{not json");
    expect(backupKeys(kv, "alinor:backup:sessions:")).toHaveLength(1);
  });

  test("planning data and sessions live under separate keys", async () => {
    const kv = createMemoryKv();
    const repo = createStorageRepository(kv);
    await repo.savePlanning(samplePlanning());
    expect(Object.keys(kv.snapshot())).toEqual(["alinor:data"]);
    await repo.appendSession(sampleSession("s1"));
    expect(Object.keys(kv.snapshot()).sort()).toEqual([
      "alinor:data",
      "alinor:sessions",
    ]);
  });

  test("concurrent appends are queued, so none is lost and the order is preserved", async () => {
    const repo = createStorageRepository(createMemoryKv());
    const ids = Array.from({ length: 20 }, (_, i) => `s${i}`);
    await Promise.all(ids.map((id) => repo.appendSession(sampleSession(id))));
    expect(dataOf(await repo.loadSessions()).map((s) => s.id)).toEqual(ids);
  });

  test("a failed write does not block the operations queued after it", async () => {
    const inner = createMemoryKv();
    let failNextSet = true;
    const flaky: KeyValueStore = {
      get: inner.get,
      remove: inner.remove,
      set: async (key, value) => {
        if (failNextSet) {
          failNextSet = false;
          throw new StorageError("set", key);
        }
        await inner.set(key, value);
      },
    };
    const repo = createStorageRepository(flaky);
    await expect(repo.savePlanning(samplePlanning())).rejects.toBeInstanceOf(
      StorageError,
    );
    await repo.savePlanning(samplePlanning());
    expect(dataOf(await repo.loadPlanning())).toEqual(samplePlanning());
  });
});
