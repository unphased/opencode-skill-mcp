import type { Client } from "@modelcontextprotocol/sdk/client/index.js"
import type { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import type { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"

// MCP server config — compatible with both OpenCode and claude_desktop_config.json format
export interface McpServerConfig {
  type?: "http" | "sse" | "stdio"
  url?: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  headers?: Record<string, string>
  disabled?: boolean
}

export type SkillMcpConfig = Record<string, McpServerConfig>

export interface SkillMcpClientInfo {
  serverName: string
  skillName: string
  sessionID: string
}

export interface SkillMcpServerContext {
  config: McpServerConfig
  skillName: string
}

export type ConnectionType = "stdio" | "http"

interface ManagedClientBase {
  client: Client
  skillName: string
  lastUsedAt: number
  connectionType: ConnectionType
}

export interface ManagedStdioClient extends ManagedClientBase {
  connectionType: "stdio"
  transport: StdioClientTransport
}

export interface ManagedHttpClient extends ManagedClientBase {
  connectionType: "http"
  transport: StreamableHTTPClientTransport
}

export type ManagedClient = ManagedStdioClient | ManagedHttpClient

export interface ProcessCleanupHandler {
  signal: NodeJS.Signals
  listener: () => void
}

export interface SkillMcpManagerState {
  clients: Map<string, ManagedClient>
  pendingConnections: Map<string, Promise<Client>>
  cleanupRegistered: boolean
  cleanupInterval: ReturnType<typeof setInterval> | null
  cleanupHandlers: ProcessCleanupHandler[]
  idleTimeoutMs: number
}

export interface SkillMcpClientConnectionParams {
  state: SkillMcpManagerState
  clientKey: string
  info: SkillMcpClientInfo
  config: McpServerConfig
}
