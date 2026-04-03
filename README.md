# Knowledge Map — Trenton Richards

A live, self-updating visualization of my knowledge state across every topic, skill, and concept I've worked through with Claude. Hosted at `knowledge-map.trentbrichards.com`.

---

## What This Is

Every Claude Code session ends with an update to this system. Claude parses what was covered, what was new vs. reinforced, and writes to two files:

- `data/knowledge-map-public.json` — sanitized skill/tool/concept graph (public, powers the website)
- `~/Documents/my-vault/Notes/knowledge-map-private.md` — full context including philosophies, gaps, session trails (private, never leaves the vault)

The website renders the public graph as an interactive D3.js force-directed visualization with a timeline scrubber — drag it and watch the knowledge graph grow from day one.

---

## Architecture

```
Session End (every Claude session)
  │
  ├─→ knowledge-map-private.md (vault — full brain, private)
  │     - philosophies, goals, mental models
  │     - knowledge gaps
  │     - session summaries with full context
  │     - company + career targeting logic
  │
  └─→ data/knowledge-map-public.json (this repo — sanitized, public)
        - skills, tools, concepts, projects
        - proficiency scores (1-10 internal)
        - first_seen + history for timeline
        - connections between nodes
              ↓
        Next.js app at knowledge-map.trentbrichards.com
        D3.js force-directed graph
        ├── node size + glow = proficiency score (1-10)
        ├── node label = Novice / Working / Fluent
        ├── color = domain (AI/ML, Trading, Web, etc.)
        ├── hover = proficiency label + session count
        ├── click = related nodes + connected projects
        └── timeline scrubber = drag to see graph at any past date
```

---

## Data Schema

### Node types
| Type | Examples |
|---|---|
| `skill` | Python, TypeScript, D3.js, SQL |
| `tool` | Ollama, Alpaca, Vercel, Claude Code |
| `concept` | RAG, multi-agent, bracket orders, OAuth |
| `domain` | AI/ML Engineering, Trading, Web Dev |
| `project` | AutoTrader, Clipper, Portfolio, Knowledge Map |

### Node schema
```json
{
  "id": "python",
  "label": "Python",
  "type": "skill",
  "domain": "engineering",
  "score": 8,
  "proficiency": "fluent",
  "first_seen": "2026-03-28",
  "last_updated": "2026-04-02",
  "session_count": 12,
  "history": [
    { "date": "2026-03-28", "score": 6 },
    { "date": "2026-04-02", "score": 8 }
  ],
  "connections": ["autotrader", "clipper", "job-search-pipeline", "ollama"]
}
```

### Proficiency scale
```
1-3   Novice   — aware of it, used it once or twice
4-6   Working  — can use it independently, needs docs occasionally
7-10  Fluent   — default choice, deep understanding, can debug
```

The score drives visual weight (node size, glow, edge thickness). The label shown publicly is always Novice/Working/Fluent. Score stays internal.

### Domain color map
| Domain | Color |
|---|---|
| AI/ML Engineering | `#d3968c` (salmon — matches portfolio accent) |
| Trading & Finance | `#839958` (olive) |
| Web Development | `#105666` (teal) |
| Video & Automation | `#7a6e9c` (purple) |
| Strategy & Business | `#c4a35a` (gold) |
| Systems & DevOps | `#6e8c7a` (muted green) |

---

## Visualization Features

### Force-directed graph
- Nodes repel each other naturally, edges pull connected nodes together
- Skills cluster around the domains + projects that use them
- Highly connected nodes (Python, Claude Code) gravitate toward center
- Orphan nodes (new skills with no connections yet) float at edges

### Timeline scrubber
- Horizontal slider at bottom: left = first session, right = today
- Drag left → nodes learned after that date fade out and disappear
- Drag right → nodes animate in as they were first introduced
- Shows the actual growth trajectory, not just current state

### Interaction
- Hover: show label, proficiency (Novice/Working/Fluent), session count
- Click: highlight connected nodes, dim everything else, show project links
- Double-click a project node: see all skills it required
- Filter buttons by domain (show only AI/ML, only Web Dev, etc.)

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Visualization | D3.js v7 | Force simulation, timeline scrubber, full control |
| Framework | Next.js (App Router) | Consistent with portfolio, easy Vercel deploy |
| Styling | Tailwind + portfolio design tokens | Matches trentbrichards.com aesthetic |
| Data | Static JSON (this repo) | No backend needed — Claude writes it at session end |
| Hosting | Vercel | Same account as portfolio |
| Domain | Cloudflare subdomain (`knowledge-map.trentbrichards.com`) | CNAME → Vercel |

---

## Session-End Protocol

At the end of every Claude Code session, Claude:

1. Reviews what was covered in the session
2. Identifies: new nodes to add, existing nodes to score up, new connections to draw
3. Writes to `data/knowledge-map-public.json`:
   - New nodes with `first_seen = today`, initial score
   - Updated `score`, `last_updated`, `session_count`, `history` entry for existing nodes
   - New `connections` between nodes that were used together
4. Writes a summary to `~/Documents/my-vault/Notes/knowledge-map-private.md`:
   - Full session context, concepts introduced, mental models built
   - Knowledge gaps surfaced (what wasn't known, what was explained)
   - Private notes (not in public JSON)

This means the public graph updates every session automatically, with no manual intervention.

---

## Deployment Plan

1. ✅ Seed initial `knowledge-map-public.json` with current knowledge state
2. Build Next.js app with D3.js graph (`web/`)
3. Deploy to Vercel as separate project
4. Add CNAME record in Cloudflare: `knowledge-map` → Vercel deployment URL
5. Add custom domain in Vercel project settings
6. Link from portfolio Projects section

---

## File Structure

```
~/projects/knowledge-map/
├── README.md                          ← this file
├── data/
│   └── knowledge-map-public.json      ← Claude updates this every session
├── web/                               ← Next.js app (to be built)
│   ├── src/
│   │   ├── app/
│   │   │   └── page.tsx
│   │   └── components/
│   │       ├── KnowledgeGraph.tsx
│   │       └── TimelineScrubber.tsx
│   └── package.json
└── scripts/
    └── seed.py                        ← one-time seed helper (optional)
```

---

## Privacy Model

**Public (website):** Skills, tools, concepts, projects, proficiency levels, growth timeline. What Trenton knows. Nothing personal.

**Private (vault only):** Session content, philosophy, goals, mental models, knowledge gaps, company targeting strategy, personal context. How Trenton thinks. Never leaves `~/Documents/my-vault/`.

---

## Status

| Item | Status |
|---|---|
| Project structure | ✅ Created |
| Initial data seed | ✅ Done (2026-04-02) |
| Next.js app | 🔴 Not started |
| D3.js graph component | 🔴 Not started |
| Timeline scrubber | 🔴 Not started |
| Vercel deployment | 🔴 Not started |
| Cloudflare subdomain | 🔴 Not started |
