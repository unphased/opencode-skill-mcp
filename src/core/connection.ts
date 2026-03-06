import type { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { expandEnvVarsInObject } from "./env-expander"
import { forceReconnect } from "./cleanup"
import { getConnectionType } from "./connection-type"
import { createHttpClient } from "./http-client"
import { createStdioClient } from "./stdio-client"
import type { McpServerConfig, SkillMcpClientConnectionParams, SkillMcpClientInfo, SkillMcpManagerState } from "./types"

export async function getOrCreateClient(params: {
  state: SkillMcpManagerState
  clientKey: string
  info: SkillMcpClientInfo
  config: McpServerConfig
}): Promise<Client> {
  const { state, clientKey, info, config } = params

  const existing = state.clients.get(clientKey)
  if (existing) {
    existing.lastUsedAt = Date.now()
    return existing.client
  }

  // Dedupe: if a connection is already in progress, wait for it
  const pending = state.pendingConnections.get(clientKey)
  if (pending) return pending

  const expandedConfig = expandEnvVarsInObject(config)
  const connectionPromise = createClient({ state, clientKey, info, config: expandedConfig })
  state.pendingConnections.set(clientKey, connectionPromise)

  try {
    return await connectionPromise
  } finally {
    state.pendingConnections.delete(clientKey)
  }
}

export async function getOrCreateClientWithRetry(params: {
  state: SkillMcpManagerState
  clientKey: string
  info: SkillMcpClientInfo
  config: McpServerConfig
}): Promise<Client> {
  try {
    return await getOrCreateClient(params)
  } catch (error) {
    const didReconnect = await forceReconnect(params.state, params.clientKey)
    if (!didReconnect) throw error
    return await getOrCreateClient(params)
  }
}

async function createClient(params: SkillMcpClientConnectionParams): Promise<Client> {
  const { info, config } = params
  const connectionType = getConnectionType(config)

  if (!connectionType) {
    throw new Error(
      `MCP server "${info.serverName}" has no valid connection configuration.\n\n` +
        `Must specify either:\n` +
        `  - A URL for HTTP connection (remote MCP server)\n` +
        `  - A command for stdio connection (local MCP process)\n\n` +
        `Examples:\n` +
        `  HTTP:  { "url": "https://mcp.example.com/mcp", "headers": { "Authorization": "Bearer $\{API_KEY}" } }\n` +
        `  Stdio: { "command": "npx", "args": ["-y", "@some/mcp-server"] }`,
    )
  }

  if (connectionType === "http") {
    return await createHttpClient(params)
  }
  return await createStdioClient(params)
}
