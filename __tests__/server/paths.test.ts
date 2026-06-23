import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { binPath, packageRoot, skillsDir } from "../../src/server/cli/paths.js";

describe("cli paths", () => {
  const tempDirs: string[] = [];

  function makePackageRoot(): string {
    const root = mkdtempSync(join(tmpdir(), "rh-paths-test-"));
    tempDirs.push(root);
    writeFileSync(join(root, "package.json"), "{}\n");
    mkdirSync(join(root, "bin"), { recursive: true });
    mkdirSync(join(root, "skills"), { recursive: true });
    writeFileSync(join(root, "bin", "robinhood-for-agents.ts"), "");
    return root;
  }

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it("finds the package root from nested source or dist paths", () => {
    const root = makePackageRoot();
    const sourceCliDir = join(root, "src", "server", "cli");
    const distCliDir = join(root, "dist", "src", "server", "cli");
    mkdirSync(sourceCliDir, { recursive: true });
    mkdirSync(distCliDir, { recursive: true });

    expect(packageRoot(sourceCliDir)).toBe(root);
    expect(packageRoot(distCliDir)).toBe(root);
  });

  it("resolves skills from the package root", () => {
    const root = makePackageRoot();

    expect(skillsDir(root)).toBe(join(root, "skills"));
    expect(existsSync(skillsDir(root))).toBe(true);
  });

  it("uses the source TypeScript bin before the package is built", () => {
    const root = makePackageRoot();

    expect(binPath(root)).toBe(join(root, "bin", "robinhood-for-agents.ts"));
  });

  it("uses the compiled JavaScript bin when the package has been built", () => {
    const root = makePackageRoot();
    const compiledBin = join(root, "dist", "bin", "robinhood-for-agents.js");
    mkdirSync(join(root, "dist", "bin"), { recursive: true });
    writeFileSync(compiledBin, "");

    expect(binPath(root)).toBe(compiledBin);
  });
});
