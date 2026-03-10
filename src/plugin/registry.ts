import { promises as fs } from "node:fs"
import { basename, dirname, join } from "node:path"
import { parseSkillMcpConfigFromFrontmatter, loadMcpJsonFromDir } from "./config"
import type { SkillMcpConfig } from "../core/types"

export interface SkillDefinition {
  name: string
  description: string
  template: string
  path: string
  resolvedPath: string
  mcpConfig: SkillMcpConfig | undefined
}

export class SkillRegistry {
  private skills: Map<string, SkillDefinition> = new Map()

  async loadSkillFromPath(skillPath: string, nameOverride?: string): Promise<SkillDefinition | null> {
    try {
      const content = await fs.readFile(skillPath, "utf-8")
      const resolvedPath = dirname(skillPath)
      const name = nameOverride ?? basename(skillPath, ".md")

      // Parse frontmatter for description
      let description = ""
      const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
      if (frontmatterMatch) {
        const lines = frontmatterMatch[1].split("\n")
        for (const line of lines) {
          const match = line.match(/^description:\s*(.+)/)
          if (match) {
            description = match[1].trim()
            break
          }
        }
      }

      // Extract body (after frontmatter)
      const body = frontmatterMatch ? content.slice(frontmatterMatch[0].length).trim() : content.trim()

      // MCP config: mcp.json takes precedence over frontmatter
      const frontmatterMcp = parseSkillMcpConfigFromFrontmatter(content)
      const mcpJsonMcp = await loadMcpJsonFromDir(resolvedPath)
      const mcpConfig = mcpJsonMcp || frontmatterMcp

      const skill: SkillDefinition = {
        name,
        description,
        template: body,
        path: skillPath,
        resolvedPath,
        mcpConfig,
      }

      this.skills.set(name.toLowerCase(), skill)
      return skill
    } catch {
      return null
    }
  }

  async loadSkillsFromDirectory(dir: string): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".md")) {
          await this.loadSkillFromPath(join(dir, entry.name))
        } else if (entry.isDirectory()) {
          // Check for index.md inside directory-based skills — use folder name as skill name
          const indexPath = join(dir, entry.name, "index.md")
          try {
            await fs.access(indexPath)
            await this.loadSkillFromPath(indexPath, entry.name)
          } catch {
            // No index.md — skip
          }
        }
      }
    } catch {
      // Directory doesn't exist or isn't readable
    }
  }

  getSkill(name: string): SkillDefinition | undefined {
    return this.skills.get(name.toLowerCase())
  }

  listSkills(): SkillDefinition[] {
    return Array.from(this.skills.values())
  }

  listLoadedSkills(): SkillDefinition[] {
    return this.listSkills()
  }

  resolveServer(mcpName: string): { skill: SkillDefinition; config: NonNullable<SkillDefinition["mcpConfig"]>[string] } | null {
    for (const skill of this.skills.values()) {
      if (skill.mcpConfig && mcpName in skill.mcpConfig) {
        return { skill, config: skill.mcpConfig[mcpName] }
      }
    }
    return null
  }
}
