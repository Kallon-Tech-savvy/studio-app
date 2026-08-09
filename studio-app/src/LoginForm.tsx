import { useState } from 'react'
import { supabase } from './lib/supabase'

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('sending')
    setError(null)

    const { error } = await supabase.auth.signInWithOtp({ email })

    if (error) {
      setError(error.message)
      setStatus('error')
    } else {
      setStatus('sent')
    }
  }

  if (status === 'sent') {
    return (
      <div className="login-card">
        <h2 className="section-heading">Darkroom access</h2>
        <p className="status-note">Check your email — the link brings you back here.</p>
      </div>
    )
  }

  return (
    <div className="login-card">
      <h2 className="section-heading">Darkroom access</h2>
      <p className="section-sub">Enter your email for a one-time link.</p>
      <form onSubmit={handleSubmit} className="field-stack">
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <button type="submit" className="btn" disabled={status === 'sending'}>
          {status === 'sending' ? 'Sending…' : 'Send access link'}
        </button>
        {error && <p className="status-note status-error">{error}</p>}
      </form>
    </div>
  )
}
