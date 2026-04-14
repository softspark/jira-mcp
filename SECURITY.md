# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |
| 0.x     | No        |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Report security issues by emailing: biuro@softspark.eu

Include in your report:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if you have one)

You will receive a response within 48 hours. We will:
1. Confirm receipt of your report
2. Investigate and validate the issue
3. Release a fix and disclose the vulnerability (with credit to you unless you prefer anonymity)

## Security Design

### Credential Handling

Jira credentials (API tokens, personal access tokens, OAuth tokens) are read from configuration files at runtime. They are:
- **Never logged** to stdout, stderr, or any log file
- **Never cached** in MCP tool responses returned to the client
- **Never included** in error messages or stack traces
- **Never transmitted** to any endpoint other than the configured Jira instance

### Input Validation

All inputs to MCP tools are validated before being sent to the Jira API:
- JQL queries are parameterized where possible
- Task keys are validated against the expected format (`PROJECT-123`)
- Time tracking values are validated before submission
- Comment content is sanitized before ADF conversion

### Supply Chain Protection

- **No install scripts** -- `.npmrc` sets `ignore-scripts=true`. No `postinstall`, `preinstall`, or lifecycle scripts execute during `npm install`.
- **Minimal dependencies** -- only 1 runtime dep (`commander`, zero transitive). All other code bundled at build time.
- **No axios** -- Jira API client uses Node.js built-in `fetch` (no third-party HTTP libraries in the dependency chain).
- **No dynamic requires** -- all imports are static ESM. No `eval()`, `Function()`, or `child_process`.

### No Telemetry

This server does NOT:
- Phone home or send telemetry of any kind
- Make network requests to anything other than configured Jira instances
- Store or transmit any code, data, or usage metrics externally
- Track which MCP tools are called or how often

## GitHub Security Advisories

For confirmed vulnerabilities, we use [GitHub Security Advisories](https://github.com/softspark/jira-mcp/security/advisories) to:
1. Coordinate private disclosure and fix development
2. Request a CVE identifier when applicable
3. Publish the advisory alongside the patched release

If you believe a vulnerability warrants a CVE, mention it in your report email -- we will initiate the process.

## Scope

In scope:
- Credential leakage through MCP responses or logs
- Injection attacks via JQL or Jira API payloads
- Unauthorized access to Jira instances not in the user's config
- Cache poisoning or data integrity issues in local task cache
- Bypass of input validation on tool parameters

Out of scope:
- Issues in the MCP protocol itself (report to the MCP SDK maintainers)
- Issues in Claude Code or other MCP clients (report to respective vendors)
- Jira server-side vulnerabilities (report to Atlassian)
- Social engineering attacks
- Denial of service
