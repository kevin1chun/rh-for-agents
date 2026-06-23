import { claudeCode } from "./agents/claude-code.js";
import { binPath } from "./paths.js";

export function installMcp(): void {
  const entry = binPath();

  claudeCode.installMcp?.(entry);

  console.log(`  MCP server added via 'claude mcp add -s user'`);
  console.log(`  Command: bun run ${entry}`);
}
