---
title: "Build and Packaging"
category: reference
service: jira-mcp
tags: [build, packaging, npm, tsup, workspace, ignore-scripts, files]
version: "1.14.4"
created: "2026-09-10"
last_updated: "2026-09-10"
description: "How the workspace builds and what reaches a published tarball, including the two npm behaviours that fail silently here: disabled lifecycle hooks and files patterns that match nothing."
---

# Build and Packaging

What is non-obvious about turning this repository into two npm packages. Both
items below cost a release each before they were understood, and neither
produces an error message.

## npm lifecycle hooks do not run in this repository

`.npmrc` sets `ignore-scripts=true`, and each package.json repeats it under
`installConfig`. The reason is supply-chain hygiene: a dependency's `postinstall`
is arbitrary code execution at install time, and this package's pitch includes
having one runtime dependency and no install scripts.

The part that surprises people is the blast radius. `ignore-scripts` is not
limited to install-time hooks. It disables **every** npm lifecycle script, so
`prebuild`, `pretest`, `prepack`, `prepublishOnly` and the rest are all dead
here. A hook added to package.json looks correct, passes review, and never runs.
Nothing warns.

Both halves of that were confirmed here rather than assumed: a `pretest` hook
did not fire on `npm test`, and a `prepack` hook printing to stdout produced no
output under `npm pack`.

Chain the step into the script itself instead:

```json
{
  "scripts": {
    "build": "node scripts/sync-changelog.mjs && npm run build --workspace @softspark/jira-mcp",
    "test": "node scripts/sync-changelog.mjs && vitest run"
  }
}
```

This costs a repeated fragment in a few scripts and buys a step that actually
executes. If a build or release step ever appears not to happen, check whether
somebody expressed it as a lifecycle hook before looking anywhere else.

The same applies to anything relying on `prepack` to assemble a package.
`npm publish` will not run it.

## `files` patterns resolve inside the package directory

Each `files` entry is matched relative to the package's own directory, never the
workspace root. Since the 1.12.0 split, both packages listed `CHANGELOG.md`
while the changelog existed only at the repository root, so the pattern matched
nothing.

**npm drops a pattern that matches nothing without a warning.** Six releases,
1.12.0 through 1.14.3, shipped a manifest promising a file the tarball did not
contain, and the README version badge linked to it. `npm pack --dry-run` lists
what is included, never what was asked for and not found, so the omission is
invisible unless you go looking.

A symlink does not solve it: `npm pack` skips symlinks, and the file simply does
not appear in the listing. `scripts/sync-changelog.mjs` copies the root file into
each package instead, called from `build`, `test` and `test:coverage` for the
reason in the previous section.

Also note that a relative link in a README (`../../CHANGELOG.md`) resolves inside
the repository but points outside a published tarball, so it renders dead on
npmjs.com. Keep intra-package links package-relative.

## What guards this

`packages/core/tests/packaging.test.ts` asserts, for both published packages:

- every `files` entry matches at least one real file, which catches a manifest
  claiming more than it delivers
- each package's copied changelog is byte-identical to the root one, which
  catches a release built before an edit and would otherwise ship stale history

The test reaches across package directories deliberately, like
`tool-name-collisions.test.ts`: it asserts a property of how the workspace
publishes, which neither package can see alone.

## The rest of the build

- **tsup flat-bundles `src/` into `dist/`.** `commander` stays external; Zod, the
  MCP SDK and the private `@softspark/atlassian-mcp-core` are bundled, because a
  consumer installing from npm cannot resolve an unpublished workspace package.
- **`dist/` is committed.** `.gitignore` anchors `/dist/` at the root only, so the
  per-package output is tracked. A release diff therefore always shows churn in
  `dist/cli.js` and `dist/index.js`, at minimum the version string tsup bakes in
  from `src/version.ts`.
- **The licence banner is the only attribution that survives minification.** See
  [licensing](licensing.md).

## Related

- [SOP: Release Creation](../procedures/sop-release.md)
- [Licensing](licensing.md)
- [npm 404 on a version that was just published](../troubleshooting/common-issues.md#npm-404-on-a-version-that-was-just-published)
