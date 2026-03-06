// Filters npm/pnpm/yarn config env vars that break MCP stdio servers in pnpm projects
const EXCLUDED_ENV_PATTERNS: RegExp[] = [
  /^NPM_CONFIG_/i,
  /^npm_config_/,
  /^YARN_/,
  /^PNPM_/,
  /^NO_UPDATE_NOTIFIER$/,
]

export function createCleanMcpEnvironment(
  customEnv: Record<string, string> = {},
): Record<string, string> {
  const cleanEnv: Record<string, string> = {}

  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue
    if (EXCLUDED_ENV_PATTERNS.some((pattern) => pattern.test(key))) continue
    cleanEnv[key] = value
  }

  Object.assign(cleanEnv, customEnv)
  return cleanEnv
}
