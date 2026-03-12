# opencode-skill-mcp

OpenCode plugin that replicates OMO-style dynamic skill MCP loading with a minimal surface:

- the model sees OpenCode's built-in lightweight `skill` catalog first
- when a skill is loaded, this plugin inspects that skill's MCP config
- the loaded skill gets a compact MCP appendix describing available servers and how to call them
- `skill_mcp` can only access MCP servers from skills loaded in the current session

## Status

Core behavior is implemented:

- built-in `skill` integration via plugin hook
- session-scoped skill MCP activation
- stdio and HTTP MCP client support
- compact capability rendering instead of full schema dumps
- unit and CLI integration coverage

Still limited:

- end-to-end model-driven dispatch tests depend on provider availability
- full OpenCode-provider end-to-end coverage is still only automated for the local stdio fixture
- remote HTTP MCP coverage exists at the transport layer, not yet through an OpenCode session harness

## Install

Add the plugin to `opencode.json`:

```json
{
  "plugin": ["file:///absolute/path/to/opencode-skill-mcp/dist/index.js"]
}
```

For local development, pointing at `src/index.ts` also works if your OpenCode setup transpiles local plugin sources.

## Skill Format

Use normal OpenCode `SKILL.md` files. The plugin reads MCP config from either:

- `mcp.json` in the skill directory
- `mcp:` frontmatter in `SKILL.md`

`mcp.json` takes precedence.

Example directory:

```text
.opencode/skills/test-skill/
  SKILL.md
  mcp.json
```

Example `SKILL.md`:

```md
---
name: test-skill
description: Example skill with MCP access
---

Use `skill_mcp` after this skill is loaded.
```

Example `mcp.json`:

```json
{
  "mcpServers": {
    "echo-test": {
      "command": "bun",
      "args": ["run", "./echo-server.ts"]
    }
  }
}
```

Flat `mcp.json` also works:

```json
{
  "echo-test": {
    "command": "bun",
    "args": ["run", "./echo-server.ts"]
  }
}
```

Remote HTTP example:

```json
{
  "mcpServers": {
    "remote-docs": {
      "url": "https://example.com/mcp",
      "headers": {
        "Authorization": "Bearer ${API_KEY}"
      }
    }
  }
}
```

## Usage

1. Let the model discover skills through OpenCode's built-in `skill` tool.
2. Load the relevant skill.
3. The loaded skill output will include a compact `## Skill MCPs` appendix.
4. Call `skill_mcp` using one server from that appendix.

Examples:

```text
Load the "test-skill" skill.
```

```text
Use skill_mcp to call mcp_name="echo-test", tool_name="echo", arguments={"message":"hello"}.
```

Supported `skill_mcp` modes:

- `tool_name`
- `resource_name`
- `prompt_name`

Exactly one of those must be provided.

## Development

Build:

```bash
npm run build
```

Run unit tests:

```bash
npm test
```

Run CLI integration checks:

```bash
npm run test:integration
```

## Troubleshooting

If `skill_mcp` says the server was not found:

- confirm the skill was loaded in the current session
- confirm the skill directory contains `SKILL.md`
- confirm `mcp.json` or `mcp:` frontmatter defines the expected `mcp_name`

If OpenCode integration tests fail with a provider error:

- the local plugin path may still be fine
- the current harness skips model-driven checks when the configured provider is unreachable

Useful commands:

```bash
opencode debug config
opencode debug skill
opencode --print-logs --log-level DEBUG
```
