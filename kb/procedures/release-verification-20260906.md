---
title: "Release verification on 2026-09-06"
category: procedures
service: jira-mcp
tags: [release, verification, provenance]
version: "1.11.0"
created: "2026-09-06"
last_updated: "2026-09-06"
description: "Executed checks for published 1.10.0 and the 1.11.0 candidate."
---

# Executed verification

The published package `@softspark/jira-mcp@1.10.0` was installed as an
exact dependency in a temporary npm project, with `--ignore-scripts` and a
consumer lockfile. The isolated project also contained the other two audited
CLI packages. `npm audit signatures --registry https://registry.npmjs.org`
exited 0: **4 verified registry signatures and 3 verified attestations**
(the fourth dependency is commander).

Published artifact checks passed: expected version, LICENSE, NOTICE and runtime
entry points present; tests, KB and .github absent. JavaScript/Zsh syntax
checks ran before executing CLI smoke commands.

Published `jira-mcp --version` returned 1.10.0. No live Jira API calls, task
creation, comments, transitions or deletion were performed. The existing live
Jira portion of the post-release SOP still requires its own authorized run.

## Candidate status

Version 1.11.0 is prepared locally and **has not been published**. Its new
audit commands are tested against real temporary filesystem/configuration
fixtures, including secret redaction and SARIF output. Existing text behavior
is retained except for documented repairs.

After publication, repeat this record against the new registry version and run
its post-release SOP. Do not carry the 1.10.0 cryptographic result forward
as evidence for a future 1.11.0 artifact.

Candidate gates on 2026-09-06: typecheck, lint, coverage suite, build and README
count validation passed. All 710 tests across 67 files passed; total coverage
was 85.01% lines and 72.47% branches. The new audit module reached 92.95% lines
and 87.20% branches. All 36 files required by the expanded CI gate were present
and nonempty. No quality threshold was lowered.

Review regressions cover logical forward-slash traversal with Windows relative
path semantics, 64 KiB manifest boundaries, symlink and FIFO refusal, and direct
initialization/save APIs for all three cache managers and ensureGlobalDirs.
Permission tests verify both private new directories and preservation of
existing modes using real temporary filesystem fixtures.
