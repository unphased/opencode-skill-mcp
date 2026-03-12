import { beforeEach, describe, expect, it, vi } from "vitest"

const skillMcpTool = { execute: vi.fn() }

const mocks = vi.hoisted(() => ({
  loadActivatedSkillFromMetadata: vi.fn(),
  formatMcpCapabilities: vi.fn(),
  createSkillMcpTool: vi.fn(() => skillMcpTool),
}))

vi.mock("../../src/plugin/activation", () => ({
  loadActivatedSkillFromMetadata: mocks.loadActivatedSkillFromMetadata,
}))

vi.mock("../../src/plugin/capabilities", () => ({
  formatMcpCapabilities: mocks.formatMcpCapabilities,
}))

vi.mock("../../src/plugin/tools", () => ({
  createSkillMcpTool: mocks.createSkillMcpTool,
}))

import SkillMcpPlugin from "../../src/index"

describe("SkillMcpPlugin", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createSkillMcpTool.mockReturnValue(skillMcpTool)
  })

  it("registers the skill_mcp tool", async () => {
    const plugin = await SkillMcpPlugin()

    expect(mocks.createSkillMcpTool).toHaveBeenCalledTimes(1)
    expect(plugin.tool?.skill_mcp).toBe(skillMcpTool)
  })

  it("ignores tool executions that are not built-in skill loads", async () => {
    const plugin = await SkillMcpPlugin()
    const output = { output: "unchanged", metadata: { name: "test-skill", dir: "/tmp/test-skill" } }

    await plugin["tool.execute.after"]?.({ tool: "bash", sessionID: "session-1" } as any, output as any)

    expect(mocks.loadActivatedSkillFromMetadata).not.toHaveBeenCalled()
    expect(mocks.formatMcpCapabilities).not.toHaveBeenCalled()
    expect(output.output).toBe("unchanged")
  })

  it("stores the activated skill for the current session and appends MCP info", async () => {
    const plugin = await SkillMcpPlugin()
    const toolOptions = mocks.createSkillMcpTool.mock.calls[0][0] as {
      getLoadedSkills: (sessionID: string) => unknown[]
    }
    const loadedSkill = {
      name: "test-skill",
      resolvedPath: "/tmp/test-skill",
      mcpConfig: {
        "echo-test": { command: "node", args: ["server.js"] },
      },
    }
    const output = { output: "Skill body", metadata: { name: "test-skill", dir: "/tmp/test-skill" } }

    mocks.loadActivatedSkillFromMetadata.mockResolvedValue(loadedSkill)
    mocks.formatMcpCapabilities.mockResolvedValue("## Skill MCPs\n\n### echo-test")

    await plugin["tool.execute.after"]?.({ tool: "skill", sessionID: "session-1" } as any, output as any)

    expect(mocks.loadActivatedSkillFromMetadata).toHaveBeenCalledWith(output.metadata)
    expect(mocks.formatMcpCapabilities).toHaveBeenCalledWith(loadedSkill, expect.any(Object), "session-1")
    expect(toolOptions.getLoadedSkills("session-1")).toEqual([loadedSkill])
    expect(output.output).toBe("Skill body\n\n## Skill MCPs\n\n### echo-test")
  })

  it("leaves the skill output unchanged when no appendix is produced", async () => {
    const plugin = await SkillMcpPlugin()
    const output = { output: "Skill body", metadata: { name: "test-skill", dir: "/tmp/test-skill" } }

    mocks.loadActivatedSkillFromMetadata.mockResolvedValue({
      name: "test-skill",
      resolvedPath: "/tmp/test-skill",
      mcpConfig: { "echo-test": { command: "node" } },
    })
    mocks.formatMcpCapabilities.mockResolvedValue(null)

    await plugin["tool.execute.after"]?.({ tool: "skill", sessionID: "session-1" } as any, output as any)

    expect(output.output).toBe("Skill body")
  })
})
