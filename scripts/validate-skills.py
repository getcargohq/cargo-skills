#!/usr/bin/env python3
"""Validate skill files: frontmatter, cross-references, and silent-failure typos.

Catches:
  - SKILL.md frontmatter missing `name`, `description`, or `version`
  - SKILL.md `name:` not matching its directory name
  - Broken markdown-link cross-refs `[text](path.md)`
  - Broken backtick cross-refs `` `path.md` `` (only when the path looks
    intentionally internal — starts with `./`, `../`, `cargo[-/]`, or a known
    skill subdirectory prefix; example context-domain paths like `persona/x.md`
    used in docs are skipped)
  - English "conjunction" typo in JSON examples — the Cargo filter shape uses
    French `conjonction`; typos fail silently with zero records
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

REQUIRED_FRONTMATTER_KEYS = {"name", "description", "version"}

INTERNAL_PREFIXES = (
    "references/",
    "recipes/",
    "guides/",
    "provider-playbooks/",
    "agents/",
    "examples/",
)

FENCE_RE = re.compile(r"^\s*```")
MD_LINK_RE = re.compile(r"\[[^\]]*\]\(([^)\s]+)\)")
BACKTICK_PATH_RE = re.compile(r"`([^`\s]+\.mdx?)`")
CONJUNCTION_RE = re.compile(r'"conjunction"\s*:')


def find_skill_dirs() -> list[Path]:
    return sorted(p.parent for p in REPO_ROOT.glob("*/SKILL.md"))


def parse_frontmatter(text: str) -> str | None:
    if not text.startswith("---\n"):
        return None
    end = text.find("\n---\n", 4)
    if end == -1:
        return None
    return text[4:end]


def strip_code_fences(text: str) -> str:
    """Blank out fenced code blocks, preserving line numbers."""
    out: list[str] = []
    in_fence = False
    for line in text.split("\n"):
        if FENCE_RE.match(line):
            in_fence = not in_fence
            out.append("")
            continue
        out.append("" if in_fence else line)
    return "\n".join(out)


PLACEHOLDER_CHARS = set("*<>{}")


def should_validate_backtick_path(target: str, source_dir: Path) -> bool:
    if target.startswith(("./", "../")):
        return True
    if target.startswith("cargo-") or target.startswith("cargo/"):
        return True
    if any(target.startswith(p) for p in INTERNAL_PREFIXES):
        return True
    # Bare filename next to source (e.g. `SKILL.md`, `README.md`, `nodes.md`)
    if "/" not in target and (source_dir / target).exists():
        return True
    return False


def is_external(target: str) -> bool:
    return target.startswith(("http://", "https://", "mailto:", "#"))


def find_skill_dir(p: Path) -> Path | None:
    cur = p.parent if p.is_file() else p
    while cur != REPO_ROOT and cur != cur.parent:
        if (cur / "SKILL.md").exists():
            return cur
        cur = cur.parent
    return None


def resolves_anywhere(source: Path, target: str) -> bool:
    """Try multiple resolution frames — source-relative, skill-relative,
    repo-relative, and any-skill — to match the conventions used in prose."""
    candidates: list[Path] = []
    candidates.append((source.parent / target).resolve())
    skill_dir = find_skill_dir(source)
    if skill_dir is not None:
        candidates.append((skill_dir / target).resolve())
    candidates.append((REPO_ROOT / target).resolve())
    # Final fallback: any-skill resolution. The docs often say
    # `references/X.md` or `<skill>/references/X.md` meaning "the file in
    # that skill's references/." If the target starts with a known internal
    # prefix, try every skill_dir/<target>.
    if any(target.startswith(p) for p in INTERNAL_PREFIXES) or target.startswith("cargo"):
        for sd in REPO_ROOT.glob("cargo*/SKILL.md"):
            candidates.append((sd.parent / target).resolve())
    return any(c.exists() for c in candidates)


def validate_path_ref(
    source: Path, target: str, line_no: int, errors: list[str], *, link: bool
) -> None:
    if is_external(target):
        return
    if "#" in target:
        target = target.split("#", 1)[0]
    if not target:
        return
    # Skip placeholders / glob patterns: `recipes/*.md`, `<slug>.md`, `{name}.md`
    if any(ch in target for ch in PLACEHOLDER_CHARS):
        return
    # Treat leading '/' as a conceptual path, not a repo path
    if target.startswith("/"):
        return
    if not target.endswith((".md", ".mdx")):
        return
    if not link and not should_validate_backtick_path(target, source.parent):
        return
    if resolves_anywhere(source, target):
        return
    rel = source.relative_to(REPO_ROOT)
    errors.append(f"{rel}:{line_no}: broken {'link' if link else 'reference'} -> {target}")


def validate_frontmatter(skill_md: Path, errors: list[str]) -> None:
    text = skill_md.read_text()
    fm = parse_frontmatter(text)
    rel = skill_md.relative_to(REPO_ROOT)
    if fm is None:
        errors.append(f"{rel}: missing YAML frontmatter")
        return
    keys: set[str] = set()
    for line in fm.split("\n"):
        m = re.match(r"^(\w+)\s*:", line)
        if m:
            keys.add(m.group(1))
    missing = REQUIRED_FRONTMATTER_KEYS - keys
    if missing:
        errors.append(f"{rel}: frontmatter missing keys: {sorted(missing)}")
    name_match = re.search(r"^name:\s*(\S+)", fm, re.MULTILINE)
    if name_match:
        name = name_match.group(1).strip("\"'")
        expected = skill_md.parent.name
        if name != expected:
            errors.append(
                f"{rel}: frontmatter name '{name}' does not match directory '{expected}'"
            )


def validate_file(md: Path, errors: list[str]) -> None:
    text = md.read_text()
    no_code = strip_code_fences(text)
    for i, line in enumerate(no_code.split("\n"), 1):
        for m in MD_LINK_RE.finditer(line):
            validate_path_ref(md, m.group(1), i, errors, link=True)
        for m in BACKTICK_PATH_RE.finditer(line):
            validate_path_ref(md, m.group(1), i, errors, link=False)
    # `conjunction` typo: check inside code fences too (that's where JSON lives)
    for i, line in enumerate(text.split("\n"), 1):
        if CONJUNCTION_RE.search(line):
            errors.append(
                f"{md.relative_to(REPO_ROOT)}:{i}: "
                f"'\"conjunction\":' should be '\"conjonction\":' (French spelling - silent failure)"
            )


def iter_markdown_files() -> list[Path]:
    files: list[Path] = []
    for ext in ("*.md", "*.mdx"):
        for p in REPO_ROOT.rglob(ext):
            if ".git" in p.parts:
                continue
            files.append(p)
    return sorted(files)


def main() -> int:
    errors: list[str] = []
    for skill_dir in find_skill_dirs():
        validate_frontmatter(skill_dir / "SKILL.md", errors)
    for md in iter_markdown_files():
        validate_file(md, errors)
    if errors:
        for e in errors:
            print(e, file=sys.stderr)
        print(f"\n{len(errors)} error(s)", file=sys.stderr)
        return 1
    print("All skill checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
