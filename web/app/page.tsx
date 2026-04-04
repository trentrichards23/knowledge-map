import fs from 'fs'
import path from 'path'
import type { KnowledgeMapData } from '@/lib/types'
import KnowledgeMapViewer from '@/components/KnowledgeMapViewer'

export default function Page() {
  // Server Component — reads the JSON at request time (or build time with static export)
  // Lives in public/data/ so it's included in the Vercel build
  const filePath = path.join(process.cwd(), 'public', 'data', 'knowledge-map-memory.json')
  const raw = fs.readFileSync(filePath, 'utf-8')
  const data: KnowledgeMapData = JSON.parse(raw)

  return (
    <main className="w-full h-full relative">
      {/* Title — centered */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-center px-6 py-4 pointer-events-none">
        <h1 className="text-sm font-semibold text-white/80 tracking-wide">
          Knowledge Map
        </h1>
      </div>
      {/* Back link — top right */}
      <div className="absolute top-4 right-6 z-10">
        <a
          href="https://trentbrichards.com"
          className="text-xs text-white/30 hover:text-white/60 transition-colors"
        >
          ← trentbrichards.com
        </a>
      </div>

      {/* Viewer manages timeline state — passes to graph + scrubber */}
      <KnowledgeMapViewer nodes={data.nodes} lastUpdated={data.meta.last_updated} domainColors={data.meta.domain_colors ?? {}} />
    </main>
  )
}
