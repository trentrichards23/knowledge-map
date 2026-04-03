import fs from 'fs'
import path from 'path'
import type { KnowledgeMapData } from '@/lib/types'
import KnowledgeMapViewer from '@/components/KnowledgeMapViewer'

export default function Page() {
  const filePath = path.join(process.cwd(), 'public', 'data', 'knowledge-map-private.json')
  const raw = fs.readFileSync(filePath, 'utf-8')
  const data: KnowledgeMapData = JSON.parse(raw)

  return (
    <main className="w-full h-full relative">
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-6 py-4 pointer-events-none">
        <div>
          <h1 className="text-sm font-semibold text-white/80 tracking-wide">
            Brain
          </h1>
          <p className="text-xs text-white/30 mt-0.5">
            last updated {data.meta.last_updated}
          </p>
        </div>
        <a
          href="https://trentbrichards.com"
          className="pointer-events-auto text-xs text-white/30 hover:text-white/60 transition-colors"
        >
          ← trentbrichards.com
        </a>
      </div>

      <KnowledgeMapViewer nodes={data.nodes} lastUpdated={data.meta.last_updated} />
    </main>
  )
}
