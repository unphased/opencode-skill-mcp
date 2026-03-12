import { randomUUID } from "node:crypto"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { afterEach, describe, expect, it } from "vitest"
import { z } from "zod"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js"
import { SkillMcpManager } from "../../src/core/manager"

type StartedHttpMcpServer = {
  close: () => Promise<void>
  url: string
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  if (chunks.length === 0) return undefined
  return JSON.parse(Buffer.concat(chunks).toString("utf8"))
}

async function startHttpMcpServer(): Promise<StartedHttpMcpServer> {
  const transports: StreamableHTTPServerTransport[] = []
  const transportBySessionID = new Map<string, StreamableHTTPServerTransport>()

  const createMcpServer = () => {
    const server = new McpServer({ name: "http-test", version: "1.0.0" })

    server.registerTool(
      "echo-http",
      {
        description: "Echo over HTTP",
        inputSchema: {
          message: z.string(),
        },
      },
      async ({ message }) => ({
        content: [{ type: "text", text: `Echo HTTP: ${message}` }],
      }),
    )

    return server
  }

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.url !== "/mcp" || req.method !== "POST") {
      res.statusCode = 405
      res.end("Method Not Allowed")
      return
    }

    try {
      const body = await readJsonBody(req)
      const sessionID = typeof req.headers["mcp-session-id"] === "string" ? req.headers["mcp-session-id"] : undefined

      let transport = sessionID ? transportBySessionID.get(sessionID) : undefined

      if (!transport && isInitializeRequest(body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          enableJsonResponse: true,
          onsessioninitialized: (newSessionID) => {
            transportBySessionID.set(newSessionID, transport!)
          },
        })
        transports.push(transport)
        const server = createMcpServer()
        await server.connect(transport)
      }

      if (!transport) {
        res.statusCode = 400
        res.setHeader("content-type", "application/json")
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message: "Bad Request: No valid session ID provided",
            },
            id: null,
          }),
        )
        return
      }

      await transport.handleRequest(req, res, body)
    } catch (error) {
      res.statusCode = 500
      res.setHeader("content-type", "application/json")
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : String(error),
          },
          id: null,
        }),
      )
    }
  })

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject)
    httpServer.listen(0, "127.0.0.1", () => resolve())
  })

  const address = httpServer.address()
  if (!address || typeof address === "string") {
    throw new Error("Failed to determine HTTP MCP server address")
  }

  return {
    url: `http://127.0.0.1:${address.port}/mcp`,
    close: async () => {
      for (const transport of transports) {
        await transport.close().catch(() => {})
      }
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => {
          if (error) reject(error)
          else resolve()
        })
      })
    },
  }
}

const serversToClose: StartedHttpMcpServer[] = []

afterEach(async () => {
  while (serversToClose.length > 0) {
    await serversToClose.pop()!.close()
  }
})

describe("HTTP MCP transport", () => {
  it("lists tools and calls a tool over streamable HTTP", async () => {
    let server: StartedHttpMcpServer
    try {
      server = await startHttpMcpServer()
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "EPERM") {
        return
      }
      throw error
    }
    serversToClose.push(server)

    const manager = new SkillMcpManager()
    const info = {
      serverName: "remote-http",
      skillName: "test-skill",
      sessionID: "session-http",
    }
    const context = {
      config: { url: server.url },
      skillName: "test-skill",
    }

    const tools = await manager.listTools(info, context)
    expect(tools.map((tool) => tool.name)).toContain("echo-http")

    const result = await manager.callTool(info, context, "echo-http", { message: "hello" })
    expect(result).toEqual([{ type: "text", text: "Echo HTTP: hello" }])

    expect(manager.isConnected(info)).toBe(true)
    await manager.disconnectAll()
  })
})
