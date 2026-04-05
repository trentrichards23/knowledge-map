#!/usr/bin/env python3
"""
ingest-chat-history.py — Parse Claude chat export and extract knowledge map signals

Usage:
  python3 scripts/ingest-chat-history.py <path-to-conversations.json>

What it does:
  1. Reads all 206 conversations
  2. Extracts text from each message
  3. Scores which skills/tools/concepts appear based on keyword matching
  4. Cross-references against existing nodes (updates session_count/score)
  5. Proposes new nodes for signals not yet in the map
  6. Writes a diff.json you review and apply with update-brain.py --apply
"""

import json
import sys
import re
from pathlib import Path
from datetime import date
from collections import defaultdict

TODAY = date.today().isoformat()
EXPORT_PATH = sys.argv[1] if len(sys.argv) > 1 else None

if not EXPORT_PATH:
    print("Usage: python3 scripts/ingest-chat-history.py <conversations.json>")
    sys.exit(1)

# ── Load current maps ─────────────────────────────────────────────────────────

public_file  = Path(__file__).parent.parent / "web" / "public" / "data" / "knowledge-map-memory.json"
private_file = Path(__file__).parent.parent / "web-private" / "public" / "data" / "brain-memory.json"

public_data  = json.loads(public_file.read_text())
private_data = json.loads(private_file.read_text())

existing_ids = {n["id"] for n in public_data["nodes"]}

# ── Signal definitions ────────────────────────────────────────────────────────
# Format: "node-id": { "keywords": [...], "label": "...", "type": "...", "domain": "..." }
# Keywords are matched case-insensitively against the full conversation text.

SIGNALS = {
    # ── AI / ML ───────────────────────────────────────────────────────────────
    "python":         {"keywords": ["python", ".py", "import ", "def ", "pip install"], "label": "Python", "type": "skill", "domain": "ai-ml"},
    "langchain":      {"keywords": ["langchain", "langchain."], "label": "LangChain", "type": "tool", "domain": "ai-ml"},
    "llamaindex":     {"keywords": ["llamaindex", "llama_index", "llama-index"], "label": "LlamaIndex", "type": "tool", "domain": "ai-ml"},
    "openai-api":     {"keywords": ["openai.chat", "openai.completions", "gpt-4", "gpt-3.5", "openai api"], "label": "OpenAI API", "type": "tool", "domain": "ai-ml"},
    "ollama":         {"keywords": ["ollama", "qwen2.5", "llama3", "mistral", "ollama run"], "label": "Ollama", "type": "tool", "domain": "ai-ml"},
    "groq-api":       {"keywords": ["groq", "groq api", "groq.com"], "label": "Groq API", "type": "tool", "domain": "ai-ml"},
    "rag":            {"keywords": ["retrieval-augmented", "rag pipeline", "vector store", "embeddings", "semantic search", "faiss", "chromadb", "pinecone"], "label": "RAG Pipelines", "type": "concept", "domain": "ai-ml"},
    "prompt-eng":     {"keywords": ["prompt engineering", "system prompt", "few-shot", "chain of thought", "cot prompting"], "label": "Prompt Engineering", "type": "skill", "domain": "ai-ml"},
    "ai-agents":      {"keywords": ["ai agent", "multi-agent", "autonomous agent", "tool use", "function calling", "react agent"], "label": "AI Agents", "type": "concept", "domain": "ai-ml"},
    "fine-tuning":    {"keywords": ["fine-tun", "lora", "qlora", "finetuning", "instruction tuning"], "label": "Fine-Tuning", "type": "concept", "domain": "ai-ml"},
    "huggingface":    {"keywords": ["huggingface", "transformers library", "from_pretrained", "hf.co"], "label": "HuggingFace", "type": "tool", "domain": "ai-ml"},

    # ── Web Dev ───────────────────────────────────────────────────────────────
    "nextjs":         {"keywords": ["next.js", "nextjs", "app router", "server component", "use client"], "label": "Next.js", "type": "skill", "domain": "web"},
    "react":          {"keywords": ["react", "usestate", "useeffect", "usememo", "jsx", "tsx"], "label": "React", "type": "skill", "domain": "web"},
    "typescript":     {"keywords": ["typescript", ".tsx", ".ts\"", "interface ", "type ", ": string", ": number", ": boolean"], "label": "TypeScript", "type": "skill", "domain": "web"},
    "tailwind":       {"keywords": ["tailwind", "className=\"", "tw-", "flex items-", "bg-white", "text-sm"], "label": "Tailwind CSS", "type": "tool", "domain": "web"},
    "vercel":         {"keywords": ["vercel", "vercel.com", "vercel deploy", "vercel.json"], "label": "Vercel", "type": "tool", "domain": "web"},
    "cloudflare":     {"keywords": ["cloudflare", "cloudflare dns", "cf dns", "cloudflare pages"], "label": "Cloudflare", "type": "tool", "domain": "web"},
    "d3js":           {"keywords": ["d3.js", "d3.select", "d3.force", "d3.zoom", "import * as d3"], "label": "D3.js", "type": "skill", "domain": "web"},
    "fastapi":        {"keywords": ["fastapi", "from fastapi", "@app.get", "@app.post", "uvicorn"], "label": "FastAPI", "type": "tool", "domain": "web"},
    "flask":          {"keywords": ["from flask", "flask app", "@app.route", "flask."], "label": "Flask", "type": "tool", "domain": "web"},
    "html-css":       {"keywords": ["html", "css", "stylesheet", "border-radius", "display: flex", "grid-template"], "label": "HTML / CSS", "type": "skill", "domain": "web"},
    "rest-apis":      {"keywords": ["rest api", "http request", "fetch(", "axios", "requests.get", "requests.post", "api endpoint"], "label": "REST APIs", "type": "concept", "domain": "web"},
    "websockets":     {"keywords": ["websocket", "ws://", "socket.io", "real-time stream"], "label": "WebSockets", "type": "concept", "domain": "web"},

    # ── Systems ───────────────────────────────────────────────────────────────
    "git":            {"keywords": ["git commit", "git push", "git pull", "git branch", "git merge", "git rebase"], "label": "Git", "type": "skill", "domain": "systems"},
    "github-api":     {"keywords": ["github api", "github.com/repos", "octokit", "github token", "personal access token"], "label": "GitHub API", "type": "tool", "domain": "systems"},
    "docker":         {"keywords": ["docker", "dockerfile", "docker-compose", "docker run", "containerize"], "label": "Docker", "type": "tool", "domain": "systems"},
    "linux-bash":     {"keywords": ["bash", "chmod", "grep ", "awk ", "cron", "systemctl", "sudo ", "shell script"], "label": "Linux / Bash", "type": "skill", "domain": "systems"},
    "postgresql":     {"keywords": ["postgresql", "postgres", "psql", "pg_", "sql select", "sql insert", "create table"], "label": "PostgreSQL", "type": "tool", "domain": "systems"},
    "sqlite":         {"keywords": ["sqlite", "sqlite3", ".db\"", "conn.execute"], "label": "SQLite", "type": "tool", "domain": "systems"},
    "redis":          {"keywords": ["redis", "redis.set", "redis.get", "redispy"], "label": "Redis", "type": "tool", "domain": "systems"},
    "aws":            {"keywords": ["aws ", "s3 bucket", "ec2", "lambda function", "boto3", "aws cli"], "label": "AWS", "type": "tool", "domain": "systems"},
    "n8n":            {"keywords": ["n8n", "n8n workflow", "n8n node"], "label": "n8n", "type": "tool", "domain": "systems"},

    # ── Trading ───────────────────────────────────────────────────────────────
    "alpaca-api":     {"keywords": ["alpaca", "alpaca api", "alpaca_trade_api", "tradeapi"], "label": "Alpaca API", "type": "tool", "domain": "trading"},
    "pandas":         {"keywords": ["pandas", "pd.dataframe", "df.head", "df.merge", "read_csv", "to_csv"], "label": "Pandas", "type": "tool", "domain": "ai-ml"},
    "numpy":          {"keywords": ["numpy", "np.array", "np.mean", "import numpy"], "label": "NumPy", "type": "tool", "domain": "ai-ml"},
    "backtesting":    {"keywords": ["backtest", "backtesting", "historical data", "sharpe ratio", "drawdown"], "label": "Backtesting", "type": "concept", "domain": "trading"},
    "ta-indicators":  {"keywords": ["macd", "moving average", "bollinger band", "technical indicator", "rsi indicator", "rsi score", "rsi value", "simple moving average", "exponential moving average"], "label": "Technical Indicators", "type": "concept", "domain": "trading"},

    # ── Strategy ──────────────────────────────────────────────────────────────
    "product-strategy": {"keywords": ["product strategy", "go-to-market", "gtm", "product market fit", "pmf", "roadmap"], "label": "Product Strategy", "type": "concept", "domain": "strategy"},
    "competitive-intel": {"keywords": ["competitive analysis", "competitor research", "market intelligence", "swot"], "label": "Competitive Intelligence", "type": "concept", "domain": "strategy"},
    "consulting":     {"keywords": ["consulting", "client deliverable", "pwc", "management consulting", "mckinsey", "bain", "deloitte", "engagement manager"], "label": "Consulting", "type": "skill", "domain": "strategy"},

    # ── Video ─────────────────────────────────────────────────────────────────
    "ffmpeg":         {"keywords": ["ffmpeg", "ffmpeg -i", "video codec", "video processing"], "label": "FFmpeg", "type": "tool", "domain": "video"},
    "yt-dlp":         {"keywords": ["yt-dlp", "youtube-dl", "yt_dlp"], "label": "yt-dlp", "type": "tool", "domain": "video"},
    "whisper":        {"keywords": ["whisper", "openai whisper", "speech-to-text", "transcription"], "label": "Whisper (STT)", "type": "tool", "domain": "video"},
}

# ── Parse conversations ───────────────────────────────────────────────────────

print("Loading conversations...")
conversations = json.loads(Path(EXPORT_PATH).read_text())
print(f"  {len(conversations)} conversations found")

# Build full text corpus per conversation, with date
def extract_text(convo):
    texts = []
    for msg in convo.get("chat_messages", []):
        # Try text field first
        t = msg.get("text", "")
        if t:
            texts.append(t)
            continue
        # Fall back to content blocks
        for block in msg.get("content", []):
            if isinstance(block, dict) and block.get("type") == "text":
                texts.append(block.get("text", ""))
    return " ".join(texts).lower()

# Count signal hits across all conversations
signal_hits = defaultdict(int)  # node_id → number of convos where it appeared
signal_dates = {}               # node_id → earliest convo date

for convo in conversations:
    created = convo.get("created_at", "")[:10]  # YYYY-MM-DD
    text = extract_text(convo)
    if not text.strip():
        continue

    for node_id, sig in SIGNALS.items():
        hits = sum(1 for kw in sig["keywords"] if kw.lower() in text)
        if hits >= 1:
            signal_hits[node_id] += 1
            if node_id not in signal_dates or created < signal_dates[node_id]:
                signal_dates[node_id] = created

print(f"\nSignals detected (sorted by frequency):")
for node_id, count in sorted(signal_hits.items(), key=lambda x: -x[1]):
    marker = "  (exists)" if node_id in existing_ids else "  ★ NEW"
    print(f"  {node_id:<25} {count:>3} convos{marker}")

# ── Build diff ────────────────────────────────────────────────────────────────

def score_from_hits(hits: int) -> int:
    """Convert conversation hit count to a skill score 1-10."""
    if hits >= 30: return 9
    if hits >= 20: return 8
    if hits >= 12: return 7
    if hits >= 7:  return 6
    if hits >= 4:  return 5
    if hits >= 2:  return 4
    return 3

def proficiency_from_score(score: int) -> str:
    if score >= 8: return "fluent"
    if score >= 4: return "working"
    return "novice"

# Only include signals with 2+ conversations (filter noise)
MIN_CONVOS = 2

public_updates = []
new_node_ids = []

for node_id, hits in signal_hits.items():
    if hits < MIN_CONVOS:
        continue

    sig = SIGNALS[node_id]
    score = score_from_hits(hits)
    first_date = signal_dates.get(node_id, "2026-01-01")

    if node_id in existing_ids:
        # Update existing node
        public_updates.append({
            "id": node_id,
            "score": score,
            "session_count": hits,
            "last_updated": TODAY,
            "history_entry": {"date": TODAY, "score": score}
        })
    else:
        # New node
        new_node_ids.append(node_id)
        public_updates.append({
            "id": node_id,
            "label": sig["label"],
            "type": sig["type"],
            "domain": sig["domain"],
            "score": score,
            "proficiency": proficiency_from_score(score),
            "first_seen": first_date,
            "last_updated": TODAY,
            "session_count": hits,
            "history": [{"date": TODAY, "score": score}],
            "connections": [f"domain-{sig['domain']}"]
        })

# ── Write diff ────────────────────────────────────────────────────────────────

diff = {
    "public_updates": public_updates,
    "private_updates": public_updates,  # mirror to brain map
    "new_connections": [
        {"from": nid, "to": f"domain-{SIGNALS[nid]['domain']}"}
        for nid in new_node_ids
    ],
    "session_summary": f"Ingested {len(conversations)} Claude conversations. {len([u for u in public_updates if u.get('history')])} new nodes, {len([u for u in public_updates if not u.get('history')])} updated."
}

out_path = Path(__file__).parent / "diff.json"
out_path.write_text(json.dumps(diff, indent=2))

print(f"\n{'='*60}")
print(f"✓ {len(public_updates)} total updates ({len(new_node_ids)} new nodes)")
print(f"✓ Written to scripts/diff.json")
print(f"\nReview the diff, then run:")
print(f"  python3 scripts/update-brain.py --apply scripts/diff.json")
print(f"{'='*60}")
