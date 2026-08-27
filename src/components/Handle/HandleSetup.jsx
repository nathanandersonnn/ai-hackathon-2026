import { useState } from 'react'
import { claimHandle, isHandleValid } from '../../lib/supabase/profiles'
import './HandleSetup.css'

export default function HandleSetup({ user, onDone }) {
  // Seed from the free-text username the user may already have set in
  // Account. It is a display name, not a handle, so it only suggests.
  const seed = (user?.user_metadata?.username ?? user?.email?.split('@')[0] ?? '')
    .toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20)

  const [handle, setHandle]   = useState(seed)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const valid = isHandleValid(handle)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const claimed = await claimHandle(handle, user?.user_metadata?.username ?? null)
      onDone(claimed)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="handle-view">
      <div className="handle-card">
        <h1 className="handle-title">Pick your handle</h1>
        <p className="handle-sub">This is how friends find you. You can change it later.</p>
        <form onSubmit={submit}>
          <label className="handle-field">
            <span>Handle</span>
            <div className="handle-input-wrap">
              <span className="handle-at">@</span>
              <input
                value={handle}
                onChange={e => setHandle(e.target.value.toLowerCase())}
                autoFocus
                maxLength={20}
              />
            </div>
          </label>
          <p className="handle-hint">3-20 characters: lowercase letters, numbers, underscores.</p>
          {error && <div className="handle-error">{error}</div>}
          <button type="submit" className="handle-submit" disabled={!valid || loading}>
            {loading ? '…' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
