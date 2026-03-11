import { describe, expect, it, vi } from "vitest"
import type { ToolContext } from "@opencode-ai/plugin"
import { createSkillMcpTool } from "../../src/plugin/tools"
import type { ActivatedSkill } from "../../src/plugin/registry"

const mockContext: ToolContext = {
  sessionID: "session-1",
  messageID: "msg-1",
  agent: "test-agent",
  directory: "/test",
  worktree: "/test",
  abort: new AbortController().signal,
  metadata: () => {},
  ask: async () => {},
}

function createSkills(...skills: ActivatedSkill[]): ActivatedSkill[] {
  return skills
}

describe("createSkillMcpTool", () => {
  it("rejects MCP servers that are not loaded in the current session", async () => {
    const tool = createSkillMcpTool({
      manager: {
        callTool: vi.fn(),
        readResource: vi.fn(),
        getPrompt: vi.fn(),
      } as any,
      getLoadedSkills: (sessionID) =>
        sessionID === "session-1"
          ? createSkills({
              name: "test-skill",
              resolvedPath: "/skills/test-skill",
              mcpConfig: {
                "echo-test": { command: "node", args: ["server.js"] },
              },
            })
          : [],
    })

    await expect(
      tool.execute({ mcp_name: "missing-server", tool_name: "echo" }, mockContext),
    ).rejects.toThrow(/not found in skills loaded for this session/)
  })

  it("uses the most recently loaded skill when mcp names collide", async () => {
    const callTool = vi.fn().mockResolvedValue([{ type: "text", text: "ok" }])
    const tool = createSkillMcpTool({
      manager: {
        callTool,
        readResource: vi.fn(),
        getPrompt: vi.fn(),
      } as any,
      getLoadedSkills: () =>
        createSkills(
          {
            name: "first",
            resolvedPath: "/skills/first",
            mcpConfig: {
              shared: { command: "node", args: ["first"] },
            },
          },
          {
            name: "second",
            resolvedPath: "/skills/second",
            mcpConfig: {
              shared: { command: "node", args: ["second"] },
            },
          },
        ),
    })

    await tool.execute(
      {
        mcp_name: "shared",
        tool_name: "echo",
        arguments: { message: "hello" },
      },
      mockContext,
    )

    expect(callTool).toHaveBeenCalledWith(
      {
        serverName: "shared",
        skillName: "second",
        sessionID: "session-1",
      },
      {
        config: { command: "node", args: ["second"] },
        skillName: "second",
      },
      "echo",
      { message: "hello" },
    )
  })
})
