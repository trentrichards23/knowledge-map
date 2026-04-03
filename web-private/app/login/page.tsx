'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError]       = useState(false)
  const [loading, setLoading]   = useState(false)
  const router = useRouter()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(false)

    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })

    if (res.ok) {
      router.push('/')
      router.refresh()
    } else {
      setError(true)
      setLoading(false)
    }
  }

  return (
    <div className="w-full h-full flex items-center justify-center">
      <form onSubmit={submit} className="flex flex-col gap-4 w-64">
        <p className="text-xs text-white/30 tracking-widest uppercase text-center mb-2">
          Brain — Private Access
        </p>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          className="bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:border-white/30 transition-colors"
        />
        {error && (
          <p className="text-xs text-red-400/70 text-center">Incorrect password</p>
        )}
        <button
          type="submit"
          disabled={loading || !password}
          className="bg-white/8 hover:bg-white/12 disabled:opacity-30 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white/70 transition-all"
        >
          {loading ? 'Checking...' : 'Enter'}
        </button>
      </form>
    </div>
  )
}
