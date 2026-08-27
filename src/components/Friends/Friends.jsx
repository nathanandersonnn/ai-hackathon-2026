import { useEffect, useState } from 'react'
import { searchProfiles } from '../../lib/supabase/profiles'
import {
  listFriends, listPendingRequests, listOutgoingPending,
  requestFriend, acceptFriend, removeFriend,
} from '../../lib/supabase/friendships'
import ErrorBanner from './ErrorBanner'
import './Friends.css'

export default function Friends({ user, onOpenFriend, onNavigate }) {
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState([])
  const [friends, setFriends] = useState([])
  const [pending, setPending] = useState([])
  const [outgoing, setOutgoing] = useState([])
  const [error, setError]     = useState('')

  async function refresh() {
    try {
      const [friendsData, pendingData, outgoingData] = await Promise.all([
        listFriends(), listPendingRequests(), listOutgoingPending(),
      ])
      setFriends(friendsData)
      setPending(pendingData)
      setOutgoing(outgoingData)
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => { if (user) refresh() }, [user])

  // Debounced so typing a handle does not fire a request per keystroke.
  // A `cancelled` flag guards against a slow response for a short prefix
  // landing after (and overwriting) a faster response for a longer prefix.
  useEffect(() => {
    if (query.trim().length < 3) { setResults([]); return }
    let cancelled = false
    const t = setTimeout(() => {
      searchProfiles(query)
        .then(r => { if (!cancelled) setResults(r) })
        .catch(err => { if (!cancelled) setError(err.message) })
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [query])

  async function act(fn, id, { filterResults = true } = {}) {
    try {
      await fn(id)
      await refresh()
      if (filterResults) setResults(r => r.filter(p => p.id !== id))
    } catch (err) {
      setError(err.message)
    }
  }

  // Sending a request keeps the target visible in results with a disabled
  // "Requested" affordance rather than having it silently disappear.
  function sendRequest(id) {
    act(requestFriend, id, { filterResults: false })
  }

  const friendIds = new Set(friends.map(f => f.id))
  const outgoingIds = new Set(outgoing.map(f => f.id))

  if (!user) {
    return (
      <div className="friends-view">
        <h1 className="friends-title">Friends</h1>
        <section className="friends-section">
          <p className="friends-empty">Sign in to add friends, see their workouts, and copy their presets.</p>
          <button className="friend-secondary" onClick={() => onNavigate?.('auth')}>Sign in</button>
        </section>
      </div>
    )
  }

  return (
    <div className="friends-view">
      <h1 className="friends-title">Friends</h1>
      <ErrorBanner message={error} />

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
                : outgoingIds.has(p.id)
                  ? <button className="friend-secondary" disabled>Requested</button>
                  : <button onClick={() => sendRequest(p.id)}>Add</button>}
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
