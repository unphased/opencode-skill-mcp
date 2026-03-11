import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // Use the default (node) environment but resolve .js extensions for ESM packages
    // that omit them (like @opencode-ai/plugin)
    alias: {
      "@opencode-ai/plugin": "@opencode-ai/plugin/tool",
    },
  },
})
