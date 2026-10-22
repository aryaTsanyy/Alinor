import type { PomodoroSession } from "../core";
import type { PlanningData } from "./data";
import {
  decodeEnvelope,
  encodeEnvelope,
  migrateData,
  type MigrationTable,
} from "./envelope";
import type { KeyValueStore } from "./kv";
import {
  validatePlanningData,
  validateSessions,
  type ValidationResult,
} from "./schemas";

export const BACKUP_PREFIX = "alinor:backup:";

export interface StoredFormat<T> {
  name: string;
  key: string;
  version: number;
  migrations: MigrationTable;
  validate: (input: unknown) => ValidationResult<T>;
}

export const PLANNING_FORMAT: StoredFormat<PlanningData> = {
  name: "data",
  key: "alinor:data",
  version: 1,
  migrations: {},
  validate: validatePlanningData,
};

export const SESSIONS_FORMAT: StoredFormat<PomodoroSession[]> = {
  name: "sessions",
  key: "alinor:sessions",
  version: 1,
  migrations: {},
  validate: validateSessions,
};

export type LoadResult<T> =
  | { status: "empty" }
  | { status: "ok"; data: T }
  | { status: "invalid"; reason: string; backupKey: string };

export class InvalidDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidDataError";
  }
}

/** FNV-1a 32-bit. Untuk kunci cadangan yang deterministik, bukan untuk keamanan. */
export function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

const backupKeyFor = (name: string, raw: string, label?: string): string =>
  `${BACKUP_PREFIX}${name}:${label ? `${label}:` : ""}${fnv1a(raw)}`;

export async function loadStored<T>(
  kv: KeyValueStore,
  format: StoredFormat<T>,
): Promise<LoadResult<T>> {
  const raw = await kv.get(format.key);
  if (raw === null) return { status: "empty" };

  const invalid = async (reason: string): Promise<LoadResult<T>> => {
    const backupKey = backupKeyFor(format.name, raw);
    await kv.set(backupKey, raw); // data asli dibiarkan di tempatnya
    return { status: "invalid", reason, backupKey };
  };

  const decoded = decodeEnvelope(raw);
  if (!decoded.ok) return invalid(decoded.reason);

  const migrated = migrateData(
    decoded.envelope,
    format.version,
    format.migrations,
  );
  if (!migrated.ok) return invalid(migrated.reason);

  const validated = format.validate(migrated.data);
  if (!validated.ok) return invalid(validated.reason);

  if (decoded.envelope.version < format.version) {
    await kv.set(
      backupKeyFor(format.name, raw, `v${decoded.envelope.version}`),
      raw,
    );
    await kv.set(format.key, encodeEnvelope(format.version, validated.data));
  }
  return { status: "ok", data: validated.data };
}

export async function saveStored<T>(
  kv: KeyValueStore,
  format: StoredFormat<T>,
  data: T,
): Promise<void> {
  const validated = format.validate(data);
  if (!validated.ok) {
    throw new InvalidDataError(
      `Refusing to save invalid ${format.name}: ${validated.reason}`,
    );
  }
  await kv.set(format.key, encodeEnvelope(format.version, validated.data));
}

export interface StorageRepository {
  loadPlanning(): Promise<LoadResult<PlanningData>>;
  savePlanning(data: PlanningData): Promise<void>;
  loadSessions(): Promise<LoadResult<PomodoroSession[]>>;
  /** Idempoten menurut id sesi. Menolak menimpa log yang tidak terbaca. */
  appendSession(session: PomodoroSession): Promise<void>;
  resetSessions(): Promise<void>;
}

export function createStorageRepository(kv: KeyValueStore): StorageRepository {
  // Antrean: operasi dijalankan satu per satu, dan satu kegagalan tidak memacetkan yang berikutnya.
  let tail: Promise<unknown> = Promise.resolve();
  const serialize = <R>(task: () => Promise<R>): Promise<R> => {
    const run = tail.then(task);
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  return {
    loadPlanning: () => serialize(() => loadStored(kv, PLANNING_FORMAT)),
    savePlanning: (data) =>
      serialize(() => saveStored(kv, PLANNING_FORMAT, data)),
    loadSessions: () => serialize(() => loadStored(kv, SESSIONS_FORMAT)),
    resetSessions: () => serialize(() => saveStored(kv, SESSIONS_FORMAT, [])),
    appendSession: (session) =>
      serialize(async () => {
        const single = SESSIONS_FORMAT.validate([session]);
        if (!single.ok) {
          throw new InvalidDataError(
            `Refusing to record an invalid session: ${single.reason}`,
          );
        }
        const current = await loadStored(kv, SESSIONS_FORMAT);
        if (current.status === "invalid") {
          throw new InvalidDataError(
            `Stored sessions are unreadable (${current.reason}); a backup is at ${current.backupKey}`,
          );
        }
        const existing = current.status === "ok" ? current.data : [];
        if (existing.some((s) => s.id === session.id)) return;
        await saveStored(kv, SESSIONS_FORMAT, [...existing, single.data[0]]);
      }),
  };
}
