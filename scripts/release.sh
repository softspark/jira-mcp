#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
# Source: https://github.com/softspark/jira-mcp
#
# The only supported way to release @softspark/jira-mcp and
# @softspark/confluence-mcp (one version, one tag). Every gate runs here;
# GitHub Actions only publishes the tag this script pushes.
#
#   npm run release -- X.Y.Z               full release: gates, tag, push, watch
#   npm run release -- X.Y.Z --dry-run     steps 1-5, then print steps 6-7
#   npm run release -- X.Y.Z --gates-only  steps 3-5 on the working tree, no
#                                          git preconditions, no tag
#
# Procedure and rationale: kb/procedures/sop-release.md

set -euo pipefail

readonly REPO_SLUG="softspark/jira-mcp"
readonly PACKAGES="jira-mcp confluence-mcp"
readonly BRANCH="main"
readonly PUBLISH_WORKFLOW="publish.yml"
readonly LINUX_IMAGE="node:22"
readonly WAIT_ATTEMPTS=5
readonly WAIT_SECONDS=30

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly REPO_ROOT

VERSION=""
MODE="release"

usage() {
    sed -n '10,13p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

die() {
    printf 'release: %s\n' "$*" >&2
    exit 1
}

step() {
    printf '\n== %s\n' "$*"
}

parse_args() {
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --dry-run) MODE="dry-run" ;;
            --gates-only) MODE="gates-only" ;;
            -h|--help) usage; exit 0 ;;
            -*) die "unknown option: $1" ;;
            *)
                [ -z "$VERSION" ] || die "more than one version given: $VERSION, $1"
                VERSION="$1"
                ;;
        esac
        shift
    done
    [ -n "$VERSION" ] || { usage >&2; die "missing version"; }
    [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "not a semver X.Y.Z version: $VERSION"
}

# Runs one gate with its output in its own log file. Gate functions chain
# their commands with && or `|| return 1`: errexit does not apply inside a
# function called as an `if` condition.
run_gate() {
    local name="$1"
    shift
    printf '  %-28s' "$name"
    if "$@" >"$LOG_DIR/$name.log" 2>&1; then
        printf 'ok\n'
    else
        printf 'FAIL\n'
        tail -n 40 "$LOG_DIR/$name.log" >&2
        die "gate '$name' failed; full log: $LOG_DIR/$name.log"
    fi
}

json_field() {
    node -p "require('./$1')$2"
}

require_tools() {
    local tool
    for tool in git node npm python3 docker tar; do
        command -v "$tool" >/dev/null 2>&1 || die "required tool not on PATH: $tool"
    done
    docker info >/dev/null 2>&1 || die "docker daemon is not running (needed for the Linux gate)"
    if [ "$MODE" = "release" ]; then
        command -v gh >/dev/null 2>&1 || die "required tool not on PATH: gh"
        gh auth status >/dev/null 2>&1 || die "gh is not authenticated (needed to watch the publish run)"
    fi
}

# ---------------------------------------------------------------------------
# Step 1: preconditions
# ---------------------------------------------------------------------------

check_preconditions() {
    step "1. Preconditions"
    local branch pkg
    branch="$(git rev-parse --abbrev-ref HEAD)"
    [ "$branch" = "$BRANCH" ] || die "on branch '$branch', releases are cut from '$BRANCH'"
    [ -z "$(git status --porcelain)" ] || die "working tree is not clean"
    git fetch --quiet origin "$BRANCH" || die "git fetch origin $BRANCH failed"
    git merge-base --is-ancestor "origin/$BRANCH" HEAD \
        || die "local $BRANCH is behind or diverged from origin/$BRANCH"
    if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
        die "tag $TAG already exists locally"
    fi
    if [ -n "$(git ls-remote --tags origin "refs/tags/$TAG")" ]; then
        die "tag $TAG already exists on origin"
    fi
    for pkg in $PACKAGES; do
        if [ -n "$(npm view "@softspark/$pkg@$VERSION" version 2>/dev/null)" ]; then
            die "@softspark/$pkg@$VERSION is already on npm"
        fi
    done
    echo "  branch $BRANCH, clean, not behind origin, $TAG unused"
}

# ---------------------------------------------------------------------------
# Step 2: version files, notes, release commit
# ---------------------------------------------------------------------------

check_version_and_notes() {
    step "2. Version and notes"
    local file actual subject key pkg
    for file in package.json packages/core/package.json packages/jira-mcp/package.json \
                packages/confluence-mcp/package.json package-lock.json; do
        actual="$(json_field "$file" ".version")"
        [ "$actual" = "$VERSION" ] || die "$file says $actual, expected $VERSION"
    done
    for key in "" packages/core packages/jira-mcp packages/confluence-mcp; do
        actual="$(json_field package-lock.json ".packages['$key']?.version")"
        [ "$actual" = "$VERSION" ] || die "package-lock.json packages[\"$key\"] says $actual, expected $VERSION"
    done
    grep -qE "^## v${VERSION//./\\.}( |$)" CHANGELOG.md || die "CHANGELOG.md has no '## v$VERSION' heading"
    for pkg in $PACKAGES; do
        grep -qF "## What's New in v$VERSION" "packages/$pkg/README.md" \
            || die "packages/$pkg/README.md has no 'What's New in v$VERSION' section"
    done
    subject="$(git log -1 --format=%s HEAD)"
    [ "$subject" = "chore: release v$VERSION" ] || die "HEAD is '$subject', expected 'chore: release v$VERSION'"
    echo "  versions, CHANGELOG, READMEs and release commit agree on $VERSION"
}

# ---------------------------------------------------------------------------
# Step 3: local gates
# ---------------------------------------------------------------------------

gate_required_files() {
    local f p
    for f in LICENSE NOTICE CHANGELOG.md SECURITY.md CODE_OF_CONDUCT.md README.md CLAUDE.md \
             package.json package-lock.json .gitignore .npmignore .npmrc \
             tsconfig.json tsconfig.base.json vitest.config.ts eslint.config.mjs \
             .github/CONTRIBUTING.md .github/PULL_REQUEST_TEMPLATE.md .github/CODEOWNERS \
             .github/FUNDING.yml .github/dependabot.yml .github/ISSUE_TEMPLATE/config.yml \
             .github/ISSUE_TEMPLATE/bug_report.md .github/ISSUE_TEMPLATE/feature_request.md \
             .github/workflows/publish.yml \
             kb/procedures/sop-pre-commit.md kb/procedures/sop-release.md \
             kb/procedures/sop-post-release-testing.md kb/reference/architecture.md \
             kb/reference/api.md kb/reference/configuration.md kb/reference/audit.md \
             kb/reference/confluence.md kb/howto/setup.md rules/jira-mcp.md \
             packages/core/package.json packages/jira-mcp/hooks/jira-mcp-hooks.json; do
        [ -s "$f" ] || { echo "missing or empty: $f"; return 1; }
    done
    # Every published package carries its own licence, notice, readme and build config.
    for p in $PACKAGES; do
        for f in package.json tsconfig.json tsup.config.ts README.md LICENSE NOTICE; do
            [ -s "packages/$p/$f" ] || { echo "missing or empty: packages/$p/$f"; return 1; }
        done
    done
    echo "all required files present"
}

gate_publish_workflow() {
    local wf=".github/workflows/$PUBLISH_WORKFLOW"
    grep -q -- '--provenance' "$wf" || { echo "$wf lost --provenance"; return 1; }
    grep -q 'id-token: write' "$wf" || { echo "$wf lost id-token: write"; return 1; }
}

gate_licence_banner() {
    local p
    for p in $PACKAGES; do
        grep -q 'Apache-2.0' "packages/$p/dist/index.js" "packages/$p/dist/cli.js" \
            || { echo "packages/$p/dist lost the licence banner"; return 1; }
    done
}

# Content fingerprint of every tracked and untracked (not ignored) file. dist/
# and the per-package CHANGELOG copies are committed, so a build that changes
# them means the release commit carries stale build output. Index state is left
# out on purpose: staging changes nothing that ships.
tree_fingerprint() {
    { git ls-files -z --cached --others --exclude-standard | sort -zu \
        | xargs -0 shasum 2>/dev/null || true; } | shasum | cut -d' ' -f1
}

run_host_gates() {
    step "3. Gates (host: $(uname -s)), logs in $LOG_DIR"
    local before
    before="$(tree_fingerprint)"
    run_gate required-files gate_required_files
    run_gate npm-ci npm ci
    run_gate typecheck npm run typecheck
    run_gate lint npm run lint
    run_gate test-coverage npm run test:coverage
    run_gate build npm run build
    run_gate licence-banner gate_licence_banner
    run_gate validate-counts python3 scripts/validate_counts.py --full
    run_gate publish-workflow gate_publish_workflow
    grep -E 'Tests +[0-9]+' "$LOG_DIR/test-coverage.log" | tail -n 1 | sed 's/^/  /' || true
    if [ "$(tree_fingerprint)" != "$before" ]; then
        git status --short
        die "the gates changed the working tree (stale dist/ or CHANGELOG copies?): rebuild and commit"
    fi
}

# ---------------------------------------------------------------------------
# Step 4: Linux (throwaway container, repository copied in)
# ---------------------------------------------------------------------------

# Tracked plus untracked-but-not-ignored files that exist on disk, plus .git.
# Equals HEAD on a release (clean tree); on --gates-only it is the working tree.
write_source_tarball() {
    local list="$LOG_DIR/source-files.list" f
    git ls-files -z --cached --others --exclude-standard | while IFS= read -r -d '' f; do
        [ -e "$f" ] || [ -L "$f" ] || continue
        printf '%s\0' "$f"
    done >"$list"
    printf '.git\0' >>"$list"
    if tar --version 2>/dev/null | grep -q bsdtar; then
        # macOS: no AppleDouble files or xattr headers in the archive.
        COPYFILE_DISABLE=1 tar --no-xattrs --no-mac-metadata -cf "$SOURCE_TAR" --null -T "$list"
    else
        tar -cf "$SOURCE_TAR" --null -T "$list"
    fi
}

# The suite on a case-sensitive filesystem and Linux paths, as the unprivileged
# `node` user of the official image.
gate_tests_linux() {
    docker run --rm -i -e NO_COLOR=1 "$LINUX_IMAGE" bash -euc '
        mkdir -p /home/node/repo && tar --no-same-owner -xf - -C /home/node/repo
        chown -R node:node /home/node/repo
        cd /home/node/repo
        runuser -u node -- env HOME=/home/node sh -c "npm ci --no-audit --no-fund && npm run test:coverage"
    ' <"$SOURCE_TAR"
}

run_linux_gate() {
    step "4. Linux ($LINUX_IMAGE, non-root)"
    SOURCE_TAR="$LOG_DIR/source.tar"
    write_source_tarball || die "could not build the source tarball"
    run_gate tests-linux gate_tests_linux
    grep -E 'Tests +[0-9]+' "$LOG_DIR/tests-linux.log" | tail -n 1 | sed 's/^/  /' || true
    rm -f "$SOURCE_TAR"
}

# ---------------------------------------------------------------------------
# Step 5: build the tarballs the tag publishes, start each CLI once
# ---------------------------------------------------------------------------

gate_pack() {
    local p
    rm -f "$LOG_DIR"/softspark-*.tgz
    for p in $PACKAGES; do
        npm pack --workspace "@softspark/$p" --pack-destination "$LOG_DIR" || return 1
        [ -s "$LOG_DIR/softspark-$p-$PKG_VERSION.tgz" ] || { echo "no tarball for $p $PKG_VERSION"; return 1; }
    done
}

gate_smoke() {
    local sandbox="$LOG_DIR/smoke" p reported
    rm -rf "$sandbox" && mkdir -p "$sandbox/home" "$sandbox/prefix" || return 1
    HOME="$sandbox/home" npm install --global --prefix "$sandbox/prefix" --no-audit --no-fund \
        "$LOG_DIR/softspark-jira-mcp-$PKG_VERSION.tgz" "$LOG_DIR/softspark-confluence-mcp-$PKG_VERSION.tgz" || return 1
    for p in $PACKAGES; do
        reported="$(HOME="$sandbox/home" "$sandbox/prefix/bin/$p" --version)" || return 1
        [ "$reported" = "$PKG_VERSION" ] || { echo "$p reports $reported"; return 1; }
        HOME="$sandbox/home" "$sandbox/prefix/bin/$p" --help || return 1
    done
    rm -rf "$sandbox"
}

run_build_and_smoke() {
    step "5. Build and smoke"
    run_gate npm-pack gate_pack
    run_gate smoke-install gate_smoke
    echo "  tarballs in $LOG_DIR"
}

# ---------------------------------------------------------------------------
# Steps 6-7: tag, push, watch publish
# ---------------------------------------------------------------------------

tag_and_push() {
    step "6. Tag and push"
    local head
    head="$(git rev-parse HEAD)"
    # Annotated: tag.gpgSign rejects a bare tag in the maintainer's checkout.
    git tag -a "$TAG" -m "Release $TAG" "$head"
    [ "$(git rev-parse "$TAG^{commit}")" = "$head" ] || die "tag $TAG is not on HEAD"
    [ "$(git log -1 --format=%s "$TAG^{commit}")" = "chore: release $TAG" ] || die "tag $TAG is not on the release commit"
    git push origin "$BRANCH"
    git push origin "refs/tags/$TAG"
    echo "  pushed $BRANCH and $TAG ($head)"
}

find_publish_run() {
    local sha="$1" attempt run_id
    for attempt in $(seq 1 "$WAIT_ATTEMPTS"); do
        run_id="$(gh run list --repo "$REPO_SLUG" --workflow "$PUBLISH_WORKFLOW" --event push \
            --commit "$sha" --limit 1 --json databaseId --jq '.[0].databaseId // empty')"
        [ -n "$run_id" ] && { echo "$run_id"; return 0; }
        echo "  waiting for the publish run to register ($attempt/$WAIT_ATTEMPTS)" >&2
        sleep "$WAIT_SECONDS"
    done
    return 1
}

verify_npm() {
    local pkg="@softspark/$1" attempt published provenance
    for attempt in $(seq 1 "$WAIT_ATTEMPTS"); do
        published="$(npm view "$pkg@$VERSION" version 2>/dev/null || true)"
        [ "$published" = "$VERSION" ] && break
        echo "  waiting for npm to list $pkg@$VERSION ($attempt/$WAIT_ATTEMPTS)"
        sleep "$WAIT_SECONDS"
    done
    [ "$published" = "$VERSION" ] || die "$pkg@$VERSION is not on npm"
    provenance="$(npm view "$pkg@$VERSION" dist.attestations.provenance.predicateType 2>/dev/null || true)"
    [ "$provenance" = "https://slsa.dev/provenance/v1" ] || die "$pkg@$VERSION has no SLSA provenance attestation"
    echo "  npm: $pkg@$VERSION published with provenance"
}

watch_publish() {
    step "7. Watch publish"
    local sha run_id p
    sha="$(git rev-parse "$TAG^{commit}")"
    run_id="$(find_publish_run "$sha")" || die "no $PUBLISH_WORKFLOW run found for $TAG"
    gh run watch "$run_id" --repo "$REPO_SLUG" --exit-status \
        || die "publish run $run_id failed: gh run view $run_id --repo $REPO_SLUG --log-failed"
    echo "  publish run $run_id succeeded"
    for p in $PACKAGES; do
        verify_npm "$p"
    done
    gh release view "$TAG" --repo "$REPO_SLUG" >/dev/null || die "GitHub Release $TAG is missing"
    echo "  GitHub Release $TAG exists"
}

print_remaining_steps() {
    step "6-7. Dry run: not executed"
    cat <<EOF
  git tag -a $TAG -m "Release $TAG" $(git rev-parse HEAD)
  assert $TAG^{commit} = HEAD and its subject is 'chore: release $TAG'
  git push origin $BRANCH
  git push origin refs/tags/$TAG
  gh run watch <$PUBLISH_WORKFLOW run for $TAG> --exit-status
  npm view @softspark/{jira-mcp,confluence-mcp}@$VERSION version + SLSA provenance, gh release view $TAG
EOF
}

main() {
    parse_args "$@"
    cd "$REPO_ROOT"
    TAG="v$VERSION"
    LOG_DIR="${TMPDIR:-/tmp}"
    LOG_DIR="${LOG_DIR%/}/jira-mcp-release-$VERSION"
    mkdir -p "$LOG_DIR"
    printf 'jira-mcp release %s (%s), logs in %s\n' "$TAG" "$MODE" "$LOG_DIR"
    # Equals VERSION once step 2 passed; --gates-only packs whatever is checked out.
    PKG_VERSION="$(json_field package.json ".version")"

    require_tools
    if [ "$MODE" != "gates-only" ]; then
        check_preconditions
        check_version_and_notes
    fi
    run_host_gates
    run_linux_gate
    run_build_and_smoke
    case "$MODE" in
        release)
            tag_and_push
            watch_publish
            printf '\nReleased %s. Next: kb/procedures/sop-post-release-testing.md\n' "$TAG"
            ;;
        dry-run) print_remaining_steps ;;
        gates-only) printf '\nAll gates passed on the working tree. Nothing was tagged.\n' ;;
    esac
}

main "$@"
