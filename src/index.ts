import type { Plugin } from "@opencode-ai/plugin"
import { SkillMcpManager } from "./core/manager"
import { SkillRegistry } from "./plugin/registry"
import { createSkillTool, createSkillMcpTool } from "./plugin/tools"

export { SkillMcpManager } from "./core/manager"
export { SkillRegistry } from "./plugin/registry"
export type { SkillDefinition } from "./plugin/registry"
export type { McpServerConfig, SkillMcpConfig, SkillMcpClientInfo, SkillMcpServerContext } from "./core/types"

const SkillMcpPlugin: Plugin = async (ctx) => {
  const manager = new SkillMcpManager()
  const registry = new SkillRegistry()

  // Load skills from the standard OpenCode skills directory
  const skillsDir = `${ctx.directory}/.opencode/skills`
  await registry.loadSkillsFromDirectory(skillsDir)

  // Also load from user-level skills
  const homeDir = process.env.HOME || process.env.USERPROFILE || ""
  if (homeDir) {
    await registry.loadSkillsFromDirectory(`${homeDir}/.config/opencode/skills`)
  }

  let currentSessionID = "default"

  const getSessionID = () => currentSessionID

  const skillTool = createSkillTool({ registry, manager, getSessionID })
  const skillMcpTool = createSkillMcpTool({ manager, registry, getSessionID })

  return {
    tool: {
      skill: skillTool,
      skill_mcp: skillMcpTool,
    },

    event: async ({ event }) => {
      // Track session ID from events
      if ("properties" in event && event.properties && "sessionID" in event.properties) {
        currentSessionID = event.properties.sessionID as string
      }
    },
  }
}

export default SkillMcpPlugin
