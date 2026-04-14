---
title: "SOP: Post-Release Testing"
category: procedures
service: jira-mcp
tags: [sop, verification, release, smoke-test, install, qa, post-release, jira-api]
version: "1.1.0"
created: "2026-04-13"
last_updated: "2026-04-14"
description: "End-to-end smoke test after publishing a new @softspark/jira-mcp release — npm install verification, CLI smoke tests, MCP server verification, live Jira API tests against KAN project, and cleanup."
---

# SOP: Post-Release Testing

End-to-end smoke test after publishing a new `@softspark/jira-mcp` release.
Verifies all critical paths from the user's perspective — including live Jira API operations.

**Run this SOP after:**
- The [Release Creation SOP](sop-release.md) completes and CI publishes to npm
- `npm view @softspark/jira-mcp version` returns the expected version

**Prerequisites:**
- Node.js >= 18
- npm CLI access
- The target version has been published to npm
- Access to the test Jira instance (see below)

**Test Jira Instance:**
- **Project:** `KAN`
- **URL:** `https://softspark.atlassian.net`
- **Board:** `https://softspark.atlassian.net/jira/software/projects/KAN/boards/1`
- **Language:** `pl`
- **Purpose:** Dedicated sandbox for smoke tests. Safe to create/modify/delete tasks.

**Time:** 10-15 minutes

---

## Quick Checklist (TL;DR)

```bash
VERSION="X.Y.Z"

# Phase 1: Install
npm install -g @softspark/jira-mcp@$VERSION
jira-mcp --version
jira-mcp --help

# Phase 2: CLI
jira-mcp config list-projects  # KAN should be listed

# Phase 3: MCP Server
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jira-mcp serve 2>/dev/null

# Phase 4: Live Jira API (via MCP tools against KAN project)
# → create_task → get_task_details → update_task → add_task_comment
# → add_templated_comment → get_task_statuses → update_task_status
# → reassign_task → log_task_time → get_task_time_tracking
# → sync_tasks → read_cached_tasks → search_tasks
# → get_project_language → list_comment_templates

# Phase 5: Cleanup (delete test task from KAN, keep jira-mcp installed)
```

---

## Phase 1: npm Install Verification

### Step 1.1: Install/Update the Published Version

```bash
npm install -g @softspark/jira-mcp@X.Y.Z
```

- [ ] Installation completes without errors
- [ ] No `WARN` messages about peer dependencies
- [ ] No `ERR!` messages

> **Note:** The global install is kept permanently for ad-hoc CLI usage. Do NOT uninstall after testing.

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
- [ ] All subcommands are listed (serve, config, create, create-monthly, cache)
- [ ] No stack traces or unhandled errors

### Step 2.2: Verify KAN Project Configuration

```bash
jira-mcp config list-projects
```

- [ ] Output includes the `KAN` project
- [ ] URL shows `https://softspark.atlassian.net`
- [ ] Language shows `pl`
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

## Phase 4: Live Jira API Tests

All tests run against the **KAN** project (`https://softspark.atlassian.net`).
Use MCP tools (via Claude or direct JSON-RPC). A single test task is created and used throughout.

### Step 4.1: Get Project Language

```
get_project_language({ project_key: "KAN" })
```

- [ ] Returns `language: "pl"`
- [ ] No errors

### Step 4.2: List Comment Templates

```
list_comment_templates()
```

- [ ] Returns template list with IDs: `status-update`, `blocker-notification`, `handoff-transition`, etc.
- [ ] Each template shows required variables

### Step 4.3: Create Test Task

```
create_task({
  project_key: "KAN",
  summary: "[SMOKE TEST] Test task vX.Y.Z — do usunięcia",
  description: "Automatyczny test po wydaniu wersji X.Y.Z.\n\nMożna bezpiecznie usunąć.",
  type: "Task",
  priority: "Low",
  labels: ["smoke-test"]
})
```

- [ ] Task created successfully, returns task key (e.g. `KAN-42`)
- [ ] No errors

> **Save the returned `task_key`** — it is used in all subsequent steps as `KAN-XX`.

### Step 4.4: Get Task Details

```
get_task_details({ task_key: "KAN-XX" })
```

- [ ] Returns full task with summary, description (as markdown), status, priority, labels
- [ ] Description matches what was set in Step 4.3
- [ ] Language field shows `pl`

### Step 4.5: Update Task Fields

```
update_task({
  task_key: "KAN-XX",
  summary: "[SMOKE TEST] Zaktualizowany task vX.Y.Z",
  priority: "Medium",
  labels: ["smoke-test", "updated"]
})
```

- [ ] Returns success with `updated_fields` listing changed fields
- [ ] No errors

### Step 4.6: Add Markdown Comment

```
add_task_comment({
  task_key: "KAN-XX",
  comment: "## Smoke test\n\nKomentarz testowy z **markdown**.\n\n- Punkt 1\n- Punkt 2"
})
```

- [ ] Comment added, returns comment ID
- [ ] No ADF conversion errors

### Step 4.7: Add Templated Comment

```
add_templated_comment({
  task_key: "KAN-XX",
  template_id: "status-update",
  variables: {
    "completed": "Smoke test faz 1-3",
    "next_steps": "Weryfikacja API",
    "blockers": "Brak"
  }
})
```

- [ ] Templated comment added successfully
- [ ] No missing variable errors

### Step 4.8: Get Available Statuses

```
get_task_statuses({ task_key: "KAN-XX" })
```

- [ ] Returns list of valid transitions from current status
- [ ] At least one transition is available (e.g. "In Progress")

### Step 4.9: Change Task Status

Using a valid transition from Step 4.8:

```
update_task_status({ task_key: "KAN-XX", status: "In Progress" })
```

- [ ] Status changed successfully
- [ ] No "invalid transition" error

### Step 4.10: Reassign Task

```
reassign_task({ task_key: "KAN-XX", assignee_email: "<your-email>" })
```

- [ ] Task reassigned successfully
- [ ] No "user not found" error

Then unassign:

```
reassign_task({ task_key: "KAN-XX" })
```

- [ ] Task unassigned successfully

### Step 4.11: Log Time

```
log_task_time({
  task_key: "KAN-XX",
  time_spent: "15m",
  comment: "Smoke test po wydaniu"
})
```

- [ ] Time logged, returns worklog ID
- [ ] No errors

### Step 4.12: Get Time Tracking

```
get_task_time_tracking({ task_key: "KAN-XX" })
```

- [ ] Returns time tracking info with `time_spent` showing at least `15m`
- [ ] No errors

### Step 4.13: Sync Tasks

```
sync_tasks({ project_key: "KAN" })
```

- [ ] Sync completes, reports number of synced tasks
- [ ] No authentication or connection errors

### Step 4.14: Read Cached Tasks

```
read_cached_tasks({ task_key: "KAN-XX" })
```

- [ ] Returns the test task from cache
- [ ] Status reflects the change from Step 4.9

### Step 4.15: Search Tasks

```
search_tasks({
  jql: "project = KAN AND labels = smoke-test ORDER BY created DESC",
  max_results: 5,
  project_key: "KAN"
})
```

- [ ] Returns results including the test task
- [ ] No errors

---

## Phase 5: Cleanup

### Step 5.1: Move Test Task to Done

```
update_task_status({ task_key: "KAN-XX", status: "Done" })
```

- [ ] Task moved to Done

### Step 5.2: Delete Test Task from Jira

Go to `https://softspark.atlassian.net/browse/KAN-XX` and delete the task manually, or leave it in Done with the `smoke-test` label for audit trail.

- [ ] Test task cleaned up or marked as Done with `smoke-test` label

### Step 5.3: Verify No Side Effects

```
jira-mcp config list-projects
```

- [ ] KAN project still configured
- [ ] No other projects affected

> **Do NOT uninstall `jira-mcp`** — the global install is kept for ad-hoc usage.

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
| KAN not in project list | Config was reset or removed | Re-add: `jira-mcp config add-project KAN https://softspark.atlassian.net` |

### Phase 3 Failures (MCP Server)

| Symptom | Likely Cause | Action |
|---------|-------------|--------|
| Immediate crash on `serve` | Missing dependency at runtime | Run `npm ls` in install path to check for missing deps |
| No tool list in response | MCP SDK initialization error | Check `@modelcontextprotocol/sdk` version compatibility |
| Timeout with no response | Server hangs on stdin | Check stdio transport configuration |

### Phase 4 Failures (Live Jira API)

| Symptom | Likely Cause | Action |
|---------|-------------|--------|
| `JIRA_AUTH` error | Invalid or expired credentials | Run `jira-mcp config set-credentials` and re-enter API token |
| `JIRA_PERMISSION` on create | No create permission in KAN | Check project permissions in Jira admin |
| `JIRA_CONNECTION` error | Network issue or wrong URL | Verify `https://softspark.atlassian.net` is reachable |
| Invalid transition error | Workflow changed in KAN | Run `jira-mcp cache sync-workflows` and check available transitions |
| User not found on reassign | User cache stale | Run `jira-mcp cache sync-users` |
| Task not in cache after sync | Sync filtered it out | Check JQL filter in `sync_tasks` call |

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
| CLI | `--help` displays commands, `config list-projects` shows KAN |
| MCP Server | `serve` starts without crash, 15 tools returned |
| Live Jira API | All 15 MCP tools execute successfully against KAN project |
| Cleanup | Test task in Done/deleted, `jira-mcp` still installed globally |

All five phases must pass for the release to be considered verified.
