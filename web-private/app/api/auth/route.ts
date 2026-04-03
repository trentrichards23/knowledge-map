import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { password } = await req.json()
  const expected = process.env.BRAIN_PASSWORD
  const token    = process.env.BRAIN_TOKEN

  if (!expected || !token || password !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set('brain-auth', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    // No maxAge = session cookie (clears when browser closes)
  })
  return res
}
