import type { ConnectionType, McpServerConfig } from "./types"

/**
 * Determines connection type from MCP server configuration.
 * Priority: explicit type field > url presence > command presence
 */
export function getConnectionType(config: McpServerConfig): ConnectionType | null {
  if (config.type === "http" || config.type === "sse") return "http"
  if (config.type === "stdio") return "stdio"
  if (config.url) return "http"
  if (config.command) return "stdio"
  return null
}
