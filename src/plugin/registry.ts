import type { SkillMcpConfig } from "../core/types"

export interface ActivatedSkill {
  name: string
  resolvedPath: string
  mcpConfig: SkillMcpConfig | undefined
}

export class SkillRegistry {
  private readonly skillsBySession = new Map<string, ActivatedSkill[]>()

  activateSkill(sessionID: string, skill: ActivatedSkill): void {
    const existing = this.skillsBySession.get(sessionID) ?? []
    const deduped = existing.filter((entry) => entry.name !== skill.name)

    if (skill.mcpConfig && Object.keys(skill.mcpConfig).length > 0) {
      deduped.push(skill)
    }

    if (deduped.length > 0) {
      this.skillsBySession.set(sessionID, deduped)
      return
    }

    this.skillsBySession.delete(sessionID)
  }

  listLoadedSkills(sessionID: string): ActivatedSkill[] {
    return [...(this.skillsBySession.get(sessionID) ?? [])]
  }

  resolveServer(
    sessionID: string,
    mcpName: string,
  ): { skill: ActivatedSkill; config: NonNullable<ActivatedSkill["mcpConfig"]>[string] } | null {
    const skills = this.skillsBySession.get(sessionID) ?? []

    for (let index = skills.length - 1; index >= 0; index -= 1) {
      const skill = skills[index]
      if (skill.mcpConfig && mcpName in skill.mcpConfig) {
        return { skill, config: skill.mcpConfig[mcpName] }
      }
    }

    return null
  }
}
