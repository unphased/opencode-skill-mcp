import type { Plugin } from "@opencode-ai/plugin"
import { SkillMcpManager } from "./core/manager"
import { SkillRegistry } from "./plugin/registry"
import { createSkillMcpTool } from "./plugin/tools"

// NOTE: Do NOT re-export classes here. OpenCode iterates all exports and
// calls each as fn(input). Class constructors fail when called without `new`.
// Library consumers can import from subpaths if needed.

const SkillMcpPlugin: Plugin = async (input) => {
  const manager = new SkillMcpManager()
  const registry = new SkillRegistry()

  // Load skills from the standard OpenCode skills directory
  const skillsDir = `${input.directory}/.opencode/skills`
  await registry.loadSkillsFromDirectory(skillsDir)

  // Also load from user-level skills
  const homeDir = process.env.HOME || process.env.USERPROFILE || ""
  if (homeDir) {
    await registry.loadSkillsFromDirectory(`${homeDir}/.config/opencode/skills`)
  }

  const skillMcpTool = createSkillMcpTool({ manager, registry })

  return {
    tool: {
      skill_mcp: skillMcpTool,
    },
  }
}

export default SkillMcpPlugin
