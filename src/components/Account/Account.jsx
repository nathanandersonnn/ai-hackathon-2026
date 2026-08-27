import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase/client'
import { getMyProfile, claimHandle, isHandleValid } from '../../lib/supabase/profiles'
import './Account.css'

export default function Account() {
  const [user, setUser]               = useState(null)
  const [username, setUsername]       = useState('')
  const [handle, setHandle]           = useState('')
  const [handleLoading, setHandleLoading] = useState(true)
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [saved, setSaved]             = useState(false)
  const [error, setError]             = useState('')

  const handleValid = isHandleValid(handle)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      setUsername(data.user?.user_metadata?.username ?? '')
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    getMyProfile()
      .then(p => setHandle(p?.handle ?? ''))
      .catch(() => {})
      .finally(() => setHandleLoading(false))
  }, [])

  async function handleSave() {
    setError('')
    // Defensive backstop: the Save button is disabled while the handle is
    // invalid (see `disabled` below), but guard here too so a stale click or
    // a future caller can never silently skip the handle write while still
    // reporting "Saved!" — an invalid or emptied handle aborts with an error
    // instead of no-op'ing.
    if (!handleValid) {
      setError('Handles are 3-20 characters: lowercase letters, numbers, underscores.')
      return
    }
    setSaving(true)
    try {
      const { data, error } = await supabase.auth.updateUser({
        data: { username: username.trim() }
      })
      if (error) throw error
      setUser(data.user)

      await claimHandle(handle, username.trim() || null)

      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err?.message ?? 'Could not update username.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="account-view">
        <p className="account-loading">Loading…</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="account-view">
        <p className="account-loading">You're not signed in.</p>
      </div>
    )
  }

  return (
    <div className="account-view">
      <header className="page-header">
        <div>
          <h1 className="page-title">Account</h1>
          <p className="page-subtitle">Manage your profile</p>
        </div>
      </header>

      <div className="account-card">
        <div className="account-field">
          <label className="field-label">Email</label>
          <div className="account-readonly">{user.email}</div>
          <p className="account-hint">Used for sign-in. Can't be changed here.</p>
        </div>

        <div className="account-field">
          <label className="field-label">Username</label>
          <input
            className="account-input"
            type="text"
            placeholder="What should we call you?"
            value={username}
            onChange={e => setUsername(e.target.value)}
            maxLength={40}
          />
          <p className="account-hint">This is how the AI Coach will address you.</p>
        </div>

        <div className="account-field">
          <label className="field-label">Handle</label>
          <input
            className="account-input"
            type="text"
            placeholder="your_handle"
            value={handle}
            onChange={e => setHandle(e.target.value.toLowerCase())}
            maxLength={20}
          />
          <p className={`account-hint ${!handleLoading && !handleValid ? 'account-hint--error' : ''}`}>
            {handleLoading
              ? 'Loading current handle…'
              : handleValid
                ? 'This is how friends find you.'
                : '3-20 characters: lowercase letters, numbers, underscores. Required — save is disabled until this is valid.'}
          </p>
        </div>

        {error && <div className="account-error">{error}</div>}

        <button
          className={`btn-accent account-save ${saved ? 'account-save--saved' : ''}`}
          onClick={handleSave}
          disabled={saving || saved || handleLoading || !handleValid}
        >
          {saved ? '✓ Saved!' : saving ? '…' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}
