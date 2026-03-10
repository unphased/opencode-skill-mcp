import { tool } from "@opencode-ai/plugin"
import type { ToolDefinition, ToolContext } from "@opencode-ai/plugin"
import type { SkillMcpManager } from "../core/manager"
import type { SkillMcpClientInfo, SkillMcpServerContext } from "../core/types"
import type { SkillRegistry, SkillDefinition } from "./registry"
import { formatMcpCapabilities } from "./capabilities"

// --- skill_mcp tool ---

export interface SkillMcpArgs {
  mcp_name: string
  tool_name?: string
  resource_name?: string
  prompt_name?: string
  arguments?: string | Record<string, unknown>
  grep?: string
}

export type OperationType = { type: "tool" | "resource" | "prompt"; name: string }

export function validateOperationParams(args: SkillMcpArgs): OperationType {
  const operations: OperationType[] = []
  if (args.tool_name) operations.push({ type: "tool", name: args.tool_name })
  if (args.resource_name) operations.push({ type: "resource", name: args.resource_name })
  if (args.prompt_name) operations.push({ type: "prompt", name: args.prompt_name })

  if (operations.length === 0) {
    throw new Error(
      `Missing operation. Exactly one of tool_name, resource_name, or prompt_name must be specified.\n\n` +
        `Examples:\n` +
        `  skill_mcp(mcp_name="sqlite", tool_name="query", arguments='{"sql": "SELECT * FROM users"}')\n` +
        `  skill_mcp(mcp_name="memory", resource_name="memory://notes")\n` +
        `  skill_mcp(mcp_name="helper", prompt_name="summarize", arguments='{"text": "..."}')`,
    )
  }

  if (operations.length > 1) {
    const provided = [
      args.tool_name && `tool_name="${args.tool_name}"`,
      args.resource_name && `resource_name="${args.resource_name}"`,
      args.prompt_name && `prompt_name="${args.prompt_name}"`,
    ]
      .filter(Boolean)
      .join(", ")

    throw new Error(
      `Multiple operations specified. Exactly one of tool_name, resource_name, or prompt_name must be provided.\n\n` +
        `Received: ${provided}\n\n` +
        `Use separate calls for each operation.`,
    )
  }

  return operations[0]
}

export function parseArguments(argsJson: string | Record<string, unknown> | undefined): Record<string, unknown> {
  if (!argsJson) return {}
  if (typeof argsJson === "object" && argsJson !== null) return argsJson
  try {
    const jsonStr = argsJson.startsWith("'") && argsJson.endsWith("'") ? argsJson.slice(1, -1) : argsJson
    const parsed = JSON.parse(jsonStr)
    if (typeof parsed !== "object" || parsed === null) {
      throw new Error("Arguments must be a JSON object")
    }
    return parsed as Record<string, unknown>
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Invalid arguments JSON: ${errorMessage}\n\n` +
        `Expected a valid JSON object, e.g.: '{"key": "value"}'\n` +
        `Received: ${argsJson}`,
    )
  }
}

export function applyGrepFilter(output: string, pattern: string | undefined): string {
  if (!pattern) return output
  try {
    const regex = new RegExp(pattern, "i")
    const lines = output.split("\n")
    const filtered = lines.filter((line) => regex.test(line))
    return filtered.length > 0 ? filtered.join("\n") : `[grep] No lines matched pattern: ${pattern}`
  } catch {
    return output
  }
}

function formatAvailableMcps(skills: SkillDefinition[]): string {
  const mcps: string[] = []
  for (const skill of skills) {
    if (skill.mcpConfig) {
      for (const serverName of Object.keys(skill.mcpConfig)) {
        mcps.push(`  - "${serverName}" from skill "${skill.name}"`)
      }
    }
  }
  return mcps.length > 0 ? mcps.join("\n") : "  (none found)"
}

export function createSkillMcpTool(options: {
  manager: SkillMcpManager
  registry: SkillRegistry
}): ToolDefinition {
  const { manager, registry } = options

  return tool({
    description:
      "Invoke MCP server operations from skill-embedded MCPs. Requires mcp_name plus exactly one of: tool_name, resource_name, or prompt_name.",
    args: {
      mcp_name: tool.schema.string().describe("Name of the MCP server from skill config"),
      tool_name: tool.schema.string().optional().describe("MCP tool to call"),
      resource_name: tool.schema.string().optional().describe("MCP resource URI to read"),
      prompt_name: tool.schema.string().optional().describe("MCP prompt to get"),
      arguments: tool.schema
        .union([tool.schema.string(), tool.schema.object({})])
        .optional()
        .describe("JSON string or object of arguments"),
      grep: tool.schema
        .string()
        .optional()
        .describe("Regex pattern to filter output lines (only matching lines returned)"),
    },
    async execute(args: SkillMcpArgs, ctx: ToolContext) {
      const operation = validateOperationParams(args)
      const skills = registry.listLoadedSkills()
      const found = registry.resolveServer(args.mcp_name)

      if (!found) {
        throw new Error(
          `MCP server "${args.mcp_name}" not found.\n\n` +
            `Available MCP servers in loaded skills:\n` +
            formatAvailableMcps(skills) +
            `\n\n` +
            `Hint: Ensure the skill directory contains a valid mcp.json with this server name.`,
        )
      }

      const info: SkillMcpClientInfo = {
        serverName: args.mcp_name,
        skillName: found.skill.name,
        sessionID: ctx.sessionID,
      }
      const serverContext: SkillMcpServerContext = {
        config: found.config,
        skillName: found.skill.name,
      }

      const parsedArgs = parseArguments(args.arguments)

      let output: string
      switch (operation.type) {
        case "tool": {
          const result = await manager.callTool(info, serverContext, operation.name, parsedArgs)
          output = JSON.stringify(result, null, 2)
          break
        }
        case "resource": {
          const result = await manager.readResource(info, serverContext, operation.name)
          output = JSON.stringify(result, null, 2)
          break
        }
        case "prompt": {
          const stringArgs: Record<string, string> = {}
          for (const [key, value] of Object.entries(parsedArgs)) {
            stringArgs[key] = String(value)
          }
          const result = await manager.getPrompt(info, serverContext, operation.name, stringArgs)
          output = JSON.stringify(result, null, 2)
          break
        }
      }
      return applyGrepFilter(output, args.grep)
    },
  })
}

// --- skill tool ---

export function createSkillTool(options: {
  registry: SkillRegistry
  manager: SkillMcpManager
}): ToolDefinition {
  const { registry, manager } = options

  return tool({
    description: "Load a skill by name to activate its instructions and available MCP servers.",
    args: {
      name: tool.schema.string().describe("The skill name to load"),
    },
    async execute(args: { name: string }, ctx: ToolContext) {
      const skill = registry.getSkill(args.name)
      if (!skill) {
        const available = registry.listSkills().map((s) => s.name)
        const partialMatches = available.filter((n) => n.toLowerCase().includes(args.name.toLowerCase()))
        if (partialMatches.length > 0) {
          throw new Error(`Skill "${args.name}" not found. Did you mean: ${partialMatches.join(", ")}?`)
        }
        throw new Error(`Skill "${args.name}" not found. Available: ${available.join(", ") || "none"}`)
      }

      const output = [`## Skill: ${skill.name}`, "", `**Base directory**: ${skill.resolvedPath}`, "", skill.template]

      if (skill.mcpConfig) {
        const mcpInfo = await formatMcpCapabilities(skill, manager, ctx.sessionID)
        if (mcpInfo) output.push(mcpInfo)
      }

      return output.join("\n")
    },
  })
}
