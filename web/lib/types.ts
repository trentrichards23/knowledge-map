export interface HistoryEntry {
  date: string
  score: number
}

export type NodeType = 'domain' | 'skill' | 'tool' | 'concept' | 'project'
export type Proficiency = 'novice' | 'working' | 'fluent'

export interface KnowledgeNode {
  id: string
  label: string
  type: NodeType
  domain: string
  score: number
  proficiency: Proficiency
  first_seen: string
  last_updated: string
  session_count: number
  history: HistoryEntry[]
  connections: string[]
}

export interface GraphMeta {
  owner: string
  last_updated: string
  total_sessions: number
  schema_version: string
}

export interface KnowledgeMapData {
  meta: GraphMeta
  nodes: KnowledgeNode[]
}

// D3 extends nodes with x, y, vx, vy during simulation
export interface SimNode extends KnowledgeNode {
  x?: number
  y?: number
  vx?: number
  vy?: number
  fx?: number | null
  fy?: number | null
}

export interface SimLink {
  source: SimNode | string
  target: SimNode | string
}
