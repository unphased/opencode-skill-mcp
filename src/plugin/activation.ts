import { promises as fs } from "node:fs"
import { join } from "node:path"
import { loadMcpJsonFromDir, parseSkillMcpConfigFromFrontmatter } from "./config"
import type { ActivatedSkill } from "./registry"

interface SkillToolMetadata {
  name?: unknown
  dir?: unknown
}

export async function loadActivatedSkillFromMetadata(metadata: SkillToolMetadata): Promise<ActivatedSkill | null> {
  const name = typeof metadata.name === "string" ? metadata.name : ""
  const resolvedPath = typeof metadata.dir === "string" ? metadata.dir : ""

  if (!name || !resolvedPath) {
    return null
  }

  let frontmatterMcp
  try {
    const skillContent = await fs.readFile(join(resolvedPath, "SKILL.md"), "utf-8")
    frontmatterMcp = parseSkillMcpConfigFromFrontmatter(skillContent)
  } catch {
    frontmatterMcp = undefined
  }

  const mcpJsonMcp = await loadMcpJsonFromDir(resolvedPath)

  return {
    name,
    resolvedPath,
    mcpConfig: mcpJsonMcp || frontmatterMcp,
  }
}
