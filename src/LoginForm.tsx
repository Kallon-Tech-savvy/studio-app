import { useState } from 'react'
import { supabase } from './lib/supabase'

export function LoginForm() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('sending')
    setError(null)

    try {
      const normalizedEmail = email.trim().toLowerCase()

      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        })
        if (error) throw error
      } else {
        if (password.length < 8) {
          throw new Error('Password must contain at least 8 characters.')
        }

        const { error: signUpError } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            data: {
              full_name: fullName.trim() || normalizedEmail,
            },
          },
        })

        // Attempt immediate sign-in in case email confirmation is disabled or user creation succeeded
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        })

        if (signInErr && signUpError) {
          throw signUpError
        }
      }

      setStatus('done')
    } catch (err: unknown) {
      let message = err instanceof Error ? err.message : 'Unable to continue with studio sign-in.'
      
      if (mode === 'signin' && message.toLowerCase().includes('invalid login credentials')) {
        message = 'Invalid email or password. If this is your first time logging in, click "Create staff account" above to register your password.'
      } else if (mode === 'signup' && message.toLowerCase().includes('already registered')) {
        message = 'A staff account with this email already exists. Click "Sign in" above to enter your password.'
      }

      setError(message)
      setStatus('error')
    }
  }

  if (status === 'done') {
    return (
      <div className="login-card">
        <h2 className="section-heading">Darkroom Access</h2>
        <p className="status-note">
          {mode === 'signin'
            ? 'Signed in successfully.'
            : 'Staff account created. Check your email if confirmation is required, then sign in.'}
        </p>
      </div>
    )
  }

  return (
    <div className="login-card">
      <h2 className="section-heading">Darkroom Access</h2>
      <p className="section-sub">
        {mode === 'signin'
          ? 'Use your studio password to enter the dashboard.'
          : 'Create a studio staff account for the team.'}
      </p>

      <div className="toggle-row" style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button
          type="button"
          className={mode === 'signin' ? 'btn' : 'btn btn-secondary'}
          onClick={() => { setMode('signin'); setStatus('idle'); setError(null) }}
        >
          Sign in
        </button>
        <button
          type="button"
          className={mode === 'signup' ? 'btn' : 'btn btn-secondary'}
          onClick={() => { setMode('signup'); setStatus('idle'); setError(null) }}
        >
          Create staff account
        </button>
      </div>

      <form onSubmit={handleSubmit} className="field-stack">
        {mode === 'signup' && (
          <div className="field">
            <label htmlFor="full-name">Full name</label>
            <input
              id="full-name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jane Photographer"
              maxLength={120}
              autoComplete="name"
            />
          </div>
        )}

        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
          />
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          />
        </div>

        <button type="submit" className="btn" disabled={status === 'sending'}>
          {status === 'sending'
            ? mode === 'signin' ? 'Signing in…' : 'Creating account…'
            : mode === 'signin' ? 'Enter the studio' : 'Create staff account'}
        </button>

        {error && <p className="status-note status-error" role="alert">{error}</p>}
      </form>
    </div>
  )
}