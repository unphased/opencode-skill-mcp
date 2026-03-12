# Standalone Skill-MCP Plugin Plan

## Goal

Build a standalone OpenCode plugin that provides OMO-style skill-based MCP dispatch via skill-local MCP config plus a `skill_mcp` tool, while relying on OpenCode's built-in `skill` tool for skill activation.

This doc is the working tracker and implementation blueprint.

---

## Design Philosophy

The driving idea is to **leverage the existing MCP ecosystem** — reuse community MCP server definitions, existing skill definitions, and open tool catalogs — to quickly integrate "AI-native capabilities" for use under OpenCode.

Building bespoke integrations per-service is unnecessary overhead. Any existing API can be wrapped into a usable MCP with minimal effort. The value of this plugin is not in the MCPs themselves but in the **orchestration layer**: a skill activation pattern that dynamically scopes which MCPs are available, injects their capabilities into the model's context, and provides a unified dispatch surface.

This is a composition pattern — skills as units of MCP orchestration — rather than a new tool framework. Keep it thin: the plugin should add minimal abstraction over what OpenCode's MCP runtime already provides.

---

## Reference Setup

The plan references specific files and line numbers in the OpenCode and OMO source trees. These are shallow clones kept under `opencode/_refs/` for durability (unlike `/tmp/` clones which get nuked on reboot).

### To set up (or refresh) reference clones:

```bash
mkdir -p ~/util/opencode/_refs
git clone --depth 1 https://github.com/anomalyco/opencode ~/util/opencode/_refs/opencode
git clone --depth 1 https://github.com/code-yeongyu/oh-my-opencode ~/util/opencode/_refs/oh-my-opencode
```

### To update to latest:

```bash
git -C ~/util/opencode/_refs/opencode pull --depth 1
git -C ~/util/opencode/_refs/oh-my-opencode pull --depth 1
```

All file paths below are relative to the `_refs/` root. Line numbers were verified against the clones as of 2026-03-06 and may drift — re-verify after pulling.

---

## Current Understanding (Confirmed)

### Core OpenCode MCP (already present)

Core OpenCode already has robust MCP support:

- Config schema for local/remote MCP with headers, OAuth, timeout:
  `opencode/packages/opencode/src/config/config.ts:525`
- Runtime MCP registry/state and client lifecycle:
  `opencode/packages/opencode/src/mcp/index.ts:185`
- Dynamic add/connect/disconnect APIs:
  `opencode/packages/opencode/src/mcp/index.ts:294` (add)
  `opencode/packages/opencode/src/mcp/index.ts:552` (connect)
  `opencode/packages/opencode/src/mcp/index.ts:591` (disconnect)
  `opencode/packages/opencode/src/server/routes/mcp.ts:32`
- MCP tools are exposed to the model each prompt via `MCP.tools()`:
  `opencode/packages/opencode/src/session/prompt.ts:830`

### OMO delta (what we are extracting)

OMO adds a skill-scoped orchestration layer:

- `skill_mcp` dispatcher tool:
  `oh-my-opencode/src/tools/skill-mcp/tools.ts:120`
- MCP manager wrapper (connection cache/retry/reconnect):
  `oh-my-opencode/src/features/skill-mcp-manager/manager.ts:9`
- Transport and cleanup internals:
  `oh-my-opencode/src/features/skill-mcp-manager/connection.ts:10`
  `oh-my-opencode/src/features/skill-mcp-manager/cleanup.ts:17`
- Skill MCP config discovery (`mcp.json` + frontmatter):
  `oh-my-opencode/src/features/opencode-skill-loader/skill-mcp-config.ts:6`
  `oh-my-opencode/src/features/opencode-skill-loader/loaded-skill-from-path.ts:11`
- Skill output capability rendering:
  `oh-my-opencode/src/tools/skill/tools.ts:114`

---

## Scope

### MVP

1. Skill loader with MCP discovery (`mcp.json` and optional frontmatter `mcp`)
2. Compatibility with OpenCode's built-in `skill` tool so skill content can reference MCP servers discovered by this plugin
3. `skill_mcp` tool with operation modes:
   - `tool_name`
   - `resource_name`
   - `prompt_name`
4. MCP dispatch manager with:
   - lazy connection creation (connect on first call, not on skill activation)
   - pending connection dedupe
   - reconnect-on-disconnect retry
   - idle cleanup
5. No OAuth step-up in MVP (header/env auth only)

### V2

1. Progressive MCP schema disclosure (see design section below)
2. OAuth provider + step-up handling
3. Richer telemetry/circuit-breakers/rate limiting
4. Persisted token/session auth state

---

## Proposed Architecture

### Single package: `opencode-skill-mcp`

One package with internal module boundaries. Split into separate packages only if reuse demands it later.

Internal structure:

```
opencode-skill-mcp/
  src/
    core/              # transport-agnostic dispatch
      dispatcher.ts    # McpDispatcher.dispatch({ mcpName, op, args })
      connection.ts    # connection pool + cleanup + retries
      stdio-client.ts  # stdio transport adapter
      http-client.ts   # http transport adapter (header auth only)
      env-cleaner.ts   # env hygiene for stdio subprocesses
      cleanup.ts       # idle timeout + process cleanup
    plugin/            # OpenCode integration
      tools.ts         # skill_mcp registration + shared validation helpers
      registry.ts      # skill loading, active-skill context
      capabilities.ts  # capability formatting for model context
      config.ts        # mcp.json + frontmatter parsing
    index.ts           # plugin entry point
```

### Core interfaces

- `SkillRegistry.resolveServer(mcpName)`
- `SkillRegistry.listLoadedSkills()`
- `SessionProvider.getSessionID()`
- `McpDispatcher.dispatch({ mcpName, op, args })`
- `AuthProvider` (optional/no-op by default in MVP)

---

## Tactical Extraction Map

### Candidate files to re-implement first (behavioral parity)

- `skill_mcp` contract and validation:
  `oh-my-opencode/src/tools/skill-mcp/tools.ts`
- manager API shape:
  `oh-my-opencode/src/features/skill-mcp-manager/manager.ts`
- connection lifecycle:
  `oh-my-opencode/src/features/skill-mcp-manager/connection.ts`
- stdio/http transports:
  `oh-my-opencode/src/features/skill-mcp-manager/stdio-client.ts`
  `oh-my-opencode/src/features/skill-mcp-manager/http-client.ts`
- cleanup strategy:
  `oh-my-opencode/src/features/skill-mcp-manager/cleanup.ts`
- env hygiene for stdio:
  `oh-my-opencode/src/features/skill-mcp-manager/env-cleaner.ts`
- skill MCP config parse semantics:
  `oh-my-opencode/src/features/opencode-skill-loader/skill-mcp-config.ts`

### Expected adaptation points

1. Replace OMO-specific tool builder and plugin context wiring
2. Replace OMO `LoadedSkill` type with standalone `SkillDefinition`
3. Replace OMO session-id source with plugin session provider
4. Skip/remove OAuth coupling from manager in MVP
5. Align transport config to OpenCode MCP config schema where practical

---

## Progressive MCP Schema Disclosure (V2 Design)

### Problem

When `skill(name=...)` is invoked, OMO calls `listTools()`, `listResources()`, `listPrompts()` for every configured server and appends a large `## Available MCP Servers` section including each tool's full `inputSchema` JSON. This is the dominant token cost.

Downsides:
- High token overhead (especially if a skill points at a large server/toolset)
- Worse attention budget for actual task content
- Hard to reason about what the model really sees (too much noise)

### Principle

The host can fetch large catalogs and schemas, but **should not emit them into the model prompt** unless needed. Progressive disclosure is primarily a **client-side retrieval + selective emission** strategy (MCP `tools/list` supports pagination but not server-side filtering).

### Preferred pattern: discovery + JIT schema

Expose meta tools instead of the full MCP tool inventory.

#### `skill_mcp_search` (discovery)

Return lite candidate tools from a hidden catalog.

**Input:**
```json
{
  "query": "Find real-world code examples of Next.js middleware auth",
  "limit": 5,
  "mcp_names": ["grep_app", "websearch", "context7"],
  "filters": { "language": ["TypeScript", "TSX"], "mode": "code_examples" }
}
```

**Output:**
```json
{
  "candidates": [
    { "mcp_name": "grep_app", "tool_name": "searchGitHub", "score": 0.9, "why": "literal code search" },
    { "mcp_name": "websearch", "tool_name": "web_search_exa", "score": 0.6, "why": "articles/issues" }
  ]
}
```

#### `skill_mcp_get_schema` (JIT schema)

Return only the selected tool's schema or args template.

```json
{ "mcp_name": "grep_app", "tool_name": "searchGitHub" }
```

#### Execution strategies

1. **Tool list expansion** (preferred): after selection, dynamically inject the specific tool schema into the session's available tools for subsequent turns.
2. **Proxy execution** (simpler): keep a single generic executor tool and have the model call `execute(mcp_name, tool_name, arguments)`, validated against the cached schema at runtime.

### Catalog building (host-side)

- On-demand, per `(sessionID, skillName, mcp_name)`:
  - Call `listTools()` (paginate when available) and cache:
    - `tool.name`, `tool.description`
    - optional `tool.annotations` (if present)
    - optional `tool.inputSchema` (cached, not emitted)

### Ranking

- Start with lightweight scorer: lexical match on name/description, small heuristics
- Known limitation: hardcoded heuristics (e.g. "docs" → context7) will be brittle; treat as bootstrap only
- Optionally evolve to embeddings/vector search over tool metadata

### Evaluation metrics

- Prompt/tool payload size before/after (tokens or bytes)
- Tool selection accuracy (did the model pick the right tool?)
- Argument correctness (did calls validate on first try?)
- Latency (catalog fetch cost vs. up-front cost)

---

## Work Tracker

Status legend: `pending` | `in_progress` | `partial` | `blocked` | `done`

| ID  | Task                                                                      | Status  | Notes                                                |
| --- | ------------------------------------------------------------------------- | ------- | ---------------------------------------------------- |
| T1  | Create standalone plugin skeleton (`opencode-skill-mcp`)                  | done    | package, core/, plugin/, tests, build wiring exist   |
| T2  | Implement skill registry and MCP config parsing (`mcp.json`, frontmatter) | done    | session-scoped registry; `mcp.json` still wins       |
| T3  | Integrate with OpenCode built-in `skill` flow and capability rendering    | done    | hooked via `tool.execute.after` on built-in `skill`  |
| T4  | Implement core manager: get/create client, dedupe pending connects        | done    | session+skill+server cache key implemented           |
| T5  | Implement stdio transport adapter with clean env and lifecycle cleanup    | done    | includes idle cleanup and process cleanup hooks      |
| T6  | Implement http transport adapter (header-based auth only)                 | done    | HTTP transport works; OAuth still intentionally out  |
| T7  | Implement `skill_mcp` dispatcher tool contract and JSON args parsing      | done    | tool/resource/prompt modes implemented               |
| T8  | Integrate with OpenCode runtime tool exposure and permissions             | done    | plugin glue covered by unit tests; OpenCode CLI harness verifies runtime tool exposure |
| T9  | Add retry/reconnect/error-shaping behavior tests                          | done    | manager/unit coverage now exercises retry behavior   |
| T10 | Integration test with sample skill and sample MCP servers                 | done    | stdio covered in OpenCode CLI harness; remote HTTP covered in local transport integration test |
| T11 | Author docs: install, usage, skill format, troubleshooting                | done    | README added                                         |

### Current Completion Summary

- MVP implementation: complete for the intended OMO-style skill activation flow
- Automated verification: strong across unit coverage, plugin glue, transport behavior, and OpenCode CLI/plugin loading
- Remaining validation: provider-connected `skill -> skill_mcp` execution inside a live OpenCode session

### Next Iteration Targets

1. Run the provider-connected manual verification steps below in a normal OpenCode environment
2. Only reopen V2 work if the compact appendix still proves too expensive in real usage

---

## Key Failure Modes to Guard

1. client key collisions across sessions/skills causing cross-context leakage
2. duplicate concurrent connect attempts creating orphan clients
3. retrying non-idempotent tool calls too aggressively
4. hanging stdio subprocesses without timeouts/cancellation
5. unbounded result size causing memory/token blowups
6. stale capability listing after reconnect
7. poor error messages when server config is malformed

---

## Verification Plan

### Unit

- operation validation (exactly one of tool/resource/prompt)
- JSON argument parsing and malformed input behavior
- connection cache keying and pending dedupe behavior
- cleanup timer behavior and disconnect flows

### Integration

- stdio MCP happy path + crash/restart path
- remote MCP happy path + timeout/reconnect path
- capability listing correctness for tools/resources/prompts
- OpenCode built-in `skill` -> `skill_mcp` flow end-to-end in one session

### Manual checks

- Load skill and verify capability section appears
- Invoke `skill_mcp` with each operation type
- Confirm tool visibility refreshes on subsequent prompts
- Confirm disconnect cleanup leaves no orphan process

### Manual checks still useful in a provider-connected environment

1. From the repo root, run `npm run test:integration`
2. In a normal OpenCode session, ask the model to load `test-skill`
3. Confirm the loaded skill output includes `## Skill MCPs`
4. Ask the model to call:
   `skill_mcp(mcp_name="echo-test", tool_name="echo", arguments={"message":"manual-check"})`
5. Confirm the response includes `Echo: manual-check`
6. Repeat with the `add` tool and confirm the numeric result

### Debugging reference

```bash
opencode --log-level DEBUG --print-logs
```

Useful built-ins:
- `opencode debug paths` (find log dir)
- `opencode debug config` (resolved config; includes agent prompts/plugins)
- `opencode debug agent <name>` (agent prompt + tool permissions)
- `opencode debug skill` (discovered skills)
- `opencode export <sessionID>` (replayable session artifact)

Tool outputs may be truncated to: `~/.local/share/opencode/tool-output/`
OMO logs: `/tmp/oh-my-opencode.log`

---

## Open Questions (Track Until Closed)

1. ~~Best place to persist loaded-skill state: per-session only or global runtime cache?~~ **Closed: per-session only.**
2. ~~Should skill activation auto-connect all declared MCPs, or lazy-connect on first call?~~ **Closed: skill activation may inspect capabilities, but execution remains scoped to the currently loaded skill session.**
3. ~~Naming strategy for tool collisions across same `mcp_name` from different skills?~~ **Closed: most recently loaded skill wins within a session.**
4. ~~Should progressive disclosure be a new tool (`skill_mcp_search`) or an optional mode on OpenCode's built-in `skill` flow (e.g., `mcp_detail=none|lite|full`)?~~ **Closed for MVP: compact appendix on built-in `skill` output; no extra search tool.**
5. ~~Persistent catalog cache (across sessions) or session-only?~~ **Closed for MVP: session-only behavior.**
6. ~~How to present provenance to the model (why a tool was suggested) without bloating context?~~ **Closed for MVP: compact appendix with server-scoped capability hints only.**
7. ~~Where will the new repo live?~~ **Closed: standalone repo at `unphased/opencode-skill-mcp`.**

---

## Immediate Next Step

Start T1/T2/T7 in parallel:

- T1: plugin skeleton with `core/` and `plugin/` internal structure
- T2: skill config parsing + registry
- T7: `skill_mcp` args contract + dispatcher shell

Then integrate into T3/T4.
