import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test, expect } from "vitest";

const dir = fileURLToPath(new URL(".", import.meta.url));
const files = readdirSync(dir).filter((name) => name.endsWith(".ts"));

const IMPORT_PATTERN =
  /\b(?:import|export)\b[^'";]*?\bfrom\s*['"]([^'"]+)['"]/g;

const importsOf = (name: string): string[] =>
  [...readFileSync(join(dir, name), "utf8").matchAll(IMPORT_PATTERN)].map(
    (m) => m[1],
  );

const isTest = (name: string) => name.endsWith(".test.ts");
const allowedInTests = (specifier: string) =>
  specifier === "vitest" ||
  specifier === "fast-check" ||
  specifier.startsWith("node:");

describe("dependency direction", () => {
  test("there are files to check", () => {
    expect(files.filter((f) => !isTest(f)).length).toBeGreaterThan(10);
    expect(files.filter(isTest).length).toBeGreaterThan(10);
  });

  test("core modules import only their siblings", () => {
    for (const name of files.filter((f) => !isTest(f))) {
      for (const specifier of importsOf(name)) {
        expect(
          specifier.startsWith("./"),
          `${name} imports "${specifier}"`,
        ).toBe(true);
      }
    }
  });

  test("core tests import only siblings, vitest, fast-check and node built-ins", () => {
    for (const name of files.filter(isTest)) {
      for (const specifier of importsOf(name)) {
        expect(
          specifier.startsWith("./") || allowedInTests(specifier),
          `${name} imports "${specifier}"`,
        ).toBe(true);
      }
    }
  });
});
