'use client'

import { useState, useMemo } from 'react'
import KnowledgeGraph from './KnowledgeGraph'
import TimelineScrubber from './TimelineScrubber'
import LegendFilter from './LegendFilter'
import NodeDetailPanel from './NodeDetailPanel'
import type { KnowledgeNode } from '@/lib/types'

// Curated palette for auto-assigning colors to domains not in domainColors.
// Hash-based: same domain always gets the same color regardless of other domains.
const PALETTE = [
  '#43aa8b', '#f9c74f', '#277da1', '#f8961e', '#f94144', '#577590',
  '#c77dff', '#4cc9f0', '#f72585', '#7b9e87', '#e9c46a', '#264653',
  '#06d6a0', '#118ab2', '#ef476f', '#8338ec', '#f4a261', '#2ec4b6',
  '#a8dadc', '#457b9d',
]
function paletteColor(domain: string): string {
  const hash = domain.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return PALETTE[hash % PALETTE.length]
}

interface Props {
  nodes: KnowledgeNode[]
  lastUpdated: string
  domainColors: Record<string, string>
}

export default function KnowledgeMapViewer({ nodes, lastUpdated, domainColors }: Props) {
  const minDate = useMemo(() =>
    nodes.reduce((min, n) => n.first_seen < min ? n.first_seen : min, nodes[0].first_seen)
  , [nodes])

  const dateTicks = useMemo(() =>
    [...new Set(nodes.map(n => n.first_seen))].sort()
  , [nodes])

  const [currentDate,  setCurrentDate]  = useState(lastUpdated)
  const [activeFilter, setActiveFilter] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<KnowledgeNode | null>(null)

  const activeCount = useMemo(() =>
    nodes.filter(n =>
      n.first_seen <= currentDate &&
      (!activeFilter || n.domain === activeFilter)
    ).length
  , [nodes, currentDate, activeFilter])

  const nodeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const n of nodes) counts[n.domain] = (counts[n.domain] ?? 0) + 1
    return counts
  }, [nodes])

  // Domain entries for the legend — derived from domain-type nodes in the graph.
  // Falls back to palette color for any domain not defined in domainColors.
  const domainEntries = useMemo(() =>
    nodes
      .filter(n => n.type === 'domain')
      .map(n => ({
        id:    n.domain,
        label: n.label,
        color: domainColors[n.domain] ?? paletteColor(n.domain),
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  , [nodes, domainColors])

  // Full resolved color map (JSON colors + palette fallbacks for any domain)
  const resolvedColors = useMemo(() => {
    const all: Record<string, string> = {}
    for (const n of nodes) {
      if (!all[n.domain]) all[n.domain] = domainColors[n.domain] ?? paletteColor(n.domain)
    }
    return all
  }, [nodes, domainColors])

  return (
    <>
      <KnowledgeGraph
        nodes={nodes}
        currentDate={currentDate}
        activeFilter={activeFilter}
        selectedNodeId={selectedNode?.id ?? null}
        domainColors={resolvedColors}
        onNodeClick={setSelectedNode}
        onBackgroundClick={() => setSelectedNode(null)}
      />
      <LegendFilter
        activeFilter={activeFilter}
        domains={domainEntries}
        nodeCounts={nodeCounts}
        onFilter={setActiveFilter}
      />
      <NodeDetailPanel
        node={selectedNode}
        allNodes={nodes}
        domainColors={resolvedColors}
        onClose={() => setSelectedNode(null)}
      />
      <TimelineScrubber
        minDate={minDate}
        maxDate={lastUpdated}
        currentDate={currentDate}
        activeCount={activeCount}
        totalCount={nodes.length}
        dateTicks={dateTicks}
        onChange={setCurrentDate}
      />
    </>
  )
}
