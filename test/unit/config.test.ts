import { describe, it, expect } from "vitest"
import { parseSkillMcpConfigFromFrontmatter } from "../../src/plugin/config"

describe("parseSkillMcpConfigFromFrontmatter", () => {
  it("extracts mcp config from frontmatter", () => {
    const content = `---
description: test skill
mcp:
  my-server:
    command: node
    args:
      - server.js
---

# Skill body`

    const config = parseSkillMcpConfigFromFrontmatter(content)
    expect(config).toEqual({
      "my-server": { command: "node", args: ["server.js"] },
    })
  })

  it("returns undefined when no frontmatter", () => {
    expect(parseSkillMcpConfigFromFrontmatter("# Just a skill")).toBeUndefined()
  })

  it("returns undefined when frontmatter has no mcp key", () => {
    const content = `---
description: test
---

body`
    expect(parseSkillMcpConfigFromFrontmatter(content)).toBeUndefined()
  })

  it("handles http MCP config", () => {
    const content = `---
mcp:
  remote:
    url: https://mcp.example.com/mcp
    headers:
      Authorization: "Bearer \${API_KEY}"
---

body`
    const config = parseSkillMcpConfigFromFrontmatter(content)
    expect(config?.remote?.url).toBe("https://mcp.example.com/mcp")
  })
})
