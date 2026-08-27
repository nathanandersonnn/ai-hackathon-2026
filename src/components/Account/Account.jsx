import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase/client'
import { getMyProfile, claimHandle, isHandleValid } from '../../lib/supabase/profiles'
import './Account.css'

export default function Account() {
  const [user, setUser]               = useState(null)
  const [username, setUsername]       = useState('')
  const [handle, setHandle]           = useState('')
  // Whether the user has actually edited the handle field, vs. it just
  // showing whatever loaded (or failed to load). The handle write on Save is
  // gated on this, not on the field's current value alone — see the note by
  // handleTouchedRef below for why that distinction matters.
  const [handleTouched, setHandleTouched] = useState(false)
  const [handleLoading, setHandleLoading] = useState(true)
  const [handleLoadFailed, setHandleLoadFailed] = useState(false)
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [saved, setSaved]             = useState(false)
  const [error, setError]             = useState('')

  const handleValid = isHandleValid(handle)
  // Mirrors handleTouched but readable synchronously inside the fetch's
  // .then(), which closed over handleTouched's value (false) at mount time.
  // Without this, a fast typist editing the handle before the profile fetch
  // resolves would have their edit silently clobbered by the server value.
  const handleTouchedRef = useRef(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      setUsername(data.user?.user_metadata?.username ?? '')
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    getMyProfile()
      .then(p => { if (!handleTouchedRef.current) setHandle(p?.handle ?? '') })
      // A rejected fetch is "we couldn't reach the server", not "this user
      // has no handle" (the handle column is NOT NULL — every profile row
      // has one). Do NOT fall back to null/empty here: that would show a
      // spurious "no handle" state and, if the user typed a replacement to
      // get unblocked, claimHandle's upsert would silently overwrite their
      // real handle (same failure mode as Finding 2, in this file).
      .catch(() => setHandleLoadFailed(true))
      .finally(() => setHandleLoading(false))
  }, [])

  function onHandleChange(e) {
    handleTouchedRef.current = true
    setHandleTouched(true)
    setHandle(e.target.value.toLowerCase())
  }

  async function handleSave() {
    setError('')
    // Defensive backstop: Save is disabled while a touched handle is
    // invalid (see `disabled` below), but guard here too so a stale click
    // can never silently skip the handle write while still reporting
    // "Saved!". An untouched handle (including one that failed to load) is
    // never written — only a handle the user actively edited is.
    if (handleTouched && !handleValid) {
      setError('Handles are 3-20 characters: lowercase letters, numbers, underscores.')
      return
    }
    setSaving(true)
    try {
      // Claim the handle first: if it's taken, we bail out here and the
      // username is left untouched, rather than committing the username and
      // then reporting a handle error against an already-half-saved form.
      if (handleTouched) {
        await claimHandle(handle, username.trim() || null)
      }

      const { data, error } = await supabase.auth.updateUser({
        data: { username: username.trim() }
      })
      if (error) throw error
      setUser(data.user)

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
            onChange={onHandleChange}
            maxLength={20}
          />
          <p className={`account-hint ${handleTouched && !handleLoading && !handleValid ? 'account-hint--error' : ''}`}>
            {handleLoading
              ? 'Loading current handle…'
              : handleLoadFailed && !handleTouched
                ? "Couldn't load your current handle — your username can still be saved. Type a new handle only if you want to change it."
                : handleTouched && !handleValid
                  ? '3-20 characters: lowercase letters, numbers, underscores. Required — save is disabled until this is valid.'
                  : 'This is how friends find you.'}
          </p>
        </div>

        {error && <div className="account-error">{error}</div>}

        <button
          className={`btn-accent account-save ${saved ? 'account-save--saved' : ''}`}
          onClick={handleSave}
          disabled={saving || saved || (handleTouched && !handleValid)}
        >
          {saved ? '✓ Saved!' : saving ? '…' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}
