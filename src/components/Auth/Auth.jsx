import { useState } from 'react'
import { supabase } from '../../lib/supabase/client'
import './Auth.css'

export default function Auth({ onSignedIn }) {
  const [mode, setMode]         = useState('signin') // 'signin' | 'signup'
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [info, setInfo]         = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setInfo('')
    setLoading(true)

    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        onSignedIn?.()
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        // If email confirmation is enabled in Supabase, no session is returned yet.
        if (!data.session) {
          setInfo('Check your email for a confirmation link, then sign in.')
        } else {
          onSignedIn?.()
        }
      }
    } catch (err) {
      setError(prettifyAuthError(err))
    } finally {
      setLoading(false)
    }
  }

  function flipMode() {
    setMode(m => m === 'signin' ? 'signup' : 'signin')
    setError('')
    setInfo('')
  }

  const isSignIn = mode === 'signin'

  return (
    <div className="auth-view">
      <div className="auth-card">
        <h1 className="auth-title">{isSignIn ? 'Welcome back' : 'Create your account'}</h1>
        <p className="auth-sub">
          {isSignIn ? 'Sign in to MyFitBud.ai' : 'Start tracking your fitness'}
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </label>

          <label className="auth-field">
            <span>Password</span>
            <input
              type="password"
              autoComplete={isSignIn ? 'current-password' : 'new-password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </label>

          {error && <div className="auth-error">{error}</div>}
          {info  && <div className="auth-info">{info}</div>}

          <button type="submit" className="auth-submit" disabled={loading || !email || !password}>
            {loading ? '…' : isSignIn ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button className="auth-mode-toggle" onClick={flipMode}>
          {isSignIn ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  )
}

function prettifyAuthError(err) {
  const msg = (err?.message ?? '').toLowerCase()
  if (msg.includes('invalid login credentials'))   return 'Email or password is incorrect.'
  if (msg.includes('email not confirmed'))         return 'Please confirm your email — check your inbox.'
  if (msg.includes('user already registered'))     return 'An account with this email already exists. Try signing in.'
  if (msg.includes('password should be at least')) return 'Password must be at least 6 characters.'
  if (msg.includes('unable to validate email'))    return "That doesn't look like a valid email."
  if (msg.includes('over_email_send_rate_limit'))  return 'Too many attempts. Wait a minute and try again.'
  return err?.message ?? 'Something went wrong. Try again.'
}
