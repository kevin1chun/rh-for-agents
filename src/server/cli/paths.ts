import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

export function packageRoot(startDir = import.meta.dirname): string {
  let dir = startDir;

  while (!existsSync(join(dir, "package.json"))) {
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error("Could not locate package root");
    }
    dir = parent;
  }

  return dir;
}

export function skillsDir(root = packageRoot()): string {
  return join(root, "skills");
}

export function binPath(root = packageRoot()): string {
  const compiled = join(root, "dist", "bin", "robinhood-for-agents.js");
  return existsSync(compiled) ? compiled : join(root, "bin", "robinhood-for-agents.ts");
}
