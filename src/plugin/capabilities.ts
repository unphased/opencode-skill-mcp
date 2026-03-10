import type { Prompt, Resource, Tool } from "@modelcontextprotocol/sdk/types.js"
import type { SkillMcpManager } from "../core/manager"
import type { SkillMcpClientInfo, SkillMcpServerContext } from "../core/types"
import type { ActivatedSkill } from "./registry"

function summarizeSchemaArguments(inputSchema: unknown): string | null {
  if (!inputSchema || typeof inputSchema !== "object") return null

  const schema = inputSchema as {
    type?: unknown
    properties?: Record<string, unknown>
    required?: unknown
  }

  if (schema.type !== "object" || !schema.properties) return null

  const required = Array.isArray(schema.required) ? new Set(schema.required.filter((item): item is string => typeof item === "string")) : new Set<string>()
  const args = Object.keys(schema.properties)

  if (args.length === 0) return null

  return args.map((arg) => (required.has(arg) ? `${arg}*` : arg)).join(", ")
}

function formatToolLine(tool: Tool): string {
  const parts = [`- \`${tool.name}\``]
  if (tool.description) parts.push(`: ${tool.description}`)

  const args = summarizeSchemaArguments(tool.inputSchema)
  if (args) parts.push(` Args: ${args}`)

  return parts.join("")
}

function formatPromptLine(prompt: Prompt): string {
  const parts = [`- \`${prompt.name}\``]
  if (prompt.description) parts.push(`: ${prompt.description}`)

  const args = prompt.arguments?.map((arg) => arg.required ? `${arg.name}*` : arg.name)
  if (args && args.length > 0) {
    parts.push(` Args: ${args.join(", ")}`)
  }

  return parts.join("")
}

function formatResourceLine(resource: Resource): string {
  const parts = [`- \`${resource.uri}\``]
  if (resource.name) parts.push(` (${resource.name})`)
  if (resource.description) parts.push(`: ${resource.description}`)
  return parts.join("")
}

export async function formatMcpCapabilities(
  skill: ActivatedSkill,
  manager: SkillMcpManager,
  sessionID: string,
): Promise<string | null> {
  if (!skill.mcpConfig || Object.keys(skill.mcpConfig).length === 0) {
    return null
  }

  const sections: string[] = [
    "",
    "## Skill MCPs",
    "",
    "This skill exposes MCP servers through `skill_mcp`.",
    "Use `mcp_name` plus exactly one of `tool_name`, `resource_name`, or `prompt_name`.",
    "Argument hints mark required fields with `*`.",
    "",
  ]

  for (const [serverName, config] of Object.entries(skill.mcpConfig)) {
    const info: SkillMcpClientInfo = {
      serverName,
      skillName: skill.name,
      sessionID,
    }
    const context: SkillMcpServerContext = {
      config,
      skillName: skill.name,
    }

    sections.push(`### ${serverName}`)
    sections.push(`Call with \`skill_mcp(mcp_name="${serverName}", ...)\`.`)
    sections.push("")

    try {
      const [tools, resources, prompts] = await Promise.all([
        manager.listTools(info, context).catch(() => [] as Tool[]),
        manager.listResources(info, context).catch(() => [] as Resource[]),
        manager.listPrompts(info, context).catch(() => [] as Prompt[]),
      ])

      if (tools.length > 0) {
        sections.push("Tools:")
        sections.push(...tools.map(formatToolLine))
        sections.push("")
      }

      if (resources.length > 0) {
        sections.push("Resources:")
        sections.push(...resources.map(formatResourceLine))
        sections.push("")
      }

      if (prompts.length > 0) {
        sections.push("Prompts:")
        sections.push(...prompts.map(formatPromptLine))
        sections.push("")
      }

      if (tools.length === 0 && resources.length === 0 && prompts.length === 0) {
        sections.push("*No capabilities discovered*")
        sections.push("")
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      sections.push(`*Failed to inspect capabilities: ${errorMessage.split("\n")[0]}*`)
      sections.push("")
    }
  }

  return sections.join("\n").trimEnd()
}
