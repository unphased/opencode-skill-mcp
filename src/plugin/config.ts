import { promises as fs } from "node:fs"
import { join } from "node:path"
import yaml from "js-yaml"
import type { SkillMcpConfig } from "../core/types"

export function parseSkillMcpConfigFromFrontmatter(content: string): SkillMcpConfig | undefined {
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!frontmatterMatch) return undefined

  try {
    const parsed = yaml.load(frontmatterMatch[1]) as Record<string, unknown>
    if (parsed && typeof parsed === "object" && "mcp" in parsed && parsed.mcp) {
      return parsed.mcp as SkillMcpConfig
    }
  } catch {
    return undefined
  }
  return undefined
}

export async function loadMcpJsonFromDir(skillDir: string): Promise<SkillMcpConfig | undefined> {
  const mcpJsonPath = join(skillDir, "mcp.json")

  try {
    const content = await fs.readFile(mcpJsonPath, "utf-8")
    const parsed = JSON.parse(content) as Record<string, unknown>

    // Standard format: { "mcpServers": { ... } }
    if (parsed && typeof parsed === "object" && "mcpServers" in parsed && parsed.mcpServers) {
      return parsed.mcpServers as SkillMcpConfig
    }

    // Flat format: { "serverName": { "command": "..." } } or { "serverName": { "url": "..." } }
    if (parsed && typeof parsed === "object" && !("mcpServers" in parsed)) {
      const hasServerEntry = Object.values(parsed).some((value) => {
        if (!value || typeof value !== "object") return false
        const v = value as Record<string, unknown>
        return "command" in v || "url" in v
      })
      if (hasServerEntry) {
        return parsed as SkillMcpConfig
      }
    }
  } catch {
    return undefined
  }

  return undefined
}
