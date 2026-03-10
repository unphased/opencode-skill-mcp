import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { promises as fs } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { parseSkillMcpConfigFromFrontmatter, loadMcpJsonFromDir } from "../../src/plugin/config"

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

describe("loadMcpJsonFromDir", () => {
  let testDir: string

  beforeEach(async () => {
    testDir = await fs.mkdtemp(join(tmpdir(), "mcp-config-test-"))
  })

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true })
  })

  it("loads standard mcpServers format", async () => {
    await fs.writeFile(
      join(testDir, "mcp.json"),
      JSON.stringify({ mcpServers: { "my-server": { command: "node", args: ["server.js"] } } }),
    )
    const config = await loadMcpJsonFromDir(testDir)
    expect(config?.["my-server"]?.command).toBe("node")
  })

  it("loads flat format with command field", async () => {
    await fs.writeFile(
      join(testDir, "mcp.json"),
      JSON.stringify({ "my-server": { command: "node", args: ["server.js"] } }),
    )
    const config = await loadMcpJsonFromDir(testDir)
    expect(config?.["my-server"]?.command).toBe("node")
  })

  it("loads flat format with url field (remote server)", async () => {
    await fs.writeFile(
      join(testDir, "mcp.json"),
      JSON.stringify({ remote: { url: "https://mcp.example.com/mcp" } }),
    )
    const config = await loadMcpJsonFromDir(testDir)
    expect(config?.remote?.url).toBe("https://mcp.example.com/mcp")
  })

  it("returns undefined when no mcp.json exists", async () => {
    const config = await loadMcpJsonFromDir(testDir)
    expect(config).toBeUndefined()
  })

  it("returns undefined for unrecognized format", async () => {
    await fs.writeFile(join(testDir, "mcp.json"), JSON.stringify({ random: "data" }))
    const config = await loadMcpJsonFromDir(testDir)
    expect(config).toBeUndefined()
  })
})
