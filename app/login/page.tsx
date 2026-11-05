'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function sendCode(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true },
    })
    setBusy(false)
    if (error) setMsg(error.message)
    else setStep('code')
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.trim(),
      type: 'email',
    })
    setBusy(false)
    if (error) {
      setMsg('That code is not correct or has expired. Check the email and try again.')
      return
    }
    router.replace('/dashboard')
    router.refresh()
  }

  return (
    <main className="auth-wrap">
      <section className="auth-card">
        <h1>Preksha Foundation</h1>
        <p className="muted">Trainer portal. Sign in or register with your email.</p>

        {step === 'email' ? (
          <form onSubmit={sendCode}>
            <label htmlFor="email">Email address</label>
            <input id="email" type="email" required autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)} />
            <button className="btn" disabled={busy}>{busy ? 'Sending…' : 'Send sign-in code'}</button>
          </form>
        ) : (
          <form onSubmit={verify}>
            <p>We sent a code to <strong>{email}</strong>. Enter it below.</p>
            <label htmlFor="code">Sign-in code</label>
            <input id="code" inputMode="numeric" autoComplete="one-time-code" required value={code}
              onChange={(e) => setCode(e.target.value)} />
            <button className="btn" disabled={busy}>{busy ? 'Checking…' : 'Sign in'}</button>
            <button type="button" className="link" onClick={() => { setStep('email'); setCode(''); setMsg(null) }}>
              Use a different email
            </button>
          </form>
        )}
        {msg && <p className="error" role="alert">{msg}</p>}
      </section>
    </main>
  )
}
