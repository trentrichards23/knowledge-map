'use client'

const DOMAINS = [
  { id: 'ai-ml',     label: 'AI / ML',     color: '#43aa8b' },
  { id: 'trading',   label: 'Trading',     color: '#f9c74f' },
  { id: 'web',       label: 'Web Dev',     color: '#277da1' },
  { id: 'video',     label: 'Video',       color: '#f8961e' },
  { id: 'strategy',  label: 'Strategy',    color: '#f94144' },
  { id: 'systems',   label: 'Systems',     color: '#577590' },
  { id: 'personal',  label: 'Personal',    color: '#c77dff' },
  { id: 'finance',   label: 'Finance',     color: '#4cc9f0' },
  { id: 'interests', label: 'Interests',   color: '#f72585' },
  { id: 'network',   label: 'Network',     color: '#7b9e87' },
]

interface Props {
  activeFilter: string | null
  nodeCounts: Record<string, number>  // how many nodes per domain
  onFilter: (domain: string | null) => void
}

export default function LegendFilter({ activeFilter, nodeCounts, onFilter }: Props) {
  return (
    <div className="absolute left-5 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-1">
      {/* Domain filters */}
      <div className="flex flex-col gap-1">
        {/* "All" reset button */}
        <button
          onClick={() => onFilter(null)}
          className="flex items-center gap-2 px-2 py-1 rounded text-xs transition-all"
          style={{
            color: activeFilter === null ? '#fff' : 'rgba(255,255,255,0.3)',
            background: activeFilter === null ? 'rgba(255,255,255,0.08)' : 'transparent',
          }}
        >
          <span className="w-2 h-2 rounded-full bg-white/30" />
          All
        </button>

        {DOMAINS.map(d => {
          const isActive = activeFilter === d.id
          const count = nodeCounts[d.id] ?? 0
          return (
            <button
              key={d.id}
              onClick={() => onFilter(isActive ? null : d.id)}
              className="flex items-center gap-2 px-2 py-1 rounded text-xs transition-all"
              style={{
                color: isActive ? '#fff' : activeFilter ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.5)',
                background: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
              }}
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: d.color, opacity: isActive || !activeFilter ? 1 : 0.3 }}
              />
              {d.label}
              <span className="text-white/20 text-[10px] ml-auto pl-2">{count}</span>
            </button>
          )
        })}
      </div>

      {/* Divider */}
      <div className="h-px bg-white/10 my-2" />

      {/* Size legend */}
      <div className="flex flex-col gap-1.5 px-2">
        <p className="text-[9px] uppercase tracking-widest text-white/20 mb-1">Proficiency</p>
        {[
          { label: 'Fluent',  r: 9  },
          { label: 'Working', r: 6  },
          { label: 'Novice',  r: 4  },
        ].map(({ label, r }) => (
          <div key={label} className="flex items-center gap-2">
            <div className="w-5 flex items-center justify-center">
              <div
                className="rounded-full bg-white/40"
                style={{ width: r * 2, height: r * 2 }}
              />
            </div>
            <span className="text-[10px] text-white/30">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
