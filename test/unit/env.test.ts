import { describe, it, expect } from "vitest"
import { expandEnvVars, expandEnvVarsInObject } from "../../src/core/env-expander"
import { createCleanMcpEnvironment } from "../../src/core/env-cleaner"
import { getConnectionType } from "../../src/core/connection-type"

describe("expandEnvVars", () => {
  it("expands known env vars", () => {
    process.env.TEST_VAR_XYZ = "hello"
    expect(expandEnvVars("${TEST_VAR_XYZ}")).toBe("hello")
    delete process.env.TEST_VAR_XYZ
  })

  it("uses default value for missing vars", () => {
    delete process.env.MISSING_VAR_ABC
    expect(expandEnvVars("${MISSING_VAR_ABC:-fallback}")).toBe("fallback")
  })

  it("returns empty string for missing var with no default", () => {
    delete process.env.MISSING_VAR_ABC
    expect(expandEnvVars("${MISSING_VAR_ABC}")).toBe("")
  })

  it("leaves non-variable text alone", () => {
    expect(expandEnvVars("plain text")).toBe("plain text")
  })
})

describe("expandEnvVarsInObject", () => {
  it("recursively expands strings in objects", () => {
    process.env.TEST_KEY_123 = "secret"
    const result = expandEnvVarsInObject({
      headers: { Authorization: "Bearer ${TEST_KEY_123}" },
      args: ["--key", "${TEST_KEY_123}"],
    })
    expect(result.headers.Authorization).toBe("Bearer secret")
    expect(result.args[1]).toBe("secret")
    delete process.env.TEST_KEY_123
  })
})

describe("createCleanMcpEnvironment", () => {
  it("excludes npm/pnpm/yarn config vars", () => {
    process.env.NPM_CONFIG_SOMETHING = "bad"
    process.env.npm_config_other = "bad"
    process.env.PNPM_HOME = "bad"
    const env = createCleanMcpEnvironment()
    expect(env.NPM_CONFIG_SOMETHING).toBeUndefined()
    expect(env.npm_config_other).toBeUndefined()
    expect(env.PNPM_HOME).toBeUndefined()
    expect(env.HOME).toBeDefined() // normal vars pass through
    delete process.env.NPM_CONFIG_SOMETHING
    delete process.env.npm_config_other
    delete process.env.PNPM_HOME
  })

  it("merges custom env on top", () => {
    const env = createCleanMcpEnvironment({ CUSTOM_VAR: "yes" })
    expect(env.CUSTOM_VAR).toBe("yes")
  })
})

describe("getConnectionType", () => {
  it("detects stdio from command", () => {
    expect(getConnectionType({ command: "node" })).toBe("stdio")
  })

  it("detects http from url", () => {
    expect(getConnectionType({ url: "https://example.com" })).toBe("http")
  })

  it("explicit type takes precedence", () => {
    expect(getConnectionType({ type: "stdio", url: "https://x.com" })).toBe("stdio")
    expect(getConnectionType({ type: "http", command: "node" })).toBe("http")
    expect(getConnectionType({ type: "sse" })).toBe("http")
  })

  it("returns null for empty config", () => {
    expect(getConnectionType({})).toBeNull()
  })
})
