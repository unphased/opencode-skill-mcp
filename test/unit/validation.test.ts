import { describe, it, expect } from "vitest"
import { validateOperationParams, parseArguments, applyGrepFilter } from "../../src/plugin/tools"

describe("validateOperationParams", () => {
  it("accepts exactly one operation", () => {
    expect(validateOperationParams({ mcp_name: "x", tool_name: "echo" })).toEqual({ type: "tool", name: "echo" })
    expect(validateOperationParams({ mcp_name: "x", resource_name: "mem://x" })).toEqual({
      type: "resource",
      name: "mem://x",
    })
    expect(validateOperationParams({ mcp_name: "x", prompt_name: "sum" })).toEqual({ type: "prompt", name: "sum" })
  })

  it("rejects zero operations", () => {
    expect(() => validateOperationParams({ mcp_name: "x" })).toThrow("Missing operation")
  })

  it("rejects multiple operations", () => {
    expect(() => validateOperationParams({ mcp_name: "x", tool_name: "a", resource_name: "b" })).toThrow(
      "Multiple operations",
    )
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

describe("applyGrepFilter", () => {
  it("returns original output when no pattern", () => {
    expect(applyGrepFilter("hello\nworld", undefined)).toBe("hello\nworld")
  })

  it("filters lines matching pattern", () => {
    expect(applyGrepFilter("foo\nbar\nbaz", "ba")).toBe("bar\nbaz")
  })

  it("is case-insensitive", () => {
    expect(applyGrepFilter("Hello\nworld", "hello")).toBe("Hello")
  })

  it("reports no matches", () => {
    expect(applyGrepFilter("foo\nbar", "xyz")).toContain("No lines matched")
  })

  it("returns original on invalid regex", () => {
    expect(applyGrepFilter("foo", "[invalid")).toBe("foo")
  })
})
