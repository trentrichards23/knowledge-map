#!/usr/bin/env python3
"""
sync-brain-to-memory.py — Derive Claude memory files from brain-memory.json

Usage:
  python3 scripts/sync-brain-to-memory.py
  python3 scripts/sync-brain-to-memory.py --dry-run   # print output, don't write

What it does:
  1. Reads web-private/public/data/brain-memory.json (source of truth)
  2. Generates Claude memory files at ~/.claude/projects/-Users-trentonrichards/memory/
  3. Rewrites MEMORY.md index to match

Files generated:
  - user_profile.md         (from personal/goal/belief nodes + profile meta)
  - project_<id>.md         (one per project node)
  - feedback_api_keys.md    (preserved as-is — not derivable from brain)
  - reference_vault.md      (preserved as-is)
  - reference_remote_terminal.md (preserved as-is)

Run as part of vault-it workflow AFTER update-brain.py.
"""

import json
import sys
import argparse
from pathlib import Path
from datetime import date

TODAY = date.today().isoformat()

parser = argparse.ArgumentParser()
parser.add_argument("--dry-run", action="store_true")
args = parser.parse_args()

# ── Paths ──────────────────────────────────────────────────────────────────────

scripts_dir  = Path(__file__).parent
repo_root    = scripts_dir.parent
private_json = repo_root / "web-private" / "public" / "data" / "brain-memory.json"
memory_dir   = Path.home() / ".claude/projects/-Users-trentonrichards/memory"

if not private_json.exists():
    print(f"brain-memory.json not found: {private_json}")
    sys.exit(1)

brain = json.loads(private_json.read_text())
nodes = brain["nodes"]

# Index by id and type
by_id   = {n["id"]: n for n in nodes}
by_type = {}
for n in nodes:
    t = n.get("type", "none")
    by_type.setdefault(t, []).append(n)

# ── Helpers ────────────────────────────────────────────────────────────────────

def write_file(path: Path, content: str):
    if args.dry_run:
        print(f"\n{'='*60}")
        print(f"FILE: {path}")
        print('='*60)
        print(content)
    else:
        path.write_text(content)
        print(f"  ✓ {path.name}")

def top_skills(domain: str, n: int = 5) -> list[str]:
    skills = [nd for nd in nodes if nd.get("domain") == domain and nd.get("type") in ("skill", "tool", "concept")]
    skills.sort(key=lambda x: x.get("score", 0), reverse=True)
    return [s["label"] for s in skills[:n]]

def proficiency_bar(score: int) -> str:
    filled = round(score / 10 * 5)
    return "█" * filled + "░" * (5 - filled)

# ── 1. user_profile.md ────────────────────────────────────────────────────────

goals    = [n for n in by_type.get("goal", [])    if n.get("visibility") != "public"]
beliefs  = [n for n in by_type.get("belief", [])  if n.get("score", 0) >= 7]
personal = [n for n in by_type.get("practice", [])]

# Top skills per domain for the profile
ai_skills  = top_skills("ai-ml", 6)
web_skills = top_skills("web", 5)
sys_skills = top_skills("systems", 4)

goal_lines   = "\n".join(f"- **{g['label']}** (score {g.get('score',5)}/10)" + (f" — {g.get('notes','')}" if g.get('notes') else "") for g in sorted(goals, key=lambda x: -x.get("score",0)))
belief_lines = "\n".join(f"- **{b['label']}**" + (f" — {b.get('notes','')}" if b.get('notes') else "") for b in beliefs)

user_profile = f"""---
name: User Profile — Trenton Richards
description: Who Trenton is, his goals, target companies, communication style, and how to work with him
type: user
---

**Name:** Trenton Richards
**Location:** Provo, UT
**School:** BYU — Strategic Management, Junior (1 year left as of early 2026)
**Internship timeline:** Actively applying, semester ends ~May 2026

## Identity & Goals
Builder identity — wants to be the guy building things that surprise people. Riding the AI wave intentionally, not just using tools. Target companies: Anduril, Anthropic, Nvidia, Palantir, Scale AI, Shield AI, Rebellion Defense. Interested in defense tech, AI, hardware. Open to Technical PM, Strategy & Ops, Biz Dev roles.

## Background
- BYU Marriott Strategic Management
- PwC AI Research Consultant (Jan–Apr 2026) via BYU OCI program — researched enterprise AI adoption, workforce transformation, final presentation to PwC senior leadership
- Differentiators: business strategy + technical AI builder + Cantonese (HK) + Japanese

## Top Skills (from brain — last synced {TODAY})
**AI/ML:** {', '.join(ai_skills)}
**Web:** {', '.join(web_skills)}
**Systems:** {', '.join(sys_skills)}

## Goals
{goal_lines if goal_lines else '(none in brain yet)'}

## Core Beliefs
{belief_lines if belief_lines else '(none in brain yet)'}

## Communication & Work Style
- Casual, direct, no fluff — match that energy
- Explain when something is new to him; move fast when he already has a grasp
- Build first, refine later — leans toward shipping and iterating
- Will push back if something doesn't feel right
- Often working from iPhone via Tailscale + Termius + tmux
"""

write_file(memory_dir / "user_profile.md", user_profile)

# ── 2. project_<id>.md — one per project node ────────────────────────────────

PRESERVED_FILES = {
    "feedback_api_keys.md",
    "reference_vault.md",
    "reference_remote_terminal.md",
}

# Map project node ids to known paths
PROJECT_PATHS = {
    "autotrader":           "~/projects/autotrader/app/autotrader.py",
    "clipper":              "~/projects/clipper/app/clipper.py",
    "portfolio-website":    "~/projects/portfolio/",
    "clock-in":             "~/Documents/clock-in/",
    "job-search-pipeline":  "~/projects/job-search/",
    "lead-generator":       "~/projects/scraper/scraper.py",
    "knowledge-map-project":"~/projects/knowledge-map/",
}

STATUS_EMOJI = {
    "fluent":  "✅",
    "working": "🟡",
    "novice":  "🔴",
}

project_nodes = by_type.get("project", [])
index_entries = []  # (filename, name, description)

for p in project_nodes:
    pid      = p["id"]
    label    = p.get("label", pid)
    score    = p.get("score", 5)
    prof     = p.get("proficiency", "working")
    notes    = p.get("notes", "")
    path     = PROJECT_PATHS.get(pid, "")
    status   = STATUS_EMOJI.get(prof, "🟡")
    conns    = p.get("connections", [])
    # filter to skill/tool connections only
    skill_conns = [c for c in conns if not c.startswith("domain-") and c in by_id]
    related_labels = [by_id[c]["label"] for c in skill_conns[:6] if c in by_id]

    slug = f"project_{pid.replace('-', '_')}.md"

    content = f"""---
name: Project: {label}
description: {label} — status, path, and key context for Claude
type: project
---

**Status:** {status} ({prof})
**Score:** {score}/10  {proficiency_bar(score)}
**Path:** `{path}`
**Last updated:** {p.get('last_updated', TODAY)}

{notes if notes else ''}

## Key Skills Used
{', '.join(related_labels) if related_labels else '(see brain for full connections)'}
"""

    write_file(memory_dir / slug, content)
    desc = f"{label} — {notes[:80] + '...' if len(notes) > 80 else notes}" if notes else label
    index_entries.append((slug, f"Project: {label}", desc))

# ── 3. Rewrite MEMORY.md ─────────────────────────────────────────────────────

# Static entries (preserved files + status tracker)
static_entries = [
    ("user_profile.md",              "User Profile",             "Trenton Richards: BYU junior, builder identity, target companies, work style"),
    ("reference_vault.md",           "Vault Location",           "Obsidian vault at ~/Documents/my-vault with projects, journal, notes"),
    ("reference_remote_terminal.md", "Remote Terminal Setup",    "Tailscale + tmux + Termius stack for iPhone → Mac terminal access. Mac IP: 100.98.168.37"),
    ("feedback_api_keys.md",         "Feedback: API Keys",       "Never suggest ANTHROPIC_API_KEY in env/files; Pro plan via claude.ai only"),
    ("project_status_ref.md",        "Project Status Tracker",   "Live sprint tracker at ~/Documents/my-vault/Projects/PROJECT-STATUS.md"),
]

# Build project lines from generated files
project_lines = [
    f"- [{name}]({slug}) — {desc}"
    for slug, name, desc in index_entries
]

static_lines = [
    f"- [{name}]({slug}) — {desc}"
    for slug, name, desc in static_entries
]

# Top skills summary line for quick context
top_all = sorted([n for n in nodes if n.get("type") in ("skill","tool") and n.get("score",0) >= 7],
                 key=lambda x: -x.get("score",0))[:8]
top_str = ", ".join(n["label"] for n in top_all)

memory_index = f"""# Memory Index
> Auto-synced from brain-memory.json on {TODAY}. Edit the brain, not these files.
> Top skills: {top_str}

{chr(10).join(static_lines)}

## Projects (from brain)
{chr(10).join(project_lines)}
"""

write_file(memory_dir / "MEMORY.md", memory_index)

# ── Done ──────────────────────────────────────────────────────────────────────

if not args.dry_run:
    print(f"\n✓ Synced {len(project_nodes)} project files + user_profile.md + MEMORY.md")
    print(f"  Source: {private_json}")
    print(f"  Target: {memory_dir}")
