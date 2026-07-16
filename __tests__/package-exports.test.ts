import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type PackageExport = {
  default?: string;
  import?: string;
  types?: string;
};

type PackageJson = {
  bin?: Record<string, string>;
  exports?: Record<string, PackageExport>;
  files?: string[];
  scripts?: Record<string, string>;
};

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as PackageJson;

describe("package publish entrypoints", () => {
  it("exports compiled JavaScript and declaration files", () => {
    expect(packageJson.exports?.["."]).toEqual({
      types: "./dist/src/index.d.ts",
      import: "./dist/src/index.js",
      default: "./dist/src/index.js",
    });
    expect(packageJson.exports?.["./client"]).toEqual({
      types: "./dist/src/client/index.d.ts",
      import: "./dist/src/client/index.js",
      default: "./dist/src/client/index.js",
    });
  });

  it("publishes built output instead of TypeScript source entrypoints", () => {
    expect(packageJson.scripts?.build).toBe("tsc -p tsconfig.build.json");
    expect(packageJson.scripts?.prepack).toBe("npm run build");
    expect(packageJson.files).toEqual(["dist", "skills", "docs"]);
    expect(packageJson.bin?.["robinhood-for-agents"]).toBe("./dist/bin/robinhood-for-agents.js");
  });
});
