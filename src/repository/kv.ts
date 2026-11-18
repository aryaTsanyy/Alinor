export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/** Bagian Web Storage API yang kita pakai, supaya tes bisa menyuntikkan tiruan. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type StorageOperation = "get" | "set" | "remove";

export class StorageError extends Error {
  readonly operation: StorageOperation;
  readonly key: string;

  constructor(operation: StorageOperation, key: string, cause?: unknown) {
    super(`Storage ${operation} failed for key "${key}"`, { cause });
    this.name = "StorageError";
    this.operation = operation;
    this.key = key;
  }
}

async function guard<T>(
  operation: StorageOperation,
  key: string,
  action: () => T,
): Promise<T> {
  try {
    return action();
  } catch (error) {
    throw new StorageError(operation, key, error);
  }
}

export function createLocalStorageKv(storage: StorageLike): KeyValueStore {
  return {
    get: (key) => guard("get", key, () => storage.getItem(key)),
    set: (key, value) => guard("set", key, () => storage.setItem(key, value)),
    remove: (key) => guard("remove", key, () => storage.removeItem(key)),
  };
}

export interface MemoryKv extends KeyValueStore {
  snapshot(): Record<string, string>;
}

/** Untuk tes, dan sebagai cadangan bila localStorage tidak tersedia. */
export function createMemoryKv(initial: Record<string, string> = {}): MemoryKv {
  const data = new Map(Object.entries(initial));
  return {
    get: async (key) => data.get(key) ?? null,
    set: async (key, value) => {
      data.set(key, value);
    },
    remove: async (key) => {
      data.delete(key);
    },
    snapshot: () => Object.fromEntries(data),
  };
}

/** localStorage peramban. Melempar StorageError di server atau saat penyimpanan dinonaktifkan. */
export function createBrowserKv(): KeyValueStore {
  let storage: StorageLike | undefined;
  try {
    storage = typeof window === "undefined" ? undefined : window.localStorage;
  } catch (error) {
    throw new StorageError("get", "localStorage", error);
  }
  if (!storage) {
    throw new StorageError(
      "get",
      "localStorage",
      new Error(
        "localStorage is not available (server render or disabled storage)",
      ),
    );
  }
  return createLocalStorageKv(storage);
}
