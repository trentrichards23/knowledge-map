'use client'

import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { KnowledgeNode, SimNode, SimLink } from '@/lib/types'

// ── Color per domain ─────────────────────────────────────────────────────────
const DOMAIN_COLORS: Record<string, string> = {
  'ai-ml':     '#d3968c',
  'trading':   '#839958',
  'web':       '#4a9db5',
  'video':     '#7a6e9c',
  'strategy':  '#c4a35a',
  'systems':   '#6e8c7a',
}

const domainColor = (domain: string) => DOMAIN_COLORS[domain] ?? '#888'

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
}

export default function KnowledgeGraph({ nodes }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

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
    const link = g.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', '#ffffff')
      .attr('stroke-opacity', 0.06)
      .attr('stroke-width', 1)

    // ── Render nodes (circles) ───────────────────────────────────────────────
    const node = g.append('g')
      .selectAll<SVGCircleElement, SimNode>('circle')
      .data(simNodes)
      .join('circle')
      .attr('r', d => nodeRadius(d))
      .attr('fill', d => domainColor(d.domain))
      .attr('fill-opacity', d => d.type === 'domain' ? 0.15 : 0.8)
      .attr('stroke', d => domainColor(d.domain))
      .attr('stroke-width', d => d.type === 'domain' ? 1.5 : 1)
      .attr('stroke-opacity', 0.7)
      .attr('filter', d => `url(#${glowId(d.proficiency)})`)
      .style('cursor', 'pointer')

    // ── Labels ───────────────────────────────────────────────────────────────
    // Always show labels for domain + project nodes; others show on hover (handled via opacity)
    const label = g.append('g')
      .selectAll<SVGTextElement, SimNode>('text')
      .data(simNodes)
      .join('text')
      .text(d => d.label)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('dy', d => nodeRadius(d) + 12)
      .attr('fill', d => domainColor(d.domain))
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
            <div class="tt-sessions">${d.session_count} session${d.session_count !== 1 ? 's' : ''} · score ${d.score}/10</div>
          `)
      })
      .on('mousemove', (event) => {
        tooltip
          .style('left', `${event.clientX + 14}px`)
          .style('top',  `${event.clientY - 10}px`)
      })
      .on('mouseleave', () => {
        // Restore all opacities
        node.attr('fill-opacity', d => d.type === 'domain' ? 0.15 : 0.8)
        link.attr('stroke-opacity', 0.06)
        label.attr('opacity', d => (d.type === 'domain' || d.type === 'project') ? 0.9 : 0.4)
        tooltip.style('opacity', '0')
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
        .attr('y', d => (d.y ?? 0))
    })

    // ── Cleanup when component unmounts or nodes prop changes ─────────────────
    return () => {
      simulation.stop()
    }
  }, [nodes])

  return (
    <>
      <svg ref={svgRef} className="graph-svg w-full h-full" />
      <div
        ref={tooltipRef}
        className="graph-tooltip"
        style={{ opacity: 0, left: 0, top: 0 }}
      />
    </>
  )
}
