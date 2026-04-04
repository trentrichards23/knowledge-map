import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })

export const metadata: Metadata = {
  title: 'Brain — Trenton Richards',
  description: 'Private knowledge map',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={geist.variable}>
      <body className="h-screen w-screen overflow-hidden bg-[#080808]">
        {children}
      </body>
    </html>
  )
}
