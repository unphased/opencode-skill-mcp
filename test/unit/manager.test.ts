import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getOrCreateClientWithRetry: vi.fn(),
  getOrCreateClient: vi.fn(),
  disconnectSession: vi.fn(),
  disconnectAll: vi.fn(),
  forceReconnect: vi.fn(),
}))

vi.mock("../../src/core/connection", () => ({
  getOrCreateClient: mocks.getOrCreateClient,
  getOrCreateClientWithRetry: mocks.getOrCreateClientWithRetry,
}))

vi.mock("../../src/core/cleanup", () => ({
  disconnectSession: mocks.disconnectSession,
  disconnectAll: mocks.disconnectAll,
  forceReconnect: mocks.forceReconnect,
}))

import { SkillMcpManager } from "../../src/core/manager"

const info = {
  serverName: "echo-test",
  skillName: "test-skill",
  sessionID: "session-1",
}

const context = {
  config: { command: "node", args: ["server.js"] },
  skillName: "test-skill",
}

describe("SkillMcpManager", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns tool content from the MCP client", async () => {
    const client = {
      callTool: vi.fn().mockResolvedValue({ content: [{ type: "text", text: "Echo: hello" }] }),
    }
    mocks.getOrCreateClientWithRetry.mockResolvedValue(client)

    const manager = new SkillMcpManager()
    const result = await manager.callTool(info, context, "echo", { message: "hello" })

    expect(result).toEqual([{ type: "text", text: "Echo: hello" }])
    expect(client.callTool).toHaveBeenCalledWith({
      name: "echo",
      arguments: { message: "hello" },
    })
  })

  it("retries once after a not connected error and forces reconnect", async () => {
    const disconnectedClient = {
      callTool: vi.fn().mockRejectedValue(new Error("Client is not connected")),
    }
    const recoveredClient = {
      callTool: vi.fn().mockResolvedValue({ content: [{ type: "text", text: "ok" }] }),
    }

    mocks.getOrCreateClientWithRetry
      .mockResolvedValueOnce(disconnectedClient)
      .mockResolvedValueOnce(recoveredClient)
    mocks.forceReconnect.mockResolvedValue(true)

    const manager = new SkillMcpManager()
    const result = await manager.callTool(info, context, "echo", {})

    expect(result).toEqual([{ type: "text", text: "ok" }])
    expect(mocks.forceReconnect).toHaveBeenCalledWith(
      expect.objectContaining({
        clients: expect.any(Map),
        pendingConnections: expect.any(Map),
      }),
      "session-1:test-skill:echo-test",
    )
    expect(recoveredClient.callTool).toHaveBeenCalledTimes(1)
  })

  it("fails after three reconnect attempts", async () => {
    const brokenClient = {
      callTool: vi.fn().mockRejectedValue(new Error("not connected")),
    }

    mocks.getOrCreateClientWithRetry.mockResolvedValue(brokenClient)
    mocks.forceReconnect.mockResolvedValue(true)

    const manager = new SkillMcpManager()

    await expect(manager.callTool(info, context, "echo", {})).rejects.toThrow(
      "Failed after 3 reconnection attempts: not connected",
    )
    expect(mocks.forceReconnect).toHaveBeenCalledTimes(2)
  })

  it("does not retry non-connection errors", async () => {
    const failingClient = {
      callTool: vi.fn().mockRejectedValue(new Error("permission denied")),
    }

    mocks.getOrCreateClientWithRetry.mockResolvedValue(failingClient)

    const manager = new SkillMcpManager()

    await expect(manager.callTool(info, context, "echo", {})).rejects.toThrow("permission denied")
    expect(mocks.forceReconnect).not.toHaveBeenCalled()
  })

  it("delegates disconnect helpers to cleanup module", async () => {
    const manager = new SkillMcpManager()

    await manager.disconnectSession("session-1")
    await manager.disconnectAll()

    expect(mocks.disconnectSession).toHaveBeenCalledTimes(1)
    expect(mocks.disconnectSession).toHaveBeenCalledWith(
      expect.objectContaining({
        clients: expect.any(Map),
        pendingConnections: expect.any(Map),
      }),
      "session-1",
    )
    expect(mocks.disconnectAll).toHaveBeenCalledTimes(1)
  })
})
