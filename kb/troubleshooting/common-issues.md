---
title: "Jira MCP Common Issues"
category: troubleshooting
service: jira-mcp
tags: [troubleshooting, errors, authentication, cache, configuration]
version: "1.0.0"
created: "2026-04-13"
last_updated: "2026-04-14"
description: "Diagnosis and resolution for the most common errors encountered with the Jira MCP server."
---

# Jira MCP Common Issues

## ConfigNotFoundError

**Symptoms:**
```
ConfigNotFoundError: configuration file not found: /Users/you/.softspark/jira-mcp/config.json
```

**Cause:** The config directory has not been initialized, or the file was deleted. The server looks for `config.json` in this order:
1. `JIRA_CONFIG_PATH` environment variable
2. `config.json` in the current working directory
3. `~/.softspark/jira-mcp/config.json`

**Resolution:**
```bash
jira-mcp config init
jira-mcp config add-project PROJ https://your-org.atlassian.net
```

If using environment variables, verify the path is correct:
```bash
echo $JIRA_CONFIG_PATH
ls -la $JIRA_CONFIG_PATH
```

**Prevention:** Run `config init` once after installation and do not delete the config directory.

**Security note:** If a `config.json` or `credentials.json` is loaded from the current working directory instead of the global config, a warning is logged to stderr. This is intentional — running the server from an untrusted directory (e.g., a cloned repository) could redirect requests to a malicious Jira instance.

---

## JiraAuthenticationError (HTTP 401)

**Symptoms:**
```
JiraAuthenticationError: Authentication failed (401)
```

**Cause:** The API token or email in `credentials.json` is invalid or the token has been revoked.

**Resolution:**
1. Generate a new token at [https://id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens).
2. Update credentials:
   ```bash
   jira-mcp config set-credentials your@email.com NEW_API_TOKEN
   ```
3. Verify the email matches your Atlassian account exactly (case-sensitive).

**Common mistakes:**
- Using a password instead of an API token
- Copying the token with leading/trailing whitespace
- Using an email that is different from the Atlassian account login

---

## JiraPermissionError (HTTP 403)

**Symptoms:**
```
JiraPermissionError: Insufficient permissions (403)
```

**Cause:** The authenticated user does not have the required role or project access for the requested operation.

**Resolution:**
1. Verify the user has at least **Browse Projects** permission for read operations.
2. For status transitions, the user needs the **Transition Issues** permission.
3. For reassignment, the user needs the **Assign Issues** permission.
4. Contact your Jira administrator to grant the appropriate role.

**Diagnosis:** Use `get_task_statuses` to check which transitions are available for your user — if the list is empty or missing expected states, it is a permissions issue.

---

## TaskNotFoundError

**Symptoms:**
```
TaskNotFoundError: Task 'PROJ-123' not found in cache
```

**Cause:** The task has not been synced to the local cache. The cache is only populated by `sync_tasks`.

**Resolution:**
```
# Sync the specific project
sync_tasks(project_key="PROJ")

# Or sync with a JQL filter that includes the task
sync_tasks(jql="project=PROJ AND updated >= -7d")
```

**Note:** `read_cached_tasks` only reads data that was previously fetched. If a task was created after the last sync, it will not be in the cache.

---

## CacheCorruptionError

**Symptoms:**
```
CacheCorruptionError: Invalid JSON in cache file
```
or
```
CacheCorruptionError: Truncated file
```

**Cause:** The cache JSON file was corrupted, typically from an interrupted write operation (e.g. power loss, process kill during sync).

**Resolution:**
```bash
# Delete the corrupted task cache
rm ~/.softspark/jira-mcp/cache/tasks.json

# Re-sync from Jira
# (use sync_tasks tool in your MCP client)
```

For workflow or user cache corruption:
```bash
rm ~/.softspark/jira-mcp/cache/workflows.json
jira-mcp cache sync-workflows

rm ~/.softspark/jira-mcp/cache/users.json
jira-mcp cache sync-users
```

---

## ADF Conversion Warnings

**Symptoms:**
Comments appear with missing formatting, or you see log output like:
```
AdfConversionError: Unsupported ADF node type: 'inlineCard'
```

**Cause:** The Jira description or comment contains an ADF node type not supported by the built-in ADF-to-markdown converter. This typically occurs with embedded Jira smart links, inline cards, or custom panel types.

**Resolution:**
- For `get_task_details`: the description text is returned with best-effort conversion; unsupported nodes are omitted. The raw ADF is not surfaced.
- For `add_task_comment`: the markdown input is converted to ADF via the built-in parser. Standard markdown (headings, lists, code blocks, bold, italic) is fully supported. Avoid Jira-specific macros in comment input.

**Prevention:** Keep comments in standard markdown. Do not paste content copied from rich Jira editors that may include smart links.

---

## Status Transition Not Available

**Symptoms:**
```
Error: Transition to 'Done' not available for PROJ-123
```

**Cause:** Jira workflows define which transitions are valid from each status. Not every status can transition to every other status directly.

**Resolution:**
1. Check available transitions for the task:
   ```
   get_task_statuses(task_key="PROJ-123")
   ```
2. Use a valid intermediate status if a direct transition does not exist. For example, move to `In Review` before `Done`.
3. If the expected transition is missing, a Jira administrator may need to update the workflow.

---

## "Epic Link field not found" During Bulk Creation

**Symptoms:**
```
Error: Epic Link field not found for project PROJ
```

**Cause:** Jira Next-gen (team-managed) projects do not use the classic `Epic Link` custom field. They use a parent-child issue hierarchy instead.

**Resolution:**
In your bulk config JSON, use the `parent` field instead of `epic_key` for team-managed projects:
```json
{
  "epic_key": "PROJ-10",
  "tasks": [...]
}
```

Ensure `epic_key` refers to an actual Epic issue in a company-managed project. If the project uses Next-gen boards, contact your Jira administrator to confirm the issue hierarchy configuration.

---

## Rate Limiting (HTTP 429)

**Symptoms:**
```
Error: Request rate limited (429)
```

**Cause:** Jira Cloud enforces API rate limits per user. Heavy `sync_tasks` calls or rapid sequential tool calls can trigger throttling.

**Resolution:**
1. Wait 60 seconds and retry.
2. Use more targeted JQL filters to reduce the number of tasks fetched:
   ```
   sync_tasks(jql="assignee=currentUser() AND updated >= -1d")
   ```
3. Use `read_cached_tasks` for subsequent reads instead of re-syncing.
4. Avoid running `sync_tasks` more than once per minute.

**Prevention:** Sync once at the start of a session with a scoped JQL filter. Use the cache for all subsequent reads.

---

## Multi-Instance: Wrong Instance for Project

**Symptoms:**
```
ConfigValidationError: Project 'CLIENT' not found in configuration
```
or a task returns data from the wrong Jira instance.

**Cause:** The project key is not registered in `config.json`, or was registered with the wrong URL.

**Resolution:**
```bash
# Check current mappings
jira-mcp config list-projects

# Add the missing project key
jira-mcp config add-project CLIENT https://client-org.atlassian.net
```

Task routing is based solely on the project key prefix of the task key (the part before the `-`). A task key of `CLIENT-42` will always route to the connector registered for the `CLIENT` project key. If `CLIENT` is not in `config.json`, the lookup fails.

See [multi-instance setup guide](../howto/multi-instance.md) for full configuration details.

---

## Truncated API Error Messages

**Symptoms:**
Error messages from Jira API end with `...`:
```
JiraConnectionError: Jira API error (400): {"errorMessages":["The value 'invalid' does not exist for the field...
```

**Cause:** Jira API error responses are truncated to 200 characters to prevent internal server details from leaking through MCP tool responses.

**Resolution:** If you need the full error response for debugging, check the Jira API directly:
```bash
curl -u "user@example.com:API_TOKEN" "https://your-org.atlassian.net/rest/api/3/issue/PROJ-123"
```

---

## Related Documentation

- [Setup guide](../howto/setup.md)
- [CLI reference](../howto/cli-usage.md)
- [Multi-instance configuration](../howto/multi-instance.md)
