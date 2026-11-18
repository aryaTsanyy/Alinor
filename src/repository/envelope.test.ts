import { describe, test, expect, vi } from "vitest";
import fc from "fast-check";
import {
  decodeEnvelope,
  encodeEnvelope,
  migrateData,
  type MigrationTable,
} from "./envelope";

describe("encodeEnvelope and decodeEnvelope", () => {
  test("round-trips version and data", () => {
    expect(decodeEnvelope(encodeEnvelope(1, { a: 1 }))).toEqual({
      ok: true,
      envelope: { version: 1, data: { a: 1 } },
    });
  });

  test.each([0, -1, 1.5, NaN])("encode rejects version %s", (version) => {
    expect(() => encodeEnvelope(version, {})).toThrow(RangeError);
  });

  test.each([
    ["{bad", "valid JSON"],
    ["null", "object"],
    ["[1,2]", "object"],
    ['"text"', "object"],
    ['{"data":{}}', "version"],
    ['{"version":0,"data":{}}', "version"],
    ['{"version":1.5,"data":{}}', "version"],
    ['{"version":"1","data":{}}', "version"],
    ['{"version":1}', "data"],
  ])("rejects %j", (raw, fragment) => {
    expect(decodeEnvelope(raw)).toEqual({
      ok: false,
      reason: expect.stringContaining(fragment),
    });
  });

  test("null data counts as present; shape checks happen later, in the schema", () => {
    expect(decodeEnvelope('{"version":1,"data":null}')).toEqual({
      ok: true,
      envelope: { version: 1, data: null },
    });
  });
});

describe("migrateData", () => {
  const table: MigrationTable = {
    1: (d) => ({ ...(d as object), v2: true }),
    2: (d) => ({ ...(d as object), v3: true }),
  };

  test("applies migrations in order, starting from the stored version", () => {
    expect(migrateData({ version: 1, data: { a: 1 } }, 3, table)).toEqual({
      ok: true,
      data: { a: 1, v2: true, v3: true },
    });
  });

  test("skips migrations that the stored data has already been through", () => {
    expect(migrateData({ version: 2, data: { a: 1 } }, 3, table)).toEqual({
      ok: true,
      data: { a: 1, v3: true },
    });
  });

  test("leaves current-version data untouched", () => {
    const spy = vi.fn((d: unknown) => d);
    const data = { a: 1 };
    expect(migrateData({ version: 3, data }, 3, { 1: spy, 2: spy })).toEqual({
      ok: true,
      data,
    });
    expect(spy).not.toHaveBeenCalled();
  });

  test("rejects data from a newer version instead of downgrading it", () => {
    expect(migrateData({ version: 4, data: {} }, 3, table)).toEqual({
      ok: false,
      reason: expect.stringContaining("newer"),
    });
  });

  test("reports a missing migration step", () => {
    expect(migrateData({ version: 1, data: {} }, 3, { 1: (d) => d })).toEqual({
      ok: false,
      reason: expect.stringContaining("no migration from version 2"),
    });
  });

  test("reports a failing migration with its message", () => {
    const failing: MigrationTable = {
      1: () => {
        throw new Error("boom");
      },
    };
    expect(migrateData({ version: 1, data: {} }, 2, failing)).toEqual({
      ok: false,
      reason: expect.stringMatching(/migration from version 1 failed.*boom/),
    });
  });

  test("does not mutate its input", () => {
    const envelope = { version: 1, data: { a: 1 } };
    const snapshot = structuredClone(envelope);
    migrateData(envelope, 2, { 1: (d) => ({ ...(d as object), b: 2 }) });
    expect(envelope).toEqual(snapshot);
  });

  test("rejects invalid version numbers", () => {
    for (const bad of [0, -1, 1.5, NaN]) {
      expect(() => migrateData({ version: 1, data: {} }, bad, {})).toThrow(
        RangeError,
      );
      expect(() => migrateData({ version: bad, data: {} }, 1, {})).toThrow(
        RangeError,
      );
    }
  });

  test("property: any chain runs every step between the stored and current version, in order", () => {
    fc.assert(
      fc.property(
        fc
          .integer({ min: 1, max: 10 })
          .chain((current) =>
            fc.tuple(
              fc.constant(current),
              fc.integer({ min: 1, max: current }),
            ),
          ),
        ([current, start]) => {
          const chain: Record<number, (d: unknown) => unknown> = {};
          for (let v = 1; v < current; v++) {
            chain[v] = (d) => [...(d as number[]), v];
          }
          const expected = Array.from(
            { length: current - start },
            (_, i) => start + i,
          );
          expect(
            migrateData({ version: start, data: [] }, current, chain),
          ).toEqual({
            ok: true,
            data: expected,
          });
        },
      ),
    );
  });
});
