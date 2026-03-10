import { describe, expect, it } from "vitest"
import { SkillRegistry } from "../../src/plugin/registry"

describe("SkillRegistry", () => {
  it("stores loaded skills per session", () => {
    const registry = new SkillRegistry()

    registry.activateSkill("session-a", {
      name: "alpha",
      resolvedPath: "/tmp/alpha",
      mcpConfig: { "alpha-mcp": { command: "node" } },
    })
    registry.activateSkill("session-b", {
      name: "beta",
      resolvedPath: "/tmp/beta",
      mcpConfig: { "beta-mcp": { command: "node" } },
    })

    expect(registry.listLoadedSkills("session-a").map((skill) => skill.name)).toEqual(["alpha"])
    expect(registry.listLoadedSkills("session-b").map((skill) => skill.name)).toEqual(["beta"])
  })

  it("replaces older entries for the same skill name", () => {
    const registry = new SkillRegistry()

    registry.activateSkill("session-a", {
      name: "alpha",
      resolvedPath: "/tmp/old",
      mcpConfig: { "alpha-mcp": { command: "node" } },
    })
    registry.activateSkill("session-a", {
      name: "alpha",
      resolvedPath: "/tmp/new",
      mcpConfig: { "alpha-mcp": { command: "bun" } },
    })

    const loaded = registry.listLoadedSkills("session-a")
    expect(loaded).toHaveLength(1)
    expect(loaded[0].resolvedPath).toBe("/tmp/new")
    expect(loaded[0].mcpConfig?.["alpha-mcp"]?.command).toBe("bun")
  })

  it("prefers the most recently loaded skill when mcp names collide", () => {
    const registry = new SkillRegistry()

    registry.activateSkill("session-a", {
      name: "first",
      resolvedPath: "/tmp/first",
      mcpConfig: { shared: { command: "node", args: ["first"] } },
    })
    registry.activateSkill("session-a", {
      name: "second",
      resolvedPath: "/tmp/second",
      mcpConfig: { shared: { command: "node", args: ["second"] } },
    })

    const resolved = registry.resolveServer("session-a", "shared")
    expect(resolved?.skill.name).toBe("second")
    expect(resolved?.config.args).toEqual(["second"])
  })

  it("drops sessions without any skill MCP config", () => {
    const registry = new SkillRegistry()

    registry.activateSkill("session-a", {
      name: "empty",
      resolvedPath: "/tmp/empty",
      mcpConfig: undefined,
    })

    expect(registry.listLoadedSkills("session-a")).toEqual([])
  })
})
