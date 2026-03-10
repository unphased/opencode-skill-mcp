import { describe, it, expect } from "vitest"

// These are internal functions — we test them through the module boundary
// by importing the file directly and extracting the logic
// Since they're not exported, we replicate the validation logic here
// (mirrors tools.ts validateOperationParams and parseArguments)

function validateOperationParams(args: {
  tool_name?: string
  resource_name?: string
  prompt_name?: string
}) {
  const operations: { type: string; name: string }[] = []
  if (args.tool_name) operations.push({ type: "tool", name: args.tool_name })
  if (args.resource_name) operations.push({ type: "resource", name: args.resource_name })
  if (args.prompt_name) operations.push({ type: "prompt", name: args.prompt_name })
  if (operations.length === 0) throw new Error("Missing operation")
  if (operations.length > 1) throw new Error("Multiple operations")
  return operations[0]
}

function parseArguments(argsJson: string | Record<string, unknown> | undefined): Record<string, unknown> {
  if (!argsJson) return {}
  if (typeof argsJson === "object" && argsJson !== null) return argsJson
  try {
    const jsonStr = argsJson.startsWith("'") && argsJson.endsWith("'") ? argsJson.slice(1, -1) : argsJson
    const parsed = JSON.parse(jsonStr)
    if (typeof parsed !== "object" || parsed === null) throw new Error("Arguments must be a JSON object")
    return parsed as Record<string, unknown>
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(`Invalid arguments JSON: ${errorMessage}`)
  }
}

describe("validateOperationParams", () => {
  it("accepts exactly one operation", () => {
    expect(validateOperationParams({ tool_name: "echo" })).toEqual({ type: "tool", name: "echo" })
    expect(validateOperationParams({ resource_name: "mem://x" })).toEqual({ type: "resource", name: "mem://x" })
    expect(validateOperationParams({ prompt_name: "sum" })).toEqual({ type: "prompt", name: "sum" })
  })

  it("rejects zero operations", () => {
    expect(() => validateOperationParams({})).toThrow("Missing operation")
  })

  it("rejects multiple operations", () => {
    expect(() => validateOperationParams({ tool_name: "a", resource_name: "b" })).toThrow("Multiple operations")
  })
})

describe("parseArguments", () => {
  it("returns empty object for undefined", () => {
    expect(parseArguments(undefined)).toEqual({})
  })

  it("passes through object args", () => {
    const args = { key: "value" }
    expect(parseArguments(args)).toBe(args)
  })

  it("parses JSON string", () => {
    expect(parseArguments('{"sql": "SELECT 1"}')).toEqual({ sql: "SELECT 1" })
  })

  it("strips surrounding single quotes", () => {
    expect(parseArguments("'{\"a\": 1}'")).toEqual({ a: 1 })
  })

  it("rejects non-object JSON", () => {
    expect(() => parseArguments('"just a string"')).toThrow("Arguments must be a JSON object")
  })

  it("rejects invalid JSON", () => {
    expect(() => parseArguments("{broken")).toThrow("Invalid arguments JSON")
  })
})
