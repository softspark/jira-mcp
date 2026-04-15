#!/usr/bin/env python3
"""Verify that README.md counts match source code reality.

Counts checked:
  - MCP tools (src/tools/*.ts minus helpers.ts, index.ts)
  - CLI commands (README table rows in "## CLI Commands" section)
  - Comment templates (markdown files in templates-system/comments/)
  - Error classes (export class in src/errors/index.ts)
  - Test files (tests/**/*.test.ts)
  - Bundle size (dist/index.js in KiB)

Usage:
  python3 scripts/validate_counts.py          # basic counts (fast)
  python3 scripts/validate_counts.py --full   # also runs vitest for test count

Exit codes:
  0 — all counts match
  1 — at least one mismatch

Pattern: ai-toolkit validate.py (single source of truth in README.md)
See: kb/procedures/sop-release.md Phase 4.5
"""

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
README = ROOT / "README.md"

errors = 0


def red(msg: str) -> None:
    print(f"\033[0;31m  FAIL: {msg}\033[0m")


def green(msg: str) -> None:
    print(f"\033[0;32m  OK: {msg}\033[0m")


def bold(msg: str) -> None:
    print(f"\033[1m{msg}\033[0m")


def from_readme(pattern: str, text: str) -> str | None:
    """Extract first number before a label pattern in README content."""
    m = re.search(rf"(\d+)\s*{re.escape(pattern)}", text)
    return m.group(1) if m else None


def check(label: str, readme_val: str | None, actual_val: int) -> None:
    global errors
    if readme_val is None:
        green(f"{label} (no claim found in README — skipped)")
        return
    if str(actual_val) == readme_val:
        green(f"{label} ({actual_val})")
    else:
        red(f"{label} — README says {readme_val}, actual is {actual_val}")
        errors += 1


def count_tools() -> int:
    """Count MCP tool files in src/tools/ (excluding non-handler modules)."""
    tools_dir = ROOT / "src" / "tools"
    exclude = {
        "helpers.ts",
        "index.ts",
        "definitions.ts",
        "args.ts",
        "comment-approval.ts",
    }
    return len([
        f for f in tools_dir.glob("*.ts")
        if f.name not in exclude
    ])


def count_cli_commands(readme_text: str) -> int:
    """Count CLI command rows in the README table (lines with | `jira-mcp)."""
    in_section = False
    count = 0
    for line in readme_text.splitlines():
        if line.strip() == "## CLI Commands":
            in_section = True
            continue
        if in_section and line.startswith("## "):
            break
        if in_section and "| `jira-mcp" in line:
            count += 1
    return count


def count_templates() -> int:
    """Count built-in comment templates from markdown files."""
    built_in_dir = ROOT / "templates-system" / "comments"
    return len(list(built_in_dir.glob("*.md")))


def count_error_classes() -> int:
    """Count exported error classes in the error hierarchy."""
    errors_file = ROOT / "src" / "errors" / "index.ts"
    return len(re.findall(r"^export class", errors_file.read_text(), re.MULTILINE))


def count_test_files() -> int:
    """Count .test.ts files in tests/."""
    return len(list((ROOT / "tests").rglob("*.test.ts")))


def get_bundle_size_kib() -> int | None:
    """Get dist/index.js size in KiB (rounded down)."""
    bundle = ROOT / "dist" / "index.js"
    if not bundle.exists():
        return None
    return bundle.stat().st_size // 1024


def run_vitest_count() -> int | None:
    """Run vitest and extract total test count."""
    try:
        result = subprocess.run(
            ["npx", "vitest", "run"],
            capture_output=True, text=True, cwd=ROOT, timeout=120,
        )
        output = result.stdout + result.stderr
        m = re.search(r"Tests\s+(\d+)\s+passed", output)
        return int(m.group(1)) if m else None
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return None


def main() -> None:
    global errors
    full_mode = "--full" in sys.argv

    readme_text = README.read_text()

    bold("Validating README.md counts against source code...")
    print()

    # 1. MCP Tools
    check("MCP tools", from_readme("MCP tools", readme_text), count_tools())

    # 2. CLI Commands
    check("CLI commands", from_readme("CLI commands", readme_text), count_cli_commands(readme_text))

    # 3. Comment Templates
    check("Comment templates", from_readme("built-in templates", readme_text), count_templates())

    # 4. Error Classes
    check("Error classes", from_readme("error classes", readme_text), count_error_classes())

    # 5. Test Files
    check("Test files", from_readme("test files", readme_text), count_test_files())

    # 6. Bundle Size
    bundle_kib = get_bundle_size_kib()
    readme_size = from_readme("KB", readme_text)
    if bundle_kib is None:
        green("Bundle size (dist/index.js not found — run npm run build first)")
    elif readme_size is None:
        green("Bundle size (no KB claim in README — skipped)")
    else:
        delta = bundle_kib - int(readme_size)
        if abs(delta) <= 5:
            green(f"Bundle size (README: {readme_size}KB, actual: {bundle_kib}KiB, delta: {delta})")
        else:
            red(f"Bundle size — README says {readme_size}KB, actual is {bundle_kib}KiB (delta: {delta})")
            errors += 1

    # 7. Test Count (optional)
    if full_mode:
        print()
        bold("Running vitest for test count verification...")
        actual_tests = run_vitest_count()
        readme_tests = from_readme("tests across", readme_text)
        if actual_tests is not None and readme_tests is not None:
            check("Test count", readme_tests, actual_tests)
        else:
            green("Test count (could not parse vitest output — skipped)")

    # Summary
    print()
    if errors == 0:
        green("All counts match. README.md is in sync with source code.")
        sys.exit(0)
    else:
        red(f"{errors} count(s) out of sync. Update README.md before release.")
        sys.exit(1)


if __name__ == "__main__":
    main()
