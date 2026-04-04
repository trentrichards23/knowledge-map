'use client'

interface Domain {
  id: string
  label: string
  color: string
}

interface Props {
  activeFilter: string | null
  domains: Domain[]
  nodeCounts: Record<string, number>
  onFilter: (domain: string | null) => void
}

export default function LegendFilter({ activeFilter, domains, nodeCounts, onFilter }: Props) {
  return (
    <div className="flex flex-col gap-1">
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

        {domains.map(d => {
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
