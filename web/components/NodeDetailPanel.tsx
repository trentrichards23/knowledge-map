'use client'

import type { KnowledgeNode } from '@/lib/types'

const DOMAIN_COLORS: Record<string, string> = {
  'ai-ml':     '#43aa8b',
  'trading':   '#f9c74f',
  'web':       '#277da1',
  'video':     '#f8961e',
  'strategy':  '#f94144',
  'systems':   '#577590',
}

const PROFICIENCY_COLORS: Record<string, string> = {
  fluent:  '#a8d8a8',
  working: '#f0c98a',
  novice:  '#aaaaaa',
}

const formatDate = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

// ── Sparkline — shows score history as a tiny SVG line chart ─────────────────
function Sparkline({ history }: { history: { date: string; score: number }[] }) {
  const W = 200
  const H = 40
  const pad = 4

  if (history.length === 0) return null

  if (history.length === 1) {
    return (
      <svg width={W} height={H}>
        <circle cx={W / 2} cy={H / 2} r={3} fill="#ffffff" fillOpacity={0.5} />
      </svg>
    )
  }

  const xs = history.map((_, i) => pad + (i / (history.length - 1)) * (W - pad * 2))
  const ys = history.map(h => H - pad - ((h.score / 10) * (H - pad * 2)))

  const linePath = xs.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x} ${ys[i]}`).join(' ')
  const areaPath = `${linePath} L ${xs[xs.length - 1]} ${H} L ${xs[0]} ${H} Z`

  return (
    <svg width={W} height={H}>
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#spark-fill)" />
      <path d={linePath} fill="none" stroke="#ffffff" strokeWidth="1.5" strokeOpacity="0.5" strokeLinecap="round" strokeLinejoin="round" />
      {xs.map((x, i) => (
        <circle key={i} cx={x} cy={ys[i]} r={2.5} fill="#ffffff" fillOpacity={0.7} />
      ))}
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  node: KnowledgeNode | null
  allNodes: KnowledgeNode[]
  onClose: () => void
}

export default function NodeDetailPanel({ node, allNodes, onClose }: Props) {
  const isOpen = node !== null

  // Look up labels for connected nodes
  const connectedNodes = node
    ? node.connections
        .map(id => allNodes.find(n => n.id === id))
        .filter(Boolean) as KnowledgeNode[]
    : []

  const domainColor = node ? (DOMAIN_COLORS[node.domain] ?? '#888') : '#888'
  const profColor   = node ? (PROFICIENCY_COLORS[node.proficiency] ?? '#aaa') : '#aaa'

  return (
    <div
      className="absolute top-0 right-0 h-full z-20 transition-transform duration-300 ease-out"
      style={{
        width: 260,
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        background: 'rgba(10,10,10,0.96)',
        borderLeft: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      {node && (
        <div className="flex flex-col h-full overflow-y-auto p-5 pb-24">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <div
                className="text-[9px] uppercase tracking-widest mb-1 font-medium"
                style={{ color: domainColor }}
              >
                {node.type}
              </div>
              <h2 className="text-base font-semibold text-white leading-tight">
                {node.label}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="text-white/30 hover:text-white/70 transition-colors text-lg leading-none mt-0.5 ml-3 flex-shrink-0"
            >
              ×
            </button>
          </div>

          {/* Proficiency + score */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span
                className="text-xs font-medium capitalize"
                style={{ color: profColor }}
              >
                {node.proficiency}
              </span>
              <span className="text-xs text-white/30">{node.score} / 10</span>
            </div>
            {/* Score bar */}
            <div className="h-1 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${node.score * 10}%`, background: domainColor }}
              />
            </div>
          </div>

          {/* Sparkline */}
          {node.history.length > 0 && (
            <div className="mb-4">
              <p className="text-[9px] uppercase tracking-widest text-white/20 mb-2">Score history</p>
              <Sparkline history={node.history} />
            </div>
          )}

          {/* Meta */}
          <div className="mb-4 flex flex-col gap-1">
            <div className="flex justify-between text-xs">
              <span className="text-white/30">Sessions</span>
              <span className="text-white/60">{node.session_count}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-white/30">First seen</span>
              <span className="text-white/60">{formatDate(node.first_seen)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-white/30">Updated</span>
              <span className="text-white/60">{formatDate(node.last_updated)}</span>
            </div>
          </div>

          {/* Connected nodes */}
          {connectedNodes.length > 0 && (
            <div>
              <p className="text-[9px] uppercase tracking-widest text-white/20 mb-2">
                Connected to ({connectedNodes.length})
              </p>
              <div className="flex flex-col gap-1">
                {connectedNodes.map(cn => (
                  <div key={cn.id} className="flex items-center gap-2 text-xs">
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: DOMAIN_COLORS[cn.domain] ?? '#888' }}
                    />
                    <span className="text-white/50 truncate">{cn.label}</span>
                    <span className="text-white/20 text-[10px] ml-auto">{cn.type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
