---
title: "Local audit and hook permissions"
category: reference
service: jira-mcp
tags: [reference, configuration, audit]
version: "1.11.0"
created: "2026-09-06"
last_updated: "2026-09-06"
description: "Local audit and hook permissions."
---

# Local audit and hook permissions

`jira-mcp audit [--json|--sarif]` is a read-only local command. It does not
start the MCP server, contact Jira, load credentials or parse cached task data.
It inspects filesystem metadata under `~/.softspark/jira-mcp/` and the
package's `hooks/jira-mcp-hooks.json` manifest.

The shipped hook belongs to `@softspark/jira-mcp`. Its runner is
`jira-mcp hook comment-approval`, matching comment and templated-comment
tools at PreToolUse. It reads stdin and comment templates, may write a preview
to stderr and sets an exit code. An external client or ai-toolkit installs
the hook. Audit validates the shipped definition; it does not claim the hook
is installed or active in a particular client.

## Formats and findings

Text is the default. JSON has `schemaVersion: 1`, `tool`, `scope`,
`networkAccessed: false`, `hook`, `entries` and `findings`.
Entries contain relative path, numeric uid, permission mode and file type.
Relative report paths use forward slashes on every platform. Cache traversal
and private-file checks use these logical names independently of OS separators.
Credential and cache contents are never emitted. SARIF 2.1.0 carries the same
rules and severity with file URIs pointing to the inspected artifacts.

| Rule | Severity | Meaning |
|---|---|---|
| unsafe-permissions | warning | Credentials, state or cache are shared, or configuration is writable by others |
| unexpected-owner | warning | The path is owned by a different uid |
| unsafe-file-type | error | A symlink, special file or unexpected directory/file type cannot safely be inspected |
| unreadable-path | error | Metadata or directory listing cannot be read |
| inspection-limit | warning | Cache traversal exceeds 8 levels or 1000 entries |
| invalid-hook-manifest | error | Shipped hook is absent, malformed or differs from the expected runner and matcher |

Missing state is valid for a fresh installation. Symlinked roots and cache
directories are reported without following them. Exit 0 means no findings;
1 means findings; Commander uses its normal argument-error exit code.

New configuration/cache directories use mode 0700; credentials and state use
0600. Existing permissions are never changed by audit or silently rewritten by
initialization. Review ownership before applying any manual permission repair.
POSIX mode and uid checks apply on Linux/macOS.

The hook manifest must be a regular file of at most 64 KiB. Inspection rejects
symlinks, special files and oversized manifests, verifies the opened file's
identity, and reads at most 64 KiB plus one byte to detect growth. It never
prints malformed manifest contents.

## Code Scanning

`jira-mcp audit --sarif > audit.sarif` produces a report accepted by
GitHub's `github/codeql-action/upload-sarif` action
(`sarif_file: audit.sarif`). Arrange upload when the audit returns 0 or 1,
then retain the status as a CI gate. Paths can reveal local installation
structure, so select the destination repository deliberately.
