'use client'

import { useState, useMemo } from 'react'
import KnowledgeGraph from './KnowledgeGraph'
import TimelineScrubber from './TimelineScrubber'
import LegendFilter from './LegendFilter'
import NodeDetailPanel from './NodeDetailPanel'
import type { KnowledgeNode } from '@/lib/types'

interface Props {
  nodes: KnowledgeNode[]
  lastUpdated: string
}

export default function KnowledgeMapViewer({ nodes, lastUpdated }: Props) {
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

  return (
    <>
      <KnowledgeGraph
        nodes={nodes}
        currentDate={currentDate}
        activeFilter={activeFilter}
        selectedNodeId={selectedNode?.id ?? null}
        onNodeClick={setSelectedNode}
        onBackgroundClick={() => setSelectedNode(null)}
      />
      <LegendFilter
        activeFilter={activeFilter}
        nodeCounts={nodeCounts}
        onFilter={setActiveFilter}
      />
      <NodeDetailPanel
        node={selectedNode}
        allNodes={nodes}
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
