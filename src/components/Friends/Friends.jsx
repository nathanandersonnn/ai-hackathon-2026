import { useEffect, useState } from 'react'
import { searchProfiles } from '../../lib/supabase/profiles'
import {
  listFriends, listPendingRequests,
  requestFriend, acceptFriend, removeFriend,
} from '../../lib/supabase/friendships'
import './Friends.css'

export default function Friends({ onOpenFriend }) {
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState([])
  const [friends, setFriends] = useState([])
  const [pending, setPending] = useState([])
  const [error, setError]     = useState('')

  async function refresh() {
    try {
      setFriends(await listFriends())
      setPending(await listPendingRequests())
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => { refresh() }, [])

  // Debounced so typing a handle does not fire a request per keystroke.
  useEffect(() => {
    if (query.trim().length < 3) { setResults([]); return }
    const t = setTimeout(() => {
      searchProfiles(query).then(setResults).catch(err => setError(err.message))
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  async function act(fn, id) {
    try {
      await fn(id)
      await refresh()
      setResults(r => r.filter(p => p.id !== id))
    } catch (err) {
      setError(err.message)
    }
  }

  const friendIds = new Set(friends.map(f => f.id))

  return (
    <div className="friends-view">
      <h1 className="friends-title">Friends</h1>
      {error && <div className="friends-error">{error}</div>}

      <input
        className="friends-search"
        placeholder="Search by handle…"
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      {query.trim().length > 0 && query.trim().length < 3 && (
        <p className="friends-hint">Type at least 3 characters.</p>
      )}

      {results.length > 0 && (
        <section className="friends-section">
          <h2>Results</h2>
          {results.map(p => (
            <div key={p.id} className="friend-row">
              <span className="friend-handle">@{p.handle}</span>
              {friendIds.has(p.id)
                ? <span className="friend-tag">Friends</span>
                : <button onClick={() => act(requestFriend, p.id)}>Add</button>}
            </div>
          ))}
        </section>
      )}

      {pending.length > 0 && (
        <section className="friends-section">
          <h2>Requests</h2>
          {pending.map(p => (
            <div key={p.id} className="friend-row">
              <span className="friend-handle">@{p.handle}</span>
              <button onClick={() => act(acceptFriend, p.id)}>Accept</button>
              <button className="friend-secondary" onClick={() => act(removeFriend, p.id)}>Decline</button>
            </div>
          ))}
        </section>
      )}

      <section className="friends-section">
        <h2>Your friends</h2>
        {friends.length === 0 && <p className="friends-empty">No friends yet. Search for a handle above.</p>}
        {friends.map(p => (
          <div key={p.id} className="friend-row">
            <button className="friend-handle friend-link" onClick={() => onOpenFriend(p)}>@{p.handle}</button>
            <button className="friend-secondary" onClick={() => act(removeFriend, p.id)}>Remove</button>
          </div>
        ))}
      </section>
    </div>
  )
}
