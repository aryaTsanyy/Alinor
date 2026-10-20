export interface Envelope {
  version: number;
  data: unknown;
}

export type Migration = (data: unknown) => unknown;

/** Kunci n berisi migrasi dari versi n ke versi n + 1. */
export type MigrationTable = Readonly<Record<number, Migration>>;

export type DecodeResult =
  | { ok: true; envelope: Envelope }
  | { ok: false; reason: string };
export type MigrationResult =
  | { ok: true; data: unknown }
  | { ok: false; reason: string };

function assertVersion(version: number): void {
  if (!Number.isInteger(version) || version < 1) {
    throw new RangeError("version must be a positive integer");
  }
}

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export function encodeEnvelope(version: number, data: unknown): string {
  assertVersion(version);
  return JSON.stringify({ version, data });
}

export function decodeEnvelope(raw: string): DecodeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "stored value is not valid JSON" };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: "stored value must be an object" };
  }
  const record = parsed as Record<string, unknown>;
  const version = record.version;
  if (
    typeof version !== "number" ||
    !Number.isInteger(version) ||
    version < 1
  ) {
    return { ok: false, reason: "version must be a positive integer" };
  }
  if (!("data" in record)) {
    return { ok: false, reason: 'missing "data" field' };
  }
  return { ok: true, envelope: { version, data: record.data } };
}

/** Menaikkan data dari versi tersimpan ke `currentVersion`, satu langkah demi satu langkah. */
export function migrateData(
  envelope: Envelope,
  currentVersion: number,
  migrations: MigrationTable,
): MigrationResult {
  assertVersion(currentVersion);
  assertVersion(envelope.version);
  if (envelope.version > currentVersion) {
    return {
      ok: false,
      reason: `stored data is newer (version ${envelope.version}) than this app supports (version ${currentVersion})`,
    };
  }
  let data = envelope.data;
  for (let version = envelope.version; version < currentVersion; version++) {
    const migrate = migrations[version];
    if (!migrate) {
      return {
        ok: false,
        reason: `no migration from version ${version} to ${version + 1}`,
      };
    }
    try {
      data = migrate(data);
    } catch (error) {
      return {
        ok: false,
        reason: `migration from version ${version} failed: ${errorMessage(error)}`,
      };
    }
  }
  return { ok: true, data };
}
