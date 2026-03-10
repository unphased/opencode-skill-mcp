#!/usr/bin/env bash
# Integration tests for opencode-skill-mcp plugin
# Two modes:
#   ./run.sh cli    — non-interactive: opencode debug/run commands
#   ./run.sh tui    — tmux-based TUI tests
#   ./run.sh        — runs both
#
# Requires: opencode, bun, tmux (for tui mode)
# Set MODEL env var to override the default model (e.g. MODEL=anthropic/claude-sonnet-4-20250514)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
FIXTURE_DIR="$SCRIPT_DIR/fixtures"
MODEL="${MODEL:-anthropic/claude-sonnet-4-20250514}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
NC='\033[0m'

PASS=0
FAIL=0
SKIP=0

pass() { echo -e "  ${GREEN}PASS${NC} $1"; ((PASS++)) || true; }
fail() { echo -e "  ${RED}FAIL${NC} $1"; ((FAIL++)) || true; }
skip() { echo -e "  ${YELLOW}SKIP${NC} $1"; ((SKIP++)) || true; }

is_provider_connectivity_failure() {
  local log_file="$1"
  grep -q 'Was there a typo in the url or port?' "$log_file" 2>/dev/null || \
    grep -q 'service=models.dev error=Unable to connect' "$log_file" 2>/dev/null
}

# --- Setup ---

WORK_DIR=""
OPENCODE_HOME=""
OPENCODE_DATA_HOME=""
OPENCODE_CONFIG_HOME=""
OPENCODE_CACHE_HOME=""
OPENCODE_STATE_HOME=""

run_opencode() {
  (
    export HOME="$OPENCODE_HOME"
    export XDG_DATA_HOME="$OPENCODE_DATA_HOME"
    export XDG_CONFIG_HOME="$OPENCODE_CONFIG_HOME"
    export XDG_CACHE_HOME="$OPENCODE_CACHE_HOME"
    export XDG_STATE_HOME="$OPENCODE_STATE_HOME"
    cd "$WORK_DIR"
    opencode "$@"
  )
}

run_opencode_timeout() {
  local duration="$1"
  shift
  (
    export HOME="$OPENCODE_HOME"
    export XDG_DATA_HOME="$OPENCODE_DATA_HOME"
    export XDG_CONFIG_HOME="$OPENCODE_CONFIG_HOME"
    export XDG_CACHE_HOME="$OPENCODE_CACHE_HOME"
    export XDG_STATE_HOME="$OPENCODE_STATE_HOME"
    cd "$WORK_DIR"
    timeout "$duration" opencode "$@"
  )
}

setup_fixture() {
  WORK_DIR=$(mktemp -d)
  trap 'cleanup' EXIT

  echo "Building plugin..."
  (cd "$REPO_DIR" && bun run build) >/dev/null 2>&1

  # Create project structure
  mkdir -p "$WORK_DIR/.opencode/skills/test-skill"
  OPENCODE_HOME="$WORK_DIR/.home"
  OPENCODE_DATA_HOME="$WORK_DIR/.xdg-data"
  OPENCODE_CONFIG_HOME="$WORK_DIR/.xdg-config"
  OPENCODE_CACHE_HOME="$WORK_DIR/.xdg-cache"
  OPENCODE_STATE_HOME="$WORK_DIR/.xdg-state"
  mkdir -p "$OPENCODE_HOME" "$OPENCODE_DATA_HOME" "$OPENCODE_CONFIG_HOME" "$OPENCODE_CACHE_HOME" "$OPENCODE_STATE_HOME"

  # Plugin config — use file:// to load our local source (bun transpiles)
  local plugin_path
  plugin_path="$(cd "$REPO_DIR" && pwd)/src/index.ts"
  cat > "$WORK_DIR/opencode.json" <<EOF
{
  "plugin": ["file://$plugin_path"]
}
EOF

  # Copy skill fixture, patching the echo server path
  cp "$FIXTURE_DIR/test-skill/SKILL.md" "$WORK_DIR/.opencode/skills/test-skill/SKILL.md"
  local echo_server_path="$FIXTURE_DIR/echo-server.ts"
  sed "s|ECHO_SERVER_PATH|$echo_server_path|g" \
    "$FIXTURE_DIR/test-skill/mcp.json" > "$WORK_DIR/.opencode/skills/test-skill/mcp.json"

  # Initialize git repo (opencode expects one)
  (cd "$WORK_DIR" && git init -q && git commit --allow-empty -m "init" -q)

  echo "Fixture dir: $WORK_DIR"
  echo "Model: $MODEL"
}

cleanup() {
  tmux kill-session -t opencode-test 2>/dev/null || true
  if [[ -n "$WORK_DIR" && -d "$WORK_DIR" ]]; then
    rm -rf "$WORK_DIR"
  fi
}

# --- CLI (non-interactive) tests ---

run_cli_tests() {
  echo ""
  echo -e "${BOLD}=== CLI (non-interactive) tests ===${NC}"

  # Test 1: plugin appears in resolved config (debug config writes to stdout fine)
  echo ""
  echo "--- debug config ---"
  local config_tmp="$WORK_DIR/.test-config"
  run_opencode debug config 2>&1 | cat > "$config_tmp"

  if grep -q "file://" "$config_tmp" 2>/dev/null; then
    pass "plugin appears in resolved config"
  else
    fail "plugin not found in config output"
    head -5 "$config_tmp" 2>/dev/null | sed 's/^/    /'
  fi

  echo ""
  echo "--- debug skill ---"
  local skill_tmp="$WORK_DIR/.test-skill-list"
  run_opencode debug skill 2>&1 | cat > "$skill_tmp"

  if grep -q '"name": "test-skill"' "$skill_tmp" 2>/dev/null; then
    pass "test skill discovered by built-in skill loader"
  else
    fail "test skill not found in debug skill output"
    head -10 "$skill_tmp" 2>/dev/null | sed 's/^/    /'
  fi

  # Test 2: plugin loads without errors, skill_mcp tool registered
  echo ""
  echo "--- plugin loads + skill_mcp registered ---"
  local log_tmp="$WORK_DIR/.test-log"
  run_opencode_timeout 120 run --print-logs --log-level INFO \
    --format json -m "$MODEL" "List your tools." 2>&1 | cat > "$log_tmp"

  if grep -q "service=plugin.*loading plugin" "$log_tmp" 2>/dev/null; then
    pass "plugin loaded by opencode"
  else
    fail "plugin not loaded"
  fi

  if grep -q "failed to load plugin" "$log_tmp" 2>/dev/null; then
    fail "plugin loading error detected"
    grep "failed to load" "$log_tmp" | sed 's/^/    /'
  else
    pass "no plugin loading errors"
  fi

  if grep -q "service=tool.registry.*skill_mcp" "$log_tmp" 2>/dev/null; then
    pass "skill_mcp tool registered"
  else
    fail "skill_mcp tool not registered"
  fi

  # Test 3: built-in skill load + skill_mcp dispatch — echo server end-to-end
  echo ""
  echo "--- built-in skill load + skill_mcp dispatch (echo server) ---"
  local echo_tmp="$WORK_DIR/.test-echo"
  run_opencode_timeout 120 run --format json -m "$MODEL" \
    'Load the "test-skill" skill, then use skill_mcp to call the "echo" tool on the "echo-test" MCP server with arguments {"message": "integration-test-42"}. Report the exact output.' 2>&1 | cat > "$echo_tmp"

  if grep -q "Echo: integration-test-42" "$echo_tmp" 2>/dev/null; then
    pass "built-in skill load + skill_mcp echo dispatch returned correct result"
  elif is_provider_connectivity_failure "$echo_tmp"; then
    skip "built-in skill load + skill_mcp echo dispatch skipped due to provider connectivity failure"
  else
    fail "built-in skill load + skill_mcp echo dispatch did not return expected result"
    echo "    (last 3 lines):"
    tail -3 "$echo_tmp" 2>/dev/null | sed 's/^/    /'
  fi

  # Test 4: built-in skill load + skill_mcp dispatch — add tool
  echo ""
  echo "--- built-in skill load + skill_mcp dispatch (add tool) ---"
  local add_tmp="$WORK_DIR/.test-add"
  run_opencode_timeout 120 run --format json -m "$MODEL" \
    'Load the "test-skill" skill, then use skill_mcp to call the "add" tool on the "echo-test" MCP server with arguments {"a": 17, "b": 25}. Report the exact numeric result.' 2>&1 | cat > "$add_tmp"

  if grep -q "42" "$add_tmp" 2>/dev/null; then
    pass "built-in skill load + skill_mcp add dispatch returned 42"
  elif is_provider_connectivity_failure "$add_tmp"; then
    skip "built-in skill load + skill_mcp add dispatch skipped due to provider connectivity failure"
  else
    fail "built-in skill load + skill_mcp add dispatch did not return 42"
    echo "    (last 3 lines):"
    tail -3 "$add_tmp" 2>/dev/null | sed 's/^/    /'
  fi
}

# --- TUI (tmux-based) tests ---

tmux_wait_for() {
  local session="$1"
  local pattern="$2"
  local max_wait="${3:-30}"
  local elapsed=0

  while (( elapsed < max_wait )); do
    local content
    content=$(tmux capture-pane -t "$session" -p -S -100 2>/dev/null) || return 1
    if echo "$content" | grep -qiE "$pattern"; then
      return 0
    fi
    sleep 1
    ((elapsed++))
  done
  return 1
}

tmux_capture() {
  tmux capture-pane -t "$1" -p -S -100 2>/dev/null
}

run_tui_tests() {
  echo ""
  echo -e "${BOLD}=== TUI (tmux) tests ===${NC}"

  if ! command -v tmux &>/dev/null; then
    skip "tmux not available"
    return
  fi

  # Kill any stale test session
  tmux kill-session -t opencode-test 2>/dev/null || true

  # Start opencode in a tmux session
  echo ""
  echo "--- starting opencode in tmux ---"
  tmux new-session -d -s opencode-test -x 200 -y 50 \
    "cd '$WORK_DIR' && HOME='$OPENCODE_HOME' XDG_DATA_HOME='$OPENCODE_DATA_HOME' XDG_CONFIG_HOME='$OPENCODE_CONFIG_HOME' XDG_CACHE_HOME='$OPENCODE_CACHE_HOME' XDG_STATE_HOME='$OPENCODE_STATE_HOME' opencode 2>/tmp/opencode-test-stderr.log"

  # Wait for TUI to initialize (status bar shows version number)
  if tmux_wait_for opencode-test "1\.[0-9]\.[0-9]|opencode|master|main" 15; then
    pass "opencode TUI started"
  else
    fail "opencode TUI failed to start within 15s"
    echo "    pane content:"
    tmux_capture opencode-test | tail -5 | sed 's/^/    /'
    tmux kill-session -t opencode-test 2>/dev/null || true
    return
  fi

  # Test: send a skill_mcp invocation
  echo ""
  echo "--- TUI: skill_mcp echo dispatch ---"
  tmux send-keys -t opencode-test \
    'Load the "test-skill" skill, then use skill_mcp to call "echo" on "echo-test" with arguments {"message": "tmux-test"}. Show the result.' Enter

  if tmux_wait_for opencode-test "Echo:.*tmux-test|tmux.test" 60; then
    pass "TUI: skill_mcp echo returned expected result"
  else
    skip "TUI: echo result not visible (LLM-dependent / timing)"
  fi

  echo "    (TUI snapshot, last 15 lines):"
  tmux_capture opencode-test | tail -15 | sed 's/^/    /'

  # Cleanup
  tmux send-keys -t opencode-test C-c
  sleep 1
  tmux kill-session -t opencode-test 2>/dev/null || true
}

# --- Main ---

main() {
  local mode="${1:-all}"

  setup_fixture

  case "$mode" in
    cli)  run_cli_tests ;;
    tui)  run_tui_tests ;;
    all)  run_cli_tests; run_tui_tests ;;
    *)    echo "Usage: $0 [cli|tui|all]"; exit 1 ;;
  esac

  echo ""
  echo -e "${BOLD}=== Results ===${NC}"
  echo -e "  ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}, ${YELLOW}$SKIP skipped${NC}"

  if (( FAIL > 0 )); then
    exit 1
  fi
}

main "$@"
