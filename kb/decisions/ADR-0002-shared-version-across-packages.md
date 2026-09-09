---
title: "ADR-0002: One version number across both published packages"
category: decisions
service: jira-mcp
tags: [release, versioning, semver, workspace, npm, module-template]
version: "1.13.0"
status: accepted
created: "2026-09-09"
last_updated: "2026-09-09"
description: "Both @softspark/jira-mcp and @softspark/confluence-mcp carry the same version and are released from one tag, so confluence-mcp's first public version is 1.12.0 rather than the 1.0.0 the module template mandates."
---

# ADR-0002: One version number across both published packages

## Status

Accepted, 2026-09-09. Implemented in v1.12.0.

## Context

v1.12.0 split the repository into an npm workspace with three packages:

| Package | Published |
|---|---|
| `@softspark/atlassian-mcp-core` | no, bundled into both servers |
| `@softspark/jira-mcp` | yes |
| `@softspark/confluence-mcp` | yes, new in v1.12.0 |

`@softspark/jira-mcp` had an established line up to 1.11.0. `@softspark/confluence-mcp` was new.

Two things pulled in opposite directions.

The **SoftSpark module template** requires a new public module's first release to be 1.0.0. It is written for the one-module-one-repo shape, where a module's version is its own story and 1.0.0 says "this is now supported".

The **release pipeline is one pipeline**. One tag triggers `publish.yml`, which builds the workspace once and publishes both packages in sequence. The two servers share `config.json`, `credentials.json`, the ADF layer, the HTTP client and the error hierarchy through `core`. A change in `core` reaches both, and the test suite runs across all three packages precisely because a core change is only meaningful if both servers still pass.

## Decision

Both published packages carry the same version, bumped together, released from one tag.

`@softspark/confluence-mcp` therefore begins its public life at **1.12.0**, not 1.0.0.

This is a deliberate deviation from the module template's mandatory-1.0.0 rule, taken with the maintainer's explicit agreement when the split was planned.

## Rationale

A shared number answers the question people actually ask: *which versions of these two go together?* With independent lines, `jira-mcp@1.14.0` and `confluence-mcp@1.2.0` may or may not have been built from the same commit, and nothing in either package says. With one number they always were.

The alternative that keeps the module template happy, `confluence-mcp` starting at 1.0.0 and running its own line, buys a truthful "first stable release" signal at the cost of that ambiguity, permanently, for every future release. The signal is worth less than the ambiguity costs, because the two packages are not independently useful in the way two unrelated modules are: they share a config file on disk and a bundled core.

## Consequences

- `@softspark/confluence-mcp` has no 1.0.0 through 1.11.x on npm. Somebody reading the registry sees a package whose history starts at 1.12.0. This ADR is the answer to "was that a mistake?"
- Both packages must be released together. Publishing one without the other breaks the invariant this decision buys. `publish.yml` publishes both in one job; if the second step fails after the first succeeded, follow the Rollback section of the release SOP: deprecate the orphan and re-release a patch.
- A release that touches only one package still bumps both. v1.13.0 is the first such case: all the work was in `confluence-mcp`, and `jira-mcp@1.13.0` shipped with no behaviour change because the shared template engine moved into `core`. The changelog says so explicitly, and future releases should keep saying so.
- The semver contract is now the union of both packages. A breaking change in either is a major for both.

## Alternatives considered

**Independent semver per package.** Each package versions on its own merit, `confluence-mcp` starts at 1.0.0, the module template is satisfied. Rejected for the compatibility ambiguity above, and because a shared `core` makes "independent" partly fictional anyway.

**A separate repository for `confluence-mcp`.** This is what the module template actually assumes, and it would have made 1.0.0 natural. Rejected when the split was planned: the shared layer is roughly 1500 lines of config loading, ADF conversion, HTTP transport and error types, and duplicating it across repositories, or publishing a third public package to hold it, costs more than the naming tidiness is worth.

**Publishing `core`.** Would let the two servers depend on a versioned shared library and drift apart safely. Rejected for now: nobody outside this repository needs it, and a public package is a maintenance surface and a release cycle. Revisit if a third server (Bitbucket, Jira Service Management) appears.

## Revisit when

- A third Atlassian server joins the workspace, which strengthens the case for publishing `core`.
- The two servers' release cadences genuinely diverge, meaning most releases bump a package with nothing in it.

## References

- SoftSpark Open-Source Module Template, in the shared KB at `shared/rag-mcp/procedures/softspark-module-template.md` — the mandatory-1.0.0 rule this deviates from
- [SOP: Release Creation](../procedures/sop-release.md) — the two-package publish and its rollback
- `CHANGELOG.md` — v1.12.0 entry describing the split
