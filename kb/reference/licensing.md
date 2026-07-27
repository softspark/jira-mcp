---
title: "Licensing"
category: reference
service: jira-mcp
tags: [licence, apache-2.0, spdx, notice, attribution, headers, mit, tsup, minify]
version: "1.0.0"
created: "2026-07-27"
last_updated: "2026-07-27"
description: "jira-mcp is Apache-2.0 from v1.7.0. What a redistributor owes, why NOTICE is the point, the SPDX header convention, and the build-banner mechanism that carries attribution into the minified bundles npm actually ships."
---

# Licensing

jira-mcp is licensed under the **Apache License 2.0** from v1.7.0. Releases up to
and including v1.6.0 were published under MIT and remain available under MIT. The
change applies going forward and revokes nothing already granted.

Canonical files: [`LICENSE`](../../LICENSE) (verbatim Apache-2.0 text) and
[`NOTICE`](../../NOTICE) (attribution).

## Why Apache-2.0, given MIT already required attribution

MIT already said the copyright notice must be preserved, so attribution is not
the new thing. What Apache-2.0 adds:

| Mechanism | MIT | Apache-2.0 |
|---|---|---|
| Copyright notice must be preserved | yes | yes |
| **`NOTICE` contents must travel into redistributions** (§4d) | — | **yes** |
| **Modified files must carry a notice saying they changed** (§4b) | — | **yes** |
| Express patent grant, terminated by patent litigation (§3) | — | yes |
| No rights to the licensor's names or marks (§6) | — | yes |

`NOTICE` is the reason for the change: it is the only mechanism in a permissive
licence that forces a redistributor to reproduce your attribution where their
users can see it.

All contributions to this repository were made by the copyright holder, so the
relicense required no third-party permission. The MIT notice is preserved in
`NOTICE` for the releases it still governs.

## The part specific to this package

**SPDX headers in `src/` never reach a consumer.**

npm ships `dist/`, not `src/` (see `package.json` `files`), and the build runs
with `minify: true`, which strips every comment. A header in `src/index.ts` is
invisible to anyone who installs the package.

Attribution reaches consumers through the **tsup banner**:

```ts
const LICENSE_BANNER =
  '/*! jira-mcp | Apache-2.0 | Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu) | https://github.com/softspark/jira-mcp */';
```

applied to **both** build entries in `tsup.config.ts`. esbuild prepends `banner`
verbatim after minification, so it survives. For the `cli` entry the shebang must
stay on line 1, so the banner follows it.

Verify after any bundler change:

```bash
npm run build && grep -c 'Apache-2.0' dist/index.js dist/cli.js   # 1 and 1
```

The banner lands just after the hoisted ESM imports rather than at byte 0. That
is normal esbuild behaviour for ESM output, not a defect — the imports must be
hoisted above everything else.

**Removing the banner strips attribution from the published package while
typecheck, lint, tests and build all stay green.** That is why
`tests/licensing.test.ts` asserts both entries carry it.

## What a fork owes

Fork it, modify it, ship it commercially. Three obligations:

1. **Carry the `NOTICE`** into your distribution (§4d).
2. **Say which files you changed** (§4b).
3. **Do not use the "jira-mcp" or "SoftSpark" names or marks** as if endorsed (§6).

## Source header convention

Short SPDX form, three lines, after any shebang. `//` comments throughout, since
every source file here is TypeScript or ESM JavaScript:

```ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

import { ... } from '...';
```

Covered: `src/**/*.ts` (94), `tests/**/*.ts` (68), and the three root configs
`eslint.config.mjs`, `tsup.config.ts`, `vitest.config.ts` — 165 files at the time
of writing. The gate checks *every* matching file, so the count moves with the
codebase and nothing needs updating here.

Markdown carries no header. `kb/` documents and the README are prose; `LICENSE`
and `NOTICE` carry the terms.

## Enforcement

`tests/licensing.test.ts`, eight assertions, run by `npm test`:

- the file walker finds source files at all (guards against vacuous passes)
- every source file carries an SPDX header
- every header names Apache-2.0
- `LICENSE` is the complete Apache 2.0 text, appendix included
- `NOTICE` carries attribution, the source URL, §4(d) and the MIT-era notice
- `LICENSE` and `NOTICE` both appear in `package.json` `files`
- `package.json` declares Apache-2.0
- **both build entries carry the licence banner**

[Release SOP](../procedures/sop-release.md) Phase 4.7 runs the same gate before
tagging, so a failure surfaces before the tag rather than after publication.

## If the licence ever changes again

Do not hand-type the licence text and do not paste a rendered copy — a
markdown-formatted licence is not the licence. Take it verbatim from a published
source, cross-verify against a second independent copy, and only then write
`LICENSE`.

## Related

- [`LICENSE`](../../LICENSE), [`NOTICE`](../../NOTICE)
- [Release SOP](../procedures/sop-release.md) — Phase 4.7
- [Post-Release Testing SOP](../procedures/sop-post-release-testing.md)
