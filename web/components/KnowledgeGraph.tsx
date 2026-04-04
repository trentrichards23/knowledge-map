'use client'

import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import type { KnowledgeNode, SimNode, SimLink } from '@/lib/types'

// ── BFS from domain nodes → distance map ─────────────────────────────────────
// Used to soften node colors the further they are from their domain hub.
function computeDistances(nodes: KnowledgeNode[]): Map<string, number> {
  const adj = new Map<string, Set<string>>()
  for (const n of nodes) adj.set(n.id, new Set())
  for (const n of nodes) {
    for (const c of n.connections) {
      adj.get(n.id)?.add(c)
      adj.get(c)?.add(n.id) // undirected
    }
  }
  const dist = new Map<string, number>()
  const queue: string[] = []
  for (const n of nodes) {
    if (n.type === 'domain') { dist.set(n.id, 0); queue.push(n.id) }
  }
  while (queue.length > 0) {
    const cur = queue.shift()!
    const d = dist.get(cur)!
    for (const nb of (adj.get(cur) ?? [])) {
      if (!dist.has(nb)) { dist.set(nb, d + 1); queue.push(nb) }
    }
  }
  return dist
}

// ── Color with distance-based saturation fade ─────────────────────────────────
// Each hop from a domain node reduces saturation by ~28%, flooring at 25%.
function nodeColor(node: KnowledgeNode, distances: Map<string, number>, domainColors: Record<string, string>): string {
  const base = domainColors[node.domain] ?? '#888'
  const dist = distances.get(node.id) ?? 3
  if (dist === 0) return base
  const c = d3.hsl(base)
  c.s = Math.max(0.25, c.s * Math.pow(0.72, dist))
  return c.formatHex()
}

// ── Node radius scales with score (1–10 → ~7–22px) ───────────────────────────
const nodeRadius = (node: KnowledgeNode) => {
  const base = node.score * 1.5 + 5
  return node.type === 'domain' ? base * 1.3 : base
}

// ── Glow intensity by proficiency ─────────────────────────────────────────────
const glowId = (proficiency: string) => {
  if (proficiency === 'fluent')  return 'glow-high'
  if (proficiency === 'working') return 'glow-mid'
  return 'glow-none'
}

// ── Build D3 links from connections arrays (deduplicate bidirectional pairs) ──
function buildLinks(nodes: KnowledgeNode[]): SimLink[] {
  const nodeIds = new Set(nodes.map(n => n.id))
  const seen = new Set<string>()
  const links: SimLink[] = []

  for (const node of nodes) {
    for (const targetId of node.connections) {
      if (!nodeIds.has(targetId)) continue // skip broken references
      const key = [node.id, targetId].sort().join('--')
      if (seen.has(key)) continue
      seen.add(key)
      links.push({ source: node.id, target: targetId })
    }
  }
  return links
}

// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  nodes: KnowledgeNode[]
  currentDate: string
  activeFilter: string | null
  selectedNodeId: string | null
  domainColors: Record<string, string>
  onNodeClick: (node: KnowledgeNode) => void
  onBackgroundClick: () => void
}

export default function KnowledgeGraph({ nodes, currentDate, activeFilter, selectedNodeId, domainColors, onNodeClick, onBackgroundClick }: Props) {
  const svgRef    = useRef<SVGSVGElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  // Store D3 selections in refs so the timeline effect can reach them
  // without re-running the full simulation
  const nodeSelRef  = useRef<d3.Selection<SVGCircleElement, SimNode, SVGGElement, unknown> | null>(null)
  const linkSelRef  = useRef<d3.Selection<SVGLineElement, SimLink, SVGGElement, unknown> | null>(null)
  const labelSelRef = useRef<d3.Selection<SVGTextElement, SimNode, SVGGElement, unknown> | null>(null)

  useEffect(() => {
    if (!svgRef.current) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove() // clean up on re-render

    const width  = svgRef.current.clientWidth
    const height = svgRef.current.clientHeight

    // ── SVG defs: glow filters ──────────────────────────────────────────────
    // feGaussianBlur blurs the node color, feMerge stacks the blur under the
    // original shape. Higher stdDeviation = wider/softer glow.
    const defs = svg.append('defs')

    const addGlow = (id: string, std: number) => {
      const filter = defs.append('filter').attr('id', id).attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%')
      filter.append('feGaussianBlur').attr('in', 'SourceGraphic').attr('stdDeviation', std).attr('result', 'blur')
      const merge = filter.append('feMerge')
      merge.append('feMergeNode').attr('in', 'blur')
      merge.append('feMergeNode').attr('in', 'SourceGraphic')
    }

    addGlow('glow-high', 6)
    addGlow('glow-mid', 3)
    addGlow('glow-none', 0)

    // ── Zoom + pan ──────────────────────────────────────────────────────────
    // d3.zoom() intercepts wheel and drag events and applies a transform to a
    // <g> container. Everything inside that container zooms/pans together.
    const g = svg.append('g')

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on('zoom', (event) => g.attr('transform', event.transform))

    svg.call(zoom)

    // ── Build simulation data ────────────────────────────────────────────────
    // Deep-copy nodes so D3 can mutate them (adds x, y, vx, vy)
    const simNodes: SimNode[] = nodes.map(n => ({ ...n }))
    const links = buildLinks(nodes)
    const distances = computeDistances(nodes)

    // ── Force simulation ─────────────────────────────────────────────────────
    // Think of it as a physics world:
    //   forceLink     — springs between connected nodes (pull toward each other)
    //   forceManyBody — every node pushes away from every other node (repulsion)
    //   forceCenter   — a gentle pull toward the center of the canvas
    //   forceCollide  — prevents nodes from overlapping
    const simulation = d3.forceSimulation<SimNode>(simNodes)
      .force('link', d3.forceLink<SimNode, SimLink>(links)
        .id(d => d.id)
        .distance(d => {
          // Longer edges between domain nodes so they spread out
          const s = d.source as SimNode
          const t = d.target as SimNode
          if (s.type === 'domain' || t.type === 'domain') return 140
          return 80
        })
        .strength(0.4)
      )
      .force('charge', d3.forceManyBody().strength(d => {
        // Stronger repulsion for domain nodes so they claim more space
        return (d as SimNode).type === 'domain' ? -600 : -250
      }))
      .force('center', d3.forceCenter(width / 2, height / 2).strength(0.05))
      .force('collision', d3.forceCollide<SimNode>().radius(d => nodeRadius(d) + 8))

    // ── Render edges ─────────────────────────────────────────────────────────
    const link = linkSelRef.current = g.append('g')
      .selectAll<SVGLineElement, SimLink>('line')
      .data(links)
      .join<SVGLineElement>('line')
      .attr('stroke', '#ffffff')
      .attr('stroke-opacity', 0.06)
      .attr('stroke-width', 1)

    // ── Render nodes (circles) ───────────────────────────────────────────────
    const node = nodeSelRef.current = g.append('g')
      .selectAll<SVGCircleElement, SimNode>('circle')
      .data(simNodes)
      .join('circle')
      .attr('r', d => nodeRadius(d))
      .attr('fill', d => nodeColor(d, distances, domainColors))
      // fill opacity by type: domains are hollow rings, projects are semi-filled,
      // skills/tools/concepts are solid
      .attr('fill-opacity', d => {
        if (d.type === 'domain')   return 0.08
        if (d.type === 'project')  return 0.5
        return 0.75
      })
      .attr('stroke', d => nodeColor(d, distances, domainColors))
      // stroke weight + dash by type:
      //   domain  — thick dashed ring (clearly a category node)
      //   project — thick solid (you built this)
      //   skill   — normal solid
      //   tool    — thin with slight dash
      //   concept — thin solid
      .attr('stroke-width', d => {
        if (d.type === 'domain')  return 1.5
        if (d.type === 'project') return 2
        if (d.type === 'tool')    return 1
        return 1
      })
      .attr('stroke-dasharray', d => {
        if (d.type === 'domain') return '4 3'
        if (d.type === 'tool')   return '2 2'
        return 'none'
      })
      .attr('stroke-opacity', 0.8)
      .attr('filter', d => `url(#${glowId(d.proficiency)})`)
      .style('cursor', 'pointer')

    // ── Labels ───────────────────────────────────────────────────────────────
    // Always show labels for domain + project nodes; others show on hover (handled via opacity)
    const label = labelSelRef.current = g.append('g')
      .selectAll<SVGTextElement, SimNode>('text')
      .data(simNodes)
      .join('text')
      .text(d => d.label)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('dy', d => nodeRadius(d) + 12)
      .attr('fill', d => nodeColor(d, distances, domainColors))
      .attr('font-size', d => d.type === 'domain' ? '11px' : '9px')
      .attr('font-weight', d => d.type === 'domain' ? '600' : '400')
      .attr('opacity', d => (d.type === 'domain' || d.type === 'project') ? 0.9 : 0.4)
      .style('pointer-events', 'none')
      .style('user-select', 'none')

    // ── Drag behavior ────────────────────────────────────────────────────────
    // When you drag a node, we pin it (fx/fy) so the simulation stops moving it,
    // then release the pin when drag ends so it flows again.
    const drag = d3.drag<SVGCircleElement, SimNode>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart()
        d.fx = d.x
        d.fy = d.y
      })
      .on('drag', (event, d) => {
        d.fx = event.x
        d.fy = event.y
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0)
        d.fx = null
        d.fy = null
      })

    node.call(drag)

    // ── Tooltip + hover ───────────────────────────────────────────────────────
    const tooltip = d3.select(tooltipRef.current)

    node
      .on('mouseenter', (event, d) => {
        // Highlight this node and its direct neighbors, dim everything else
        const neighborIds = new Set(
          links
            .filter(l => {
              const s = (l.source as SimNode).id
              const t = (l.target as SimNode).id
              return s === d.id || t === d.id
            })
            .flatMap(l => [(l.source as SimNode).id, (l.target as SimNode).id])
        )

        node.attr('fill-opacity', n =>
          n.id === d.id || neighborIds.has(n.id) ? 0.9 : 0.1
        )
        link.attr('stroke-opacity', l => {
          const s = (l.source as SimNode).id
          const t = (l.target as SimNode).id
          return s === d.id || t === d.id ? 0.4 : 0.02
        })
        label.attr('opacity', n => {
          if (n.id === d.id) return 1
          if (neighborIds.has(n.id)) return 0.7
          return 0.05
        })

        const profColor = d.proficiency === 'fluent' ? '#a8d8a8' : d.proficiency === 'working' ? '#f0c98a' : '#aaa'

        tooltip
          .style('opacity', '1')
          .html(`
            <div class="tt-label">${d.label}</div>
            <div class="tt-type">${d.type}</div>
            <div class="tt-proficiency" style="color:${profColor}">${d.proficiency}</div>
            <div class="tt-score-row">
              <span class="tt-score-val">${d.score * 10}%</span>
            </div>
            <div class="tt-battery">
              ${Array.from({length: 33}, (_, i) =>
                `<div class="tt-seg${i < Math.round(d.score / 10 * 33) ? ' tt-seg-on' : ''}" style="${i < Math.round(d.score / 10 * 33) ? `background:${profColor}` : ''}"></div>`
              ).join('')}
            </div>
          `)
      })
      .on('mousemove', (event) => {
        tooltip
          .style('left', `${event.clientX + 14}px`)
          .style('top',  `${event.clientY - 10}px`)
      })
      .on('mouseleave', () => {
        node.attr('fill-opacity', d => d.type === 'domain' ? 0.15 : 0.8)
        link.attr('stroke-opacity', 0.06)
        label.attr('opacity', d => (d.type === 'domain' || d.type === 'project') ? 0.9 : 0.4)
        tooltip.style('opacity', '0')
      })
      .on('click', (event, d) => {
        event.stopPropagation() // prevent background click from immediately closing
        onNodeClick(d)
      })

    // ── Tick — runs every simulation frame, updates DOM positions ─────────────
    // D3 has updated d.x and d.y for each node; we apply them to the SVG elements.
    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as SimNode).x ?? 0)
        .attr('y1', d => (d.source as SimNode).y ?? 0)
        .attr('x2', d => (d.target as SimNode).x ?? 0)
        .attr('y2', d => (d.target as SimNode).y ?? 0)

      node
        .attr('cx', d => d.x ?? 0)
        .attr('cy', d => d.y ?? 0)

      label
        .attr('x', d => d.x ?? 0)
        .attr('y', d => d.y ?? 0)
    })

    // ── Label collision detection — runs once when simulation cools ────────────
    // Sort nodes by score descending so high-score nodes keep their labels.
    // For each label, check if its bounding box overlaps any already-placed label.
    // If it collides, hide it (opacity 0) — the tooltip will still show it on hover.
    simulation.on('end', () => {
      const placed: { x1: number; y1: number; x2: number; y2: number }[] = []
      const labelEls = label.nodes()

      // Process highest-score nodes first so they win collisions
      const sorted = [...simNodes].sort((a, b) => b.score - a.score)

      for (const d of sorted) {
        const el = labelEls.find(el => d3.select(el).datum() === d)
        if (!el) continue

        const bbox = (el as SVGTextElement).getBBox()
        if (!bbox.width) continue  // not rendered yet

        const pad = 2
        const box = {
          x1: bbox.x - pad,
          y1: bbox.y - pad,
          x2: bbox.x + bbox.width + pad,
          y2: bbox.y + bbox.height + pad,
        }

        const overlaps = placed.some(p =>
          box.x1 < p.x2 && box.x2 > p.x1 &&
          box.y1 < p.y2 && box.y2 > p.y1
        )

        if (overlaps) {
          // Only hide non-priority labels — always show domain + project
          if (d.type !== 'domain' && d.type !== 'project') {
            d3.select(el).attr('opacity', 0)
          }
        } else {
          placed.push(box)
        }
      }
    })

    // ── Resize handling ───────────────────────────────────────────────────────
    // ResizeObserver fires whenever the SVG's dimensions change (window resize,
    // panel open/close, etc). We update forceCenter to the new midpoint and
    // give the simulation a small alpha kick so nodes drift to the new center.
    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        simulation
          .force('center', d3.forceCenter(width / 2, height / 2).strength(0.05))
          .alpha(0.2)
          .restart()
      }
    })
    resizeObserver.observe(svgRef.current)

    // ── Cleanup ───────────────────────────────────────────────────────────────
    return () => {
      simulation.stop()
      resizeObserver.disconnect()
    }
  }, [nodes])

  // ── Combined visibility effect — reacts to timeline scrubber AND domain filter ──
  // Both filters gate node visibility. A node is visible only when:
  //   1. first_seen <= currentDate (timeline gate)
  //   2. domain matches activeFilter, or no filter is set (domain gate)
  // We never restart the simulation — just update opacities via D3 transitions.
  useEffect(() => {
    if (!nodeSelRef.current || !linkSelRef.current || !labelSelRef.current) return

    const activeIds = new Set(
      nodes
        .filter(n => n.first_seen <= currentDate)
        .filter(n => !activeFilter || n.domain === activeFilter)
        .map(n => n.id)
    )

    nodeSelRef.current
      .transition().duration(300)
      .attr('fill-opacity', (d: SimNode) => {
        if (!activeIds.has(d.id)) return 0.04
        return d.type === 'domain' ? 0.15 : 0.8
      })
      .attr('stroke-opacity', (d: SimNode) => activeIds.has(d.id) ? 0.7 : 0.06)
      .attr('filter', (d: SimNode) => activeIds.has(d.id) ? `url(#${glowId(d.proficiency)})` : 'none')

    linkSelRef.current
      .transition().duration(300)
      .attr('stroke-opacity', (d: SimLink) => {
        const s = (d.source as SimNode).id
        const t = (d.target as SimNode).id
        return activeIds.has(s) && activeIds.has(t) ? 0.06 : 0.01
      })

    labelSelRef.current
      .transition().duration(300)
      .attr('opacity', (d: SimNode) => {
        if (!activeIds.has(d.id)) return 0
        return d.type === 'domain' || d.type === 'project' ? 0.9 : 0.4
      })
  }, [currentDate, activeFilter, nodes])

  return (
    <>
      <svg ref={svgRef} className="graph-svg w-full h-full" onClick={onBackgroundClick} />
      <div
        ref={tooltipRef}
        className="graph-tooltip"
        style={{ opacity: 0, left: 0, top: 0 }}
      />
    </>
  )
}
