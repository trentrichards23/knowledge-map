'use client'

import { useState, useEffect, useRef } from 'react'

// ── Flip clock date display ───────────────────────────────────────────────────
// Two-phase animation: card rotates away (flip-out), new value appears (flip-in)
// A seam line through the middle gives the split-flap aesthetic.
function FlipDate({ value }: { value: string }) {
  const [face, setFace]   = useState(value)
  const [phase, setPhase] = useState<'out' | 'in' | null>(null)
  const nextRef = useRef(value)

  useEffect(() => {
    nextRef.current = value
    setPhase('out')
    const t1 = setTimeout(() => {
      setFace(nextRef.current)
      setPhase('in')
    }, 100)
    const t2 = setTimeout(() => setPhase(null), 200)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [value])

  return (
    <div className="flip-wrap">
      <div className={`flip-card${phase ? ` flip-${phase}` : ''}`}>
        {face}
        <div className="flip-seam" />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  minDate: string
  maxDate: string
  currentDate: string
  activeCount: number
  totalCount: number
  onChange: (date: string) => void
  dateTicks: string[]
}

const dateToTs   = (d: string) => new Date(d).getTime()
const tsToDate   = (ts: number) => new Date(ts).toISOString().split('T')[0]
const formatDate = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export default function TimelineScrubber({
  minDate, maxDate, currentDate, activeCount, totalCount, onChange, dateTicks,
}: Props) {
  const minTs = dateToTs(minDate)
  const maxTs = dateToTs(maxDate)
  const curTs = dateToTs(currentDate)

  const tickTopPct = (d: string) =>
    ((maxTs - dateToTs(d)) / (maxTs - minTs)) * 100

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Flip clock date display */}
      <FlipDate value={formatDate(currentDate)} />

      {/* Track + thumb */}
      <div className="relative flex items-center justify-center" style={{ height: 180, width: 24 }}>
        <input
          type="range"
          min={minTs}
          max={maxTs}
          step={86400000}
          value={maxTs - curTs + minTs}
          onChange={e => {
            const inverted = maxTs - Number(e.target.value) + minTs
            onChange(tsToDate(inverted))
          }}
          className="timeline-slider-v"
        />
      </div>

      {/* Node count */}
      <span className="text-[10px] text-white/25 tabular-nums">
        {activeCount}/{totalCount}
      </span>
    </div>
  )
}
