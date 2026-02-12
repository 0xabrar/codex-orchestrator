import { describe, expect, it } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { loadFiles } from "./files.ts";

function createFixtureDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "load-files-"));
  const srcDir = join(dir, "src");
  mkdirSync(srcDir, { recursive: true });

  writeFileSync(join(srcDir, "a.ts"), "export const a = 1;\n");
  writeFileSync(join(srcDir, "config.ts"), "export const config = true;\n");
  writeFileSync(join(srcDir, "templates.ts"), "export const tpl = 'x';\n");
  writeFileSync(join(srcDir, "ignore.js"), "module.exports = {};\n");

  return dir;
}

function sortedPaths(files: Awaited<ReturnType<typeof loadFiles>>): string[] {
  return files.map((file) => file.path).sort();
}

describe("loadFiles negation handling", () => {
  it("excludes files matched by negation patterns", async () => {
    const dir = createFixtureDir();
    try {
      const files = await loadFiles(["src/**/*.ts", "!src/config.ts"], dir);
      const paths = sortedPaths(files);

      expect(paths).toContain("src/a.ts");
      expect(paths).toContain("src/templates.ts");
      expect(paths).not.toContain("src/config.ts");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("still includes files when no negation is provided", async () => {
    const dir = createFixtureDir();
    try {
      const files = await loadFiles(["src/**/*.ts"], dir);
      const paths = sortedPaths(files);

      expect(paths).toEqual(["src/a.ts", "src/config.ts", "src/templates.ts"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("supports multiple negation patterns", async () => {
    const dir = createFixtureDir();
    try {
      const files = await loadFiles(
        ["src/**/*.ts", "!src/config.ts", "!src/templates.ts"],
        dir
      );
      const paths = sortedPaths(files);

      expect(paths).toEqual(["src/a.ts"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
