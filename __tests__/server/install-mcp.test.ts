import { describe, expect, it, vi } from "vitest";
import { binPath } from "../../src/server/cli/paths.js";

const execFileSyncMock = vi.fn();
vi.mock("node:child_process", () => ({ execFileSync: execFileSyncMock }));

describe("installMcp", () => {
  it("removes existing entry then adds via claude CLI", async () => {
    execFileSyncMock.mockReturnValue(Buffer.from(""));

    const { installMcp } = await import("../../src/server/cli/install-mcp.js");
    installMcp();

    // First call: remove existing
    expect(execFileSyncMock).toHaveBeenCalledWith(
      "claude",
      ["mcp", "remove", "robinhood-for-agents"],
      {
        stdio: "pipe",
      },
    );

    // Second call: add new
    const addCall = execFileSyncMock.mock.calls[1] as unknown[];
    expect(addCall[0]).toBe("claude");
    expect(addCall[1]).toEqual(
      expect.arrayContaining([
        "mcp",
        "add",
        "-s",
        "user",
        "robinhood-for-agents",
        "--",
        "bun",
        "run",
      ]),
    );
    expect(addCall[2]).toEqual({ stdio: "pipe" });
  });

  it("continues when remove throws (entry not found)", async () => {
    execFileSyncMock.mockReset();
    // First call (remove) throws, second call (add) succeeds
    execFileSyncMock
      .mockImplementationOnce(() => {
        throw new Error("not found");
      })
      .mockReturnValueOnce(Buffer.from(""));

    const { installMcp } = await import("../../src/server/cli/install-mcp.js");
    installMcp();

    // Should still call add despite remove failing
    expect(execFileSyncMock).toHaveBeenCalledTimes(2);
    const addCall = execFileSyncMock.mock.calls[1] as unknown[];
    expect(addCall[0]).toBe("claude");
    expect(addCall[1]).toEqual(expect.arrayContaining(["mcp", "add"]));
  });

  it("uses the correct bin path", async () => {
    execFileSyncMock.mockReset();
    execFileSyncMock.mockReturnValue(Buffer.from(""));

    const { installMcp } = await import("../../src/server/cli/install-mcp.js");
    installMcp();

    const addCall = execFileSyncMock.mock.calls[1] as unknown[];
    const args = addCall[1] as string[];
    expect(args).toContain(binPath());
  });
});
