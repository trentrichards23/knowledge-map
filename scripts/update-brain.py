#!/usr/bin/env python3
"""
update-brain.py — Session-end knowledge map updater

Run this at the end of a Claude session:
  python3 scripts/update-brain.py

What it does:
  1. Finds the most recent Claude session JSONL
  2. Extracts the conversation text
  3. Prints a prompt for Claude to analyze (you paste the output back into Claude)
  4. Claude outputs JSON diffs for both public + private maps
  5. Script applies the diffs and commits via GitHub API
"""

import json
import os
import sys
import glob
import base64
import urllib.request
import urllib.error
from datetime import date
from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────────

REPO        = "trentrichards23/knowledge-map"
PUBLIC_PATH = "web/public/data/knowledge-map-memory.json"
PRIVATE_PATH = "web-private/public/data/brain-memory.json"
SESSIONS_DIR = Path.home() / ".claude" / "projects" / "-Users-trentonrichards"
TODAY       = date.today().isoformat()

# Load GitHub token from env or .env file
def load_token():
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        return token
    env_file = Path(__file__).parent / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.startswith("GITHUB_TOKEN="):
                return line.split("=", 1)[1].strip()
    print("ERROR: No GITHUB_TOKEN found. Set it in scripts/.env or as env var.")
    sys.exit(1)

# ── Step 1: Find latest session JSONL ─────────────────────────────────────────

def get_latest_session():
    files = sorted(SESSIONS_DIR.glob("*.jsonl"), key=lambda f: f.stat().st_mtime, reverse=True)
    if not files:
        print("ERROR: No session files found in", SESSIONS_DIR)
        sys.exit(1)
    return files[0]

# ── Step 2: Extract conversation text ─────────────────────────────────────────

def extract_conversation(jsonl_path: Path, max_chars=40000) -> str:
    lines = []
    for raw in jsonl_path.read_text().splitlines():
        try:
            obj = json.loads(raw)
        except json.JSONDecodeError:
            continue

        if obj.get("type") not in ("user", "assistant"):
            continue

        msg = obj.get("message", {})
        role = msg.get("role", "")
        content = msg.get("content", "")

        text = ""
        if isinstance(content, list):
            for block in content:
                if isinstance(block, dict) and block.get("type") == "text":
                    text = block["text"]
                    break
        elif isinstance(content, str):
            text = content

        if text.strip():
            lines.append(f"{role.upper()}: {text.strip()}")

    full = "\n\n".join(lines)
    # Truncate if too long — keep the end (most recent exchanges matter most)
    if len(full) > max_chars:
        full = "...[truncated]\n\n" + full[-max_chars:]
    return full

# ── Step 3: Load current JSON files ───────────────────────────────────────────

def load_current_jsons():
    public_file  = Path(__file__).parent.parent / "web" / "public" / "data" / "knowledge-map-memory.json"
    private_file = Path(__file__).parent.parent / "web-private" / "public" / "data" / "brain-memory.json"
    public_data  = json.loads(public_file.read_text())
    private_data = json.loads(private_file.read_text())
    return public_data, private_data

# ── Step 4: Print analysis prompt ─────────────────────────────────────────────

def print_analysis_prompt(conversation: str, public_data: dict, private_data: dict):
    existing_ids = [n["id"] for n in public_data["nodes"]]

    print("\n" + "="*70)
    print("PASTE THIS INTO CLAUDE TO GET THE JSON DIFFS:")
    print("="*70 + "\n")
    print(f"""You are analyzing a Claude Code session to update a knowledge map.
Today's date: {TODAY}

Existing public node IDs (don't duplicate these):
{json.dumps(existing_ids, indent=2)}

Based on the session below, output a JSON object with this exact structure:
{{
  "public_updates": [
    // For existing nodes: {{ "id": "...", "score": N, "session_count": N, "last_updated": "{TODAY}", "history_entry": {{ "date": "{TODAY}", "score": N }} }}
    // For new nodes: full node object with all fields
  ],
  "private_updates": [
    // Same format — can include personal/belief/goal/interest nodes too
  ],
  "new_connections": [
    // {{ "from": "node-id", "to": "node-id" }}
  ],
  "session_summary": "2-3 sentence summary of what was covered"
}}

Only include nodes that were meaningfully touched this session.
For scores, use 1-10. Proficiency: novice (<4), working (4-7), fluent (8+).

SESSION TRANSCRIPT:
{conversation}
""")
    print("="*70)
    print("\nAfter Claude responds, paste the JSON output and run:")
    print("  python3 scripts/update-brain.py --apply <path-to-diff.json>")
    print("="*70 + "\n")

# ── Step 5: Apply diffs ────────────────────────────────────────────────────────

def apply_diffs(diff_path: str):
    diff = json.loads(Path(diff_path).read_text())

    public_file  = Path(__file__).parent.parent / "web" / "public" / "data" / "knowledge-map-memory.json"
    private_file = Path(__file__).parent.parent / "web-private" / "public" / "data" / "brain-memory.json"

    public_data  = json.loads(public_file.read_text())
    private_data = json.loads(private_file.read_text())

    def apply_updates(data, updates):
        node_map = {n["id"]: n for n in data["nodes"]}
        for update in updates:
            node_id = update["id"]
            if node_id in node_map:
                # Update existing node
                node = node_map[node_id]
                for key, val in update.items():
                    if key == "history_entry":
                        # Append to history if date not already there
                        if not any(h["date"] == val["date"] for h in node["history"]):
                            node["history"].append(val)
                    elif key != "id":
                        node[key] = val
            else:
                # New node — validate required fields before adding
                required = {"id", "domain", "first_seen", "label", "type"}
                missing = required - set(update.keys())
                if missing:
                    print(f"⚠ Skipping new node '{node_id}' — missing fields: {missing}")
                    continue
                if not isinstance(update.get("history"), list):
                    update["history"] = []
                if not isinstance(update.get("connections"), list):
                    update["connections"] = []
                if not update.get("proficiency"):
                    update["proficiency"] = "learning"
                data["nodes"].append(update)
        data["meta"]["last_updated"] = TODAY
        data["meta"]["total_sessions"] = data["meta"].get("total_sessions", 0) + 1
        return data

    def apply_connections(data, connections):
        node_map = {n["id"]: n for n in data["nodes"]}
        for conn in connections:
            src = node_map.get(conn["from"])
            tgt_id = conn["to"]
            if src and tgt_id not in src.get("connections", []):
                src.setdefault("connections", []).append(tgt_id)
        return data

    public_data  = apply_updates(public_data,  diff.get("public_updates", []))
    private_data = apply_updates(private_data, diff.get("private_updates", []))
    public_data  = apply_connections(public_data,  diff.get("new_connections", []))
    private_data = apply_connections(private_data, diff.get("new_connections", []))

    public_file.write_text(json.dumps(public_data, indent=2))
    private_file.write_text(json.dumps(private_data, indent=2))
    print(f"✓ Applied {len(diff.get('public_updates',[]))} public updates")
    print(f"✓ Applied {len(diff.get('private_updates',[]))} private updates")

    # ── Sync shared UI files from web/ → web-private/ ────────────────────────
    repo_root = Path(__file__).parent.parent
    SYNC_PAIRS = [
        ("web/components/KnowledgeGraph.tsx",     "web-private/components/KnowledgeGraph.tsx"),
        ("web/components/KnowledgeMapViewer.tsx",  "web-private/components/KnowledgeMapViewer.tsx"),
        ("web/components/LegendFilter.tsx",        "web-private/components/LegendFilter.tsx"),
        ("web/components/NodeDetailPanel.tsx",     "web-private/components/NodeDetailPanel.tsx"),
        ("web/components/TimelineScrubber.tsx",    "web-private/components/TimelineScrubber.tsx"),
        ("web/app/globals.css",                    "web-private/app/globals.css"),
    ]
    synced = []
    for src_rel, dst_rel in SYNC_PAIRS:
        src = repo_root / src_rel
        dst = repo_root / dst_rel
        if src.exists():
            dst.write_bytes(src.read_bytes())
            synced.append(dst_rel)
    if synced:
        print(f"✓ Synced {len(synced)} UI files from web/ → web-private/")

    if diff.get("session_summary"):
        print(f"\nSession summary: {diff['session_summary']}")

    commit_to_github(public_data, private_data, diff.get("session_summary", "Session update"), synced)

# ── Step 6: Commit via GitHub API ─────────────────────────────────────────────

def github_api(endpoint: str, method: str, token: str, body: dict = None):
    url = f"https://api.github.com{endpoint}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(
        url, data=data, method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())

def get_file_sha(path: str, token: str) -> str:
    result = github_api(f"/repos/{REPO}/contents/{path}", "GET", token)
    return result["sha"]

def commit_file(path: str, content: str, sha: str, message: str, token: str):
    encoded = base64.b64encode(content.encode()).decode()
    github_api(f"/repos/{REPO}/contents/{path}", "PUT", token, {
        "message": message,
        "content": encoded,
        "sha": sha,
    })
    print(f"✓ Committed {path}")

def commit_to_github(public_data: dict, private_data: dict, summary: str, ui_files: list = None):
    token = load_token()
    message = f"brain update {TODAY}: {summary[:60]}"

    public_content  = json.dumps(public_data, indent=2)
    private_content = json.dumps(private_data, indent=2)

    repo_root = Path(__file__).parent.parent

    try:
        public_sha  = get_file_sha(PUBLIC_PATH, token)
        private_sha = get_file_sha(PRIVATE_PATH, token)
        commit_file(PUBLIC_PATH,  public_content,  public_sha,  message, token)
        commit_file(PRIVATE_PATH, private_content, private_sha, message, token)

        for rel_path in (ui_files or []):
            full_path = repo_root / rel_path
            if not full_path.exists():
                continue
            try:
                sha = get_file_sha(rel_path, token)
                commit_file(rel_path, full_path.read_text(encoding="utf-8"), sha, message, token)
            except urllib.error.HTTPError as e:
                print(f"⚠ Could not commit {rel_path}: {e.code} {e.reason}")

        print(f"\n✓ Both files committed to GitHub — Vercel will rebuild automatically")
    except urllib.error.HTTPError as e:
        print(f"ERROR committing to GitHub: {e.code} {e.reason}")
        print("Make sure GITHUB_TOKEN is set and has write access to the repo.")

# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if "--apply" in sys.argv:
        idx = sys.argv.index("--apply")
        if idx + 1 >= len(sys.argv):
            print("Usage: update-brain.py --apply <diff.json>")
            sys.exit(1)
        apply_diffs(sys.argv[idx + 1])
    else:
        session  = get_latest_session()
        print(f"Using session: {session.name}")
        convo    = extract_conversation(session)
        pub, prv = load_current_jsons()
        print_analysis_prompt(convo, pub, prv)
