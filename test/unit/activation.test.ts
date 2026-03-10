import { promises as fs } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { loadActivatedSkillFromMetadata } from "../../src/plugin/activation"
import { formatMcpCapabilities } from "../../src/plugin/capabilities"

let testDir: string

beforeEach(async () => {
  testDir = await fs.mkdtemp(join(tmpdir(), "skill-mcp-activation-"))
})

afterEach(async () => {
  await fs.rm(testDir, { recursive: true, force: true })
})

describe("loadActivatedSkillFromMetadata", () => {
  it("loads mcp config from SKILL.md frontmatter", async () => {
    await fs.writeFile(
      join(testDir, "SKILL.md"),
      `---
name: test-skill
description: test
mcp:
  demo:
    command: node
    args:
      - server.js
---

Body`,
    )

    const skill = await loadActivatedSkillFromMetadata({ name: "test-skill", dir: testDir })
    expect(skill?.name).toBe("test-skill")
    expect(skill?.mcpConfig?.demo?.command).toBe("node")
  })

  it("prefers mcp.json over SKILL.md frontmatter", async () => {
    await fs.writeFile(
      join(testDir, "SKILL.md"),
      `---
name: test-skill
description: test
mcp:
  demo:
    command: node
---

Body`,
    )
    await fs.writeFile(join(testDir, "mcp.json"), JSON.stringify({ mcpServers: { demo: { url: "https://example.com/mcp" } } }))

    const skill = await loadActivatedSkillFromMetadata({ name: "test-skill", dir: testDir })
    expect(skill?.mcpConfig?.demo?.url).toBe("https://example.com/mcp")
    expect(skill?.mcpConfig?.demo?.command).toBeUndefined()
  })
})

describe("formatMcpCapabilities", () => {
  it("renders compact capability hints instead of full JSON schema", async () => {
    const output = await formatMcpCapabilities(
      {
        name: "test-skill",
        resolvedPath: testDir,
        mcpConfig: { demo: { command: "node" } },
      },
      {
        listTools: async () => [
          {
            name: "echo",
            description: "Echo a message",
            inputSchema: {
              type: "object",
              properties: {
                message: { type: "string" },
                format: { type: "string" },
              },
              required: ["message"],
            },
          },
        ],
        listResources: async () => [{ uri: "memory://notes", name: "notes", description: "Saved notes" }],
        listPrompts: async () => [
          {
            name: "summarize",
            description: "Summarize text",
            arguments: [{ name: "text", required: true }],
          },
        ],
      } as any,
      "session-1",
    )

    expect(output).toContain("## Skill MCPs")
    expect(output).toContain("Call with `skill_mcp(mcp_name=\"demo\", ...)`.")
    expect(output).toContain("- `echo`: Echo a message Args: message*, format")
    expect(output).toContain("- `memory://notes` (notes): Saved notes")
    expect(output).toContain("- `summarize`: Summarize text Args: text*")
    expect(output).not.toContain("```json")
    expect(output).not.toContain("\"properties\"")
  })
})
