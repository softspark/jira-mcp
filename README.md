# SoftSpark Atlassian MCP

> Two MCP servers for Atlassian Cloud: Jira and Confluence. One configuration, one API token, separate tool lists.

[![CI](https://github.com/softspark/jira-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/softspark/jira-mcp/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

---

## Packages

| Package | What it does | Docs |
|---------|--------------|------|
| [`@softspark/jira-mcp`](packages/jira-mcp) | Jira: sync, search, comment, transition, log time, reassign, create and delete issues | [README](packages/jira-mcp/README.md) |
| [`@softspark/confluence-mcp`](packages/confluence-mcp) | Confluence Cloud: pages, blog posts, footer and inline comments, labels, attachments, restrictions, whiteboards | [README](packages/confluence-mcp/README.md) |
| `@softspark/atlassian-mcp-core` | Shared config, ADF conversion, HTTP transport, MCP envelope. **Not published** — bundled into both servers at build time | — |

## Why two servers and not one

One Atlassian site serves both products from the same host with the same API token, so they share a configuration file and a transport layer. They do not share a tool list.

Merging them would put near-homonyms in one list: `search_tasks` beside `search_pages`, `get_task_details` beside `get_page`, `add_task_comment` beside `add_page_comment`. That measurably worsens tool selection, and the failure is silent — the wrong tool returns a plausible answer about the wrong product. `packages/core/tests/tool-name-collisions.test.ts` asserts the two lists never overlap.

Install whichever you need, or both.

## Install

```bash
npm install -g @softspark/jira-mcp @softspark/confluence-mcp
```

```bash
jira-mcp config init
jira-mcp config set-credentials              # shared by both servers
jira-mcp config add-project KAN https://your-site.atlassian.net
confluence-mcp space add DOCS https://your-site.atlassian.net
```

Register in an MCP client:

```json
{
  "mcpServers": {
    "jira": { "command": "jira-mcp" },
    "confluence": { "command": "confluence-mcp" }
  }
}
```

All state lives in `~/.softspark/jira-mcp/`, the standard config directory for SoftSpark tools. The directory keeps its original name: renaming it would orphan every existing installation.

## Development

```bash
npm install            # links the workspace
npm run typecheck      # tsc across all packages
npm run lint
npm test               # one run across the whole workspace
npm run test:coverage  # 70% gate
npm run build          # builds both published packages
```

Tests run workspace-wide on purpose. `core` has no consumers of its own, so a change there is only meaningful if both servers still pass; a per-package run would let a core change break a server with no single command noticing.

Pre-commit gate:

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

## Documentation

- [CHANGELOG](CHANGELOG.md) — shared; both packages release together under one version.
- `kb/reference/` — architecture, api, adf, caching, configuration, templates, confluence.
- `kb/howto/` — setup, multi-instance, cli-usage.
- `kb/procedures/` — sop-pre-commit, sop-release, sop-post-release-testing.

## Contributing

See [CONTRIBUTING](.github/CONTRIBUTING.md), [SECURITY](SECURITY.md) and the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
