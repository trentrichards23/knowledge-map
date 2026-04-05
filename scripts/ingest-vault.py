#!/usr/bin/env python3
"""
ingest-vault.py — Scan Obsidian vault and extract knowledge map signals

Usage:
  python3 scripts/ingest-vault.py [--vault ~/Documents/my-vault]
  python3 scripts/ingest-vault.py --dry-run   # print hits, no diff written

What it does:
  1. Walks all .md files in the vault
  2. Scores which skills/tools/concepts appear based on keyword matching
  3. Weights signals by file type: project notes > general notes > journal
  4. Cross-references against existing nodes (updates score/session_count)
  5. Proposes new nodes for signals not yet in the map
  6. Writes diff.json → apply with: python3 scripts/update-brain.py --apply scripts/diff.json
"""

import json
import re
import sys
import argparse
from pathlib import Path
from datetime import date
from collections import defaultdict

TODAY = date.today().isoformat()

# ── Args ──────────────────────────────────────────────────────────────────────

parser = argparse.ArgumentParser()
parser.add_argument("--vault", default=str(Path.home() / "Documents/my-vault"))
parser.add_argument("--dry-run", action="store_true", help="Print signals, skip writing diff")
args = parser.parse_args()

VAULT = Path(args.vault).expanduser()

if not VAULT.exists():
    print(f"Vault not found: {VAULT}")
    sys.exit(1)

# ── Load current maps ─────────────────────────────────────────────────────────

scripts_dir   = Path(__file__).parent
public_file   = scripts_dir.parent / "web" / "public" / "data" / "knowledge-map-memory.json"
private_file  = scripts_dir.parent / "web-private" / "public" / "data" / "brain-memory.json"

public_data   = json.loads(public_file.read_text())
private_data  = json.loads(private_file.read_text())

existing_ids  = {n["id"] for n in public_data["nodes"]}

# ── File weight by location ───────────────────────────────────────────────────
# Vault notes are deliberate writing — weight them above raw chat frequency.
# Projects/ = 3x, Notes/ = 2x, Journal/ = 1x

def file_weight(path: Path) -> int:
    rel = path.relative_to(VAULT)
    top = rel.parts[0] if rel.parts else ""
    if top == "Projects":
        return 3
    if top == "Notes":
        return 2
    return 1  # Journal, root, etc.

# ── Signal definitions ────────────────────────────────────────────────────────
# Same structure as ingest-chat-history.py SIGNALS.
# Vault-specific signals added below the shared set.

SIGNALS = {
    # ── AI / ML ───────────────────────────────────────────────────────────────
    "python":           {"keywords": ["python", ".py", "import ", "def ", "pip install"], "label": "Python", "type": "skill", "domain": "ai-ml"},
    "ollama":           {"keywords": ["ollama", "qwen2.5", "llama3", "mistral", "ollama run"], "label": "Ollama", "type": "tool", "domain": "ai-ml"},
    "groq":             {"keywords": ["groq", "groq api", "groq.com"], "label": "Groq API", "type": "tool", "domain": "ai-ml"},
    "rag":              {"keywords": ["rag pipeline", "retrieval-augmented", "vector store", "embeddings", "semantic search", "faiss", "chromadb", "pinecone", "llamaindex"], "label": "RAG Pipelines", "type": "concept", "domain": "ai-ml"},
    "prompt-eng":       {"keywords": ["prompt engineering", "system prompt", "few-shot", "chain of thought", "cot prompting"], "label": "Prompt Engineering", "type": "skill", "domain": "ai-ml"},
    "ai-agents":        {"keywords": ["ai agent", "multi-agent", "autonomous agent", "tool use", "function calling", "react agent", "agentic"], "label": "AI Agents", "type": "concept", "domain": "ai-ml"},
    "fine-tuning":      {"keywords": ["fine-tun", "lora", "qlora", "finetuning", "instruction tuning"], "label": "Fine-Tuning", "type": "concept", "domain": "ai-ml"},
    "pandas":           {"keywords": ["pandas", "pd.dataframe", "df.head", "df.merge", "read_csv", "to_csv"], "label": "Pandas", "type": "tool", "domain": "ai-ml"},
    "numpy":            {"keywords": ["numpy", "np.array", "np.mean", "import numpy"], "label": "NumPy", "type": "tool", "domain": "ai-ml"},
    "ai-research":      {"keywords": ["ai research", "research consultant", "llm research", "model evaluation", "pwc ai"], "label": "AI Research", "type": "skill", "domain": "ai-ml"},
    "llm-prompting":    {"keywords": ["llm", "large language model", "claude", "gpt-4", "llm output", "model output"], "label": "LLM Prompting", "type": "skill", "domain": "ai-ml"},
    "multi-agent":      {"keywords": ["multi-agent", "agent system", "agent pipeline", "agent framework", "swarm"], "label": "Multi-Agent Systems", "type": "concept", "domain": "ai-ml"},

    # ── Web Dev ───────────────────────────────────────────────────────────────
    "nextjs":           {"keywords": ["next.js", "nextjs", "app router", "server component", "use client"], "label": "Next.js", "type": "skill", "domain": "web"},
    "react":            {"keywords": ["react", "usestate", "useeffect", "usememo", "jsx", "tsx", "component"], "label": "React", "type": "skill", "domain": "web"},
    "typescript":       {"keywords": ["typescript", ".tsx", "interface ", "type ", ": string", ": number"], "label": "TypeScript", "type": "skill", "domain": "web"},
    "tailwind":         {"keywords": ["tailwind", "tailwind css", "className", "flex items-", "bg-white"], "label": "Tailwind CSS", "type": "tool", "domain": "web"},
    "vercel":           {"keywords": ["vercel", "vercel.com", "vercel deploy", "vercel.json", "deployed to vercel"], "label": "Vercel", "type": "tool", "domain": "web"},
    "cloudflare":       {"keywords": ["cloudflare", "cloudflare dns", "cf dns", "cloudflare pages"], "label": "Cloudflare", "type": "tool", "domain": "web"},
    "d3js":             {"keywords": ["d3.js", "d3.select", "d3.force", "d3.zoom", "import * as d3", "force simulation"], "label": "D3.js", "type": "skill", "domain": "web"},
    "fastapi":          {"keywords": ["fastapi", "from fastapi", "@app.get", "@app.post", "uvicorn"], "label": "FastAPI", "type": "tool", "domain": "web"},
    "html-css":         {"keywords": ["html", "css", "stylesheet", "border-radius", "display: flex", "grid-template"], "label": "HTML / CSS", "type": "skill", "domain": "web"},
    "rest-apis":        {"keywords": ["rest api", "http request", "fetch(", "axios", "requests.get", "api endpoint"], "label": "REST APIs", "type": "concept", "domain": "web"},
    "web-scraping":     {"keywords": ["scraper", "scraping", "beautifulsoup", "playwright", "selenium", "scrapy", "web scrape"], "label": "Web Scraping", "type": "skill", "domain": "web"},
    "ui-ux-design":     {"keywords": ["ui design", "ux design", "ui/ux", "color palette", "user interface", "wireframe", "figma"], "label": "UI/UX Design", "type": "skill", "domain": "web"},
    "css-animations":   {"keywords": ["animation", "transition", "keyframe", "flip clock", "css animation", "@keyframes"], "label": "CSS Animations", "type": "skill", "domain": "web"},
    "svg-fundamentals": {"keywords": ["svg", "<svg", "path d=", "viewbox", "stroke-width"], "label": "SVG Fundamentals", "type": "skill", "domain": "web"},

    # ── Systems ───────────────────────────────────────────────────────────────
    "git":              {"keywords": ["git commit", "git push", "git pull", "git branch", "git merge", "github"], "label": "Git", "type": "skill", "domain": "systems"},
    "github-api":       {"keywords": ["github api", "github.com/repos", "octokit", "github token", "personal access token"], "label": "GitHub API", "type": "tool", "domain": "systems"},
    "docker":           {"keywords": ["docker", "dockerfile", "docker-compose", "docker run", "containerize"], "label": "Docker", "type": "tool", "domain": "systems"},
    "linux-bash":       {"keywords": ["bash", "chmod", "grep ", "awk ", "cron", "systemctl", "sudo ", "shell script"], "label": "Linux / Bash", "type": "skill", "domain": "systems"},
    "cron-jobs":        {"keywords": ["cron", "cron job", "schedule", "scheduled task", "launchd", "brew services"], "label": "Cron Jobs", "type": "skill", "domain": "systems"},
    "sqlite":           {"keywords": ["sqlite", "sqlite3", ".db", "conn.execute"], "label": "SQLite", "type": "tool", "domain": "systems"},
    "n8n":              {"keywords": ["n8n", "n8n workflow", "n8n node"], "label": "n8n", "type": "tool", "domain": "systems"},
    "memory-system":    {"keywords": ["memory system", "knowledge map", "obsidian", "vault", "pkm", "second brain", "zettelkasten"], "label": "Memory Systems", "type": "concept", "domain": "systems"},
    "knowledge-graphs": {"keywords": ["knowledge graph", "graph database", "node", "edge", "force graph", "graph viz"], "label": "Knowledge Graphs", "type": "concept", "domain": "systems"},

    # ── Trading ───────────────────────────────────────────────────────────────
    "alpaca-api":       {"keywords": ["alpaca", "alpaca api", "alpaca_trade_api", "tradeapi"], "label": "Alpaca API", "type": "tool", "domain": "trading"},
    "backtesting":      {"keywords": ["backtest", "backtesting", "historical data", "sharpe ratio", "drawdown"], "label": "Backtesting", "type": "concept", "domain": "trading"},
    "ta-indicators":    {"keywords": ["macd", "moving average", "bollinger band", "technical indicator", "rsi indicator", "rsi score", "rsi value"], "label": "Technical Indicators", "type": "concept", "domain": "trading"},
    "paper-trading":    {"keywords": ["paper trading", "paper trade", "paper account", "simulated trading", "alpaca paper"], "label": "Paper Trading", "type": "concept", "domain": "trading"},
    "bracket-orders":   {"keywords": ["bracket order", "stop loss", "take profit", "gtc", "day order", "time in force"], "label": "Bracket Orders", "type": "concept", "domain": "trading"},

    # ── Strategy / Business ───────────────────────────────────────────────────
    "consulting":           {"keywords": ["consulting", "client deliverable", "pwc", "management consulting", "engagement", "deck"], "label": "Consulting", "type": "skill", "domain": "strategy"},
    "product-strategy":     {"keywords": ["product strategy", "go-to-market", "gtm", "product market fit", "pmf", "roadmap", "product thinking"], "label": "Product Strategy", "type": "concept", "domain": "strategy"},
    "competitive-intel":    {"keywords": ["competitive analysis", "competitor research", "market intelligence", "swot", "competitive intel"], "label": "Competitive Intelligence", "type": "concept", "domain": "strategy"},
    "business-strategy":    {"keywords": ["business strategy", "strategic management", "business model", "monetization", "revenue model", "unit economics"], "label": "Business Strategy", "type": "skill", "domain": "strategy"},
    "cold-email":           {"keywords": ["cold email", "outreach email", "email sequence", "email campaign", "lead outreach", "gmail api", "email pipeline"], "label": "Cold Email", "type": "skill", "domain": "strategy"},
    "lead-generation":      {"keywords": ["lead generation", "lead gen", "lead scraper", "google maps scraper", "apollo", "leads csv", "lead list"], "label": "Lead Generation", "type": "skill", "domain": "strategy"},
    "freelancing":          {"keywords": ["freelance", "freelancing", "client work", "first deal", "close a deal", "website flipping", "gumroad", "digital product"], "label": "Freelancing", "type": "skill", "domain": "strategy"},
    "ecommerce":            {"keywords": ["shopify", "amazon fba", "etsy", "dtc", "direct-to-consumer", "ecommerce", "product listing", "fulfillment"], "label": "E-Commerce", "type": "concept", "domain": "strategy"},
    "seo":                  {"keywords": ["seo", "search engine optimization", "keyword research", "serp", "content engine", "organic traffic"], "label": "SEO", "type": "concept", "domain": "strategy"},

    # ── Video ─────────────────────────────────────────────────────────────────
    "ffmpeg":           {"keywords": ["ffmpeg", "ffmpeg -i", "video codec", "video processing", "video pipeline"], "label": "FFmpeg", "type": "tool", "domain": "video"},
    "yt-dlp":           {"keywords": ["yt-dlp", "youtube-dl", "yt_dlp", "youtube download"], "label": "yt-dlp", "type": "tool", "domain": "video"},
    "whisper":          {"keywords": ["whisper", "openai whisper", "speech-to-text", "transcription", "audio transcript"], "label": "Whisper (STT)", "type": "tool", "domain": "video"},
}

# ── Score helpers ─────────────────────────────────────────────────────────────

def score_from_weighted_hits(hits: int) -> int:
    """Convert weighted hit count to skill score 1-10."""
    if hits >= 15: return 9
    if hits >= 10: return 8
    if hits >= 7:  return 7
    if hits >= 5:  return 6
    if hits >= 3:  return 5
    if hits >= 2:  return 4
    return 3

def proficiency_from_score(score: int) -> str:
    if score >= 8: return "fluent"
    if score >= 4: return "working"
    return "novice"

# ── Walk vault ────────────────────────────────────────────────────────────────

md_files = sorted(VAULT.rglob("*.md"))
print(f"Scanning {len(md_files)} markdown files in {VAULT}...\n")

# signal_hits[node_id] = cumulative weighted score
signal_hits   = defaultdict(int)
signal_files  = defaultdict(list)  # node_id → list of filenames that matched

for md_path in md_files:
    try:
        text = md_path.read_text(encoding="utf-8", errors="ignore").lower()
    except Exception:
        continue

    if not text.strip():
        continue

    weight = file_weight(md_path)

    for node_id, sig in SIGNALS.items():
        kw_hits = sum(1 for kw in sig["keywords"] if kw.lower() in text)
        if kw_hits >= 1:
            signal_hits[node_id]  += weight
            signal_files[node_id].append(md_path.name)

# ── Print results ─────────────────────────────────────────────────────────────

print(f"{'Node ID':<28} {'Score':>6}  {'Files'}")
print("-" * 80)
for node_id, hits in sorted(signal_hits.items(), key=lambda x: -x[1]):
    marker = "(exists)" if node_id in existing_ids else "★ NEW"
    files  = ", ".join(sorted(set(signal_files[node_id])))[:55]
    print(f"  {node_id:<26} {hits:>4}  {marker:<10}  {files}")

if args.dry_run:
    print("\n[dry-run] No diff written.")
    sys.exit(0)

# ── Build diff ────────────────────────────────────────────────────────────────

MIN_HITS = 2  # Minimum weighted score to include in diff

public_updates = []
new_node_ids   = []

for node_id, hits in signal_hits.items():
    if hits < MIN_HITS:
        continue

    sig   = SIGNALS[node_id]
    score = score_from_weighted_hits(hits)

    if node_id in existing_ids:
        public_updates.append({
            "id":            node_id,
            "score":         score,
            "session_count": hits,
            "last_updated":  TODAY,
            "history_entry": {"date": TODAY, "score": score},
        })
    else:
        new_node_ids.append(node_id)
        public_updates.append({
            "id":            node_id,
            "label":         sig["label"],
            "type":          sig["type"],
            "domain":        sig["domain"],
            "score":         score,
            "proficiency":   proficiency_from_score(score),
            "first_seen":    TODAY,
            "last_updated":  TODAY,
            "session_count": hits,
            "history":       [{"date": TODAY, "score": score}],
            "connections":   [f"domain-{sig['domain']}"],
        })

# ── Build private-only updates (personal / goals signals) ────────────────────
# The vault has private content (goals, beliefs, personal notes).
# These map to private-layer nodes that don't exist in the public map.

PRIVATE_SIGNALS = {
    "financial-independence": {
        "keywords": ["financial independence", "first dollar online", "claude max", "roth ira", "income from", "generate enough"],
        "label": "Financial Independence", "type": "goal", "domain": "personal-finance",
    },
    "fitness-training": {
        "keywords": ["bench 315", "squat 500", "200g protein", "deload", "body fat", "physique", "gym"],
        "label": "Fitness Training", "type": "practice", "domain": "health-fitness",
    },
    "entrepreneurship": {
        "keywords": ["start a company", "sandbox program", "first deal", "earn first dollar", "own terms", "build something real", "founder"],
        "label": "Entrepreneurship", "type": "concept", "domain": "strategy",
    },
    "pkm-obsidian": {
        "keywords": ["obsidian", "my-vault", "vault/", "second brain", "daily journal", "pkm"],
        "label": "PKM / Obsidian", "type": "skill", "domain": "systems",
    },
    "cold-outreach": {
        "keywords": ["cold email", "linkedin outreach", "apollo", "outreach pipeline", "dm a girl", "coffee chat", "cold dm"],
        "label": "Cold Outreach", "type": "skill", "domain": "strategy",
    },
    "goal-setting": {
        "keywords": ["year 24", "100 items", "2026 goals", "short term", "medium term", "long term", "goals"],
        "label": "Goal Setting", "type": "practice", "domain": "personal",
    },
}

private_existing_ids = {n["id"] for n in private_data["nodes"]}
private_only_updates = []
private_new_ids      = []

for node_id, sig in PRIVATE_SIGNALS.items():
    hits = 0
    for md_path in md_files:
        try:
            text = md_path.read_text(encoding="utf-8", errors="ignore").lower()
        except Exception:
            continue
        kw_hits = sum(1 for kw in sig["keywords"] if kw.lower() in text)
        if kw_hits >= 1:
            hits += file_weight(md_path)

    if hits < MIN_HITS:
        continue

    score = score_from_weighted_hits(hits)

    if node_id in private_existing_ids:
        private_only_updates.append({
            "id":            node_id,
            "score":         score,
            "session_count": hits,
            "last_updated":  TODAY,
            "history_entry": {"date": TODAY, "score": score},
        })
    else:
        private_new_ids.append(node_id)
        private_only_updates.append({
            "id":            node_id,
            "label":         sig["label"],
            "type":          sig["type"],
            "domain":        sig["domain"],
            "score":         score,
            "proficiency":   proficiency_from_score(score),
            "first_seen":    TODAY,
            "last_updated":  TODAY,
            "session_count": hits,
            "history":       [{"date": TODAY, "score": score}],
            "connections":   [f"domain-{sig['domain']}"],
        })

# ── Write diff ────────────────────────────────────────────────────────────────

new_connections = [
    {"from": nid, "to": f"domain-{SIGNALS[nid]['domain']}"}
    for nid in new_node_ids
] + [
    {"from": nid, "to": f"domain-{PRIVATE_SIGNALS[nid]['domain']}"}
    for nid in private_new_ids
]

new_public_count   = len([u for u in public_updates   if u.get("history")])
new_private_count  = len([u for u in private_only_updates if u.get("history")])

diff = {
    "public_updates":  public_updates,
    "private_updates": public_updates + private_only_updates,
    "new_connections": new_connections,
    "session_summary": (
        f"Vault ingestion: {len(md_files)} files scanned. "
        f"{new_public_count} new public nodes, "
        f"{len(public_updates) - new_public_count} updated. "
        f"{new_private_count} new private-only nodes."
    ),
}

out_path = Path(__file__).parent / "diff.json"
out_path.write_text(json.dumps(diff, indent=2))

print(f"\n{'='*60}")
print(f"✓ {len(public_updates)} public updates  ({new_public_count} new nodes)")
print(f"✓ {len(private_only_updates)} private-only updates  ({new_private_count} new nodes)")
print(f"✓ Written to scripts/diff.json")
print(f"\nReview the diff, then run:")
print(f"  python3 scripts/update-brain.py --apply scripts/diff.json")
print(f"{'='*60}")
