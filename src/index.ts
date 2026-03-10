import type { Plugin } from "@opencode-ai/plugin"
import { SkillMcpManager } from "./core/manager"
import { loadActivatedSkillFromMetadata } from "./plugin/activation"
import { formatMcpCapabilities } from "./plugin/capabilities"
import { SkillRegistry } from "./plugin/registry"
import { createSkillMcpTool } from "./plugin/tools"

// NOTE: Do NOT re-export classes here. OpenCode iterates all exports and
// calls each as fn(input). Class constructors fail when called without `new`.
// Library consumers can import from subpaths if needed.

const SkillMcpPlugin: Plugin = async () => {
  const manager = new SkillMcpManager()
  const registry = new SkillRegistry()

  const skillMcpTool = createSkillMcpTool({
    manager,
    getLoadedSkills: (sessionID) => registry.listLoadedSkills(sessionID),
  })

  return {
    tool: {
      skill_mcp: skillMcpTool,
    },
    async "tool.execute.after"(input, output) {
      if (input.tool !== "skill") return

      const skill = await loadActivatedSkillFromMetadata(output.metadata ?? {})
      if (!skill) return

      registry.activateSkill(input.sessionID, skill)

      const mcpInfo = await formatMcpCapabilities(skill, manager, input.sessionID)
      if (!mcpInfo) return

      output.output = `${output.output}\n\n${mcpInfo}`
    },
  }
}

export default SkillMcpPlugin
