import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { createCleanMcpEnvironment } from "./env-cleaner"
import { registerProcessCleanup, startCleanupTimer } from "./cleanup"
import type { ManagedClient, SkillMcpClientConnectionParams } from "./types"

export async function createStdioClient(params: SkillMcpClientConnectionParams): Promise<Client> {
  const { state, clientKey, info, config } = params

  if (!config.command) {
    throw new Error(`MCP server "${info.serverName}" is configured for stdio but missing 'command' field.`)
  }

  const command = config.command
  const args = config.args ?? []
  const mergedEnv = createCleanMcpEnvironment(config.env)

  registerProcessCleanup(state)

  const transport = new StdioClientTransport({
    command,
    args,
    env: mergedEnv,
    stderr: "ignore",
  })

  const client = new Client(
    { name: `skill-mcp-${info.skillName}-${info.serverName}`, version: "1.0.0" },
    { capabilities: {} },
  )

  try {
    await client.connect(transport)
  } catch (error) {
    try {
      await transport.close()
    } catch {
      // Process may already be terminated
    }

    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Failed to connect to MCP server "${info.serverName}".\n\n` +
        `Command: ${command} ${args.join(" ")}\n` +
        `Reason: ${errorMessage}\n\n` +
        `Hints:\n` +
        `  - Ensure the command is installed and available in PATH\n` +
        `  - Check if the MCP server package exists\n` +
        `  - Verify the args are correct for this server`,
    )
  }

  const managedClient: ManagedClient = {
    client,
    transport,
    skillName: info.skillName,
    lastUsedAt: Date.now(),
    connectionType: "stdio",
  }

  state.clients.set(clientKey, managedClient)
  startCleanupTimer(state)
  return client
}
