import { describe, test, expect } from "vitest";
import {
  StorageError,
  createBrowserKv,
  createLocalStorageKv,
  createMemoryKv,
  type StorageLike,
} from "./kv";

const fakeStorage = (): StorageLike => {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
};

describe("createMemoryKv", () => {
  test("returns null for a missing key", async () => {
    expect(await createMemoryKv().get("missing")).toBeNull();
  });

  test("stores and returns values, including an empty string", async () => {
    const kv = createMemoryKv();
    await kv.set("a", "one");
    await kv.set("empty", "");
    expect(await kv.get("a")).toBe("one");
    expect(await kv.get("empty")).toBe("");
  });

  test("remove deletes a key and tolerates a missing one", async () => {
    const kv = createMemoryKv({ a: "1" });
    await kv.remove("a");
    await kv.remove("never-existed");
    expect(await kv.get("a")).toBeNull();
  });

  test("instances do not share data", async () => {
    const first = createMemoryKv();
    const second = createMemoryKv();
    await first.set("a", "1");
    expect(await second.get("a")).toBeNull();
  });

  test("accepts initial values, and snapshot returns a copy", () => {
    const kv = createMemoryKv({ a: "1" });
    const snapshot = kv.snapshot();
    expect(snapshot).toEqual({ a: "1" });
    snapshot.a = "changed";
    expect(kv.snapshot()).toEqual({ a: "1" });
  });
});

describe("createLocalStorageKv", () => {
  test("round-trips values through a Storage-like object", async () => {
    const kv = createLocalStorageKv(fakeStorage());
    await kv.set("a", "1");
    expect(await kv.get("a")).toBe("1");
    await kv.remove("a");
    expect(await kv.get("a")).toBeNull();
  });

  test("returns null for a missing key", async () => {
    expect(await createLocalStorageKv(fakeStorage()).get("missing")).toBeNull();
  });

  const boom = new Error("QuotaExceededError");
  const failing: StorageLike = {
    getItem: () => {
      throw boom;
    },
    setItem: () => {
      throw boom;
    },
    removeItem: () => {
      throw boom;
    },
  };

  test.each(["get", "set", "remove"] as const)(
    "wraps a failing %s in a StorageError that carries the cause",
    async (operation) => {
      const kv = createLocalStorageKv(failing);
      const attempt =
        operation === "get"
          ? kv.get("k")
          : operation === "set"
            ? kv.set("k", "v")
            : kv.remove("k");
      const error: unknown = await attempt.then(
        () => undefined,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(StorageError);
      const storageError = error as StorageError;
      expect(storageError.operation).toBe(operation);
      expect(storageError.key).toBe("k");
      expect(storageError.cause).toBe(boom);
    },
  );
});

describe("createBrowserKv", () => {
  test("throws a StorageError when there is no window (server render)", () => {
    expect(() => createBrowserKv()).toThrow(StorageError);
  });
});
