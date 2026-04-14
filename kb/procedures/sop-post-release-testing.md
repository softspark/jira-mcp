---
title: "SOP: Post-Release Testing"
category: procedures
service: jira-mcp
tags: [sop, verification, release, smoke-test, install, qa, post-release]
version: "1.0.0"
created: "2026-04-13"
last_updated: "2026-04-14"
description: "End-to-end smoke test after publishing a new @softspark/jira-mcp release — npm install verification, CLI smoke tests, MCP server verification, and cleanup."
---

# SOP: Post-Release Testing

End-to-end smoke test after publishing a new `@softspark/jira-mcp` release.
Verifies all critical paths from the user's perspective.

**Run this SOP after:**
- The [Release Creation SOP](sop-release.md) completes and CI publishes to npm
- `npm view @softspark/jira-mcp version` returns the expected version

**Prerequisites:**
- Node.js >= 18
- npm CLI access
- The target version has been published to npm

**Time:** 5-10 minutes

---

## Quick Checklist (TL;DR)

```bash
VERSION="X.Y.Z"
npm install -g @softspark/jira-mcp@$VERSION
jira-mcp --version
jira-mcp --help
TMPDIR=$(mktemp -d) && cd $TMPDIR
jira-mcp config init
jira-mcp config add-project TEST https://test.atlassian.net
jira-mcp config list-projects
echo '{}' | timeout 5 jira-mcp serve || true
cd - && rm -rf $TMPDIR
npm uninstall -g @softspark/jira-mcp
```

---

## Phase 1: npm Install Verification

### Step 1.1: Install the Published Version

```bash
npm install -g @softspark/jira-mcp@X.Y.Z
```

- [ ] Installation completes without errors
- [ ] No `WARN` messages about peer dependencies
- [ ] No `ERR!` messages

### Step 1.2: Verify Installed Version

```bash
jira-mcp --version
```

- [ ] Output shows `X.Y.Z` (the exact version just released)

### Step 1.3: Verify Binary Location

```bash
which jira-mcp
```

- [ ] Output points to the global npm bin path (e.g., `~/.nvm/versions/node/vNN/bin/jira-mcp`)

### Step 1.4: Verify Package Contents

```bash
npm list -g @softspark/jira-mcp
```

- [ ] Shows `@softspark/jira-mcp@X.Y.Z`
- [ ] No `MISSING` or `INVALID` markers

---

## Phase 2: CLI Smoke Tests

### Step 2.1: Help Output

```bash
jira-mcp --help
```

- [ ] Help text is displayed without errors
- [ ] All subcommands are listed (serve, config, etc.)
- [ ] No stack traces or unhandled errors

### Step 2.2: Config Init (Temp Directory)

Create a temporary directory to avoid polluting the real config:

```bash
TMPDIR=$(mktemp -d)
cd $TMPDIR
jira-mcp config init
```

- [ ] Command exits with code 0
- [ ] Configuration directory structure is created
- [ ] Confirmation message is displayed

### Step 2.3: Add Test Project

```bash
jira-mcp config add-project TEST https://test.atlassian.net
```

- [ ] Command exits with code 0
- [ ] Project `TEST` is registered with the given URL

### Step 2.4: List Projects

```bash
jira-mcp config list-projects
```

- [ ] Output includes the `TEST` project
- [ ] URL `https://test.atlassian.net` is shown
- [ ] No errors or stack traces

---

## Phase 3: MCP Server Verification

### Step 3.1: Start Server (Brief)

Test that the MCP server starts without crashing:

```bash
echo '{}' | timeout 5 jira-mcp serve || true
```

- [ ] Server starts without immediate crash
- [ ] No unhandled exception or stack trace on startup
- [ ] Process exits cleanly after timeout (or after processing the empty input)

### Step 3.2: Verify Tool List

If the server supports a tool listing command:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jira-mcp serve 2>/dev/null
```

- [ ] Response contains a JSON-RPC result
- [ ] Tool list includes expected tools: `sync_tasks`, `read_cached_tasks`, `update_task_status`, `add_task_comment`, `reassign_task`, `get_task_statuses`, `get_task_details`, `log_task_time`, `get_task_time_tracking`, `list_comment_templates`, `add_templated_comment`, `create_task`, `search_tasks`, `update_task`, `get_project_language`
- [ ] No error response

---

## Phase 4: Cleanup

### Step 4.1: Remove Test Config

```bash
cd -
rm -rf $TMPDIR
```

- [ ] Temporary directory removed
- [ ] No leftover test configuration files

### Step 4.2: Uninstall Global Package

```bash
npm uninstall -g @softspark/jira-mcp
```

- [ ] Uninstall completes without errors
- [ ] `jira-mcp` command is no longer available

**Verify removal:**

```bash
which jira-mcp 2>/dev/null && echo "FAIL: still installed" || echo "OK: removed"
```

- [ ] Output shows `OK: removed`

---

## Failures and Escalation

### Phase 1 Failures (Install)

| Symptom | Likely Cause | Action |
|---------|-------------|--------|
| `npm ERR! 404 Not Found` | Package not published yet | Wait for CI to complete; check workflow status |
| `npm ERR! code EACCES` | Permission issue | Use `sudo` or fix npm prefix permissions |
| Version mismatch | Stale npm cache | Run `npm cache clean --force` and retry |
| Peer dependency warnings | Incompatible Node.js version | Verify Node.js >= 18 |

### Phase 2 Failures (CLI)

| Symptom | Likely Cause | Action |
|---------|-------------|--------|
| `jira-mcp: command not found` | Binary not in PATH | Check `npm config get prefix` and add `bin/` to PATH |
| `--help` shows error | Missing `commander` dependency | Check `package.json` files array includes `dist/` |
| `config init` fails | Missing CLI handler | Check `dist/cli.js` was included in the published package |

### Phase 3 Failures (MCP Server)

| Symptom | Likely Cause | Action |
|---------|-------------|--------|
| Immediate crash on `serve` | Missing dependency at runtime | Run `npm ls` in install path to check for missing deps |
| No tool list in response | MCP SDK initialization error | Check `@modelcontextprotocol/sdk` version compatibility |
| Timeout with no response | Server hangs on stdin | Check stdio transport configuration |

### Escalation

If any phase fails and the cause is not listed above:

1. Check CI publish workflow logs: `gh run list --workflow=publish.yml --repo softspark/jira-mcp`
2. Check npm package contents: `npm pack @softspark/jira-mcp@X.Y.Z --dry-run`
3. Open an issue: `gh issue create --repo softspark/jira-mcp --title "Release vX.Y.Z verification failure" --body "<details>"`
4. If critical: follow the Rollback section in the [Release Creation SOP](sop-release.md)

---

## Success Criteria

| Phase | Criterion |
|-------|-----------|
| Install | `npm install -g` succeeds, `--version` shows correct version |
| CLI | `--help` displays commands, `config init` creates structure, `config list-projects` shows data |
| MCP Server | `serve` starts without crash, tool list is returned |
| Cleanup | Global package uninstalled, temp config removed |

All four phases must pass for the release to be considered verified.
