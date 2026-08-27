import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase/client'
import { getMyProfile } from './lib/supabase/profiles'
import Sidebar from './components/Sidebar'
import Camera from './components/Camera/Camera'
import Chat from './components/Chat/Chat'
import Dashboard from './components/Dashboard/Dashboard'
import Logging from './components/Logging/Logging'
import Goals from './components/Goals/Goals'
import Workouts from './components/Workouts/Workouts'
import Calories from './components/Calories/Calories'
import About from './components/About/About'
import Auth from './components/Auth/Auth'
import Account from './components/Account/Account'
import HandleSetup from './components/Handle/HandleSetup'
import Friends from './components/Friends/Friends'
import FriendProfile from './components/Friends/FriendProfile'
import './App.css'

const VIEWS = {
  dashboard: Dashboard,
  camera: Camera,
  chat: Chat,
  workouts: Workouts,
  calories: Calories,
  logging: Logging,
  goals: Goals,
  about: About,
  auth: Auth,
  account: Account,
}

export default function App() {
  const [activeView, setActiveView] = useState('dashboard')
  const [user, setUser] = useState(null)
  // undefined = still loading, null = signed in but no profile row yet, object = loaded profile
  const [profile, setProfile] = useState(undefined)
  // Distinct from `profile === null` ("no row" — a real, resolved answer from
  // getMyProfile). This is "the fetch itself failed" — a network blip or an
  // expired token. Conflating the two would show the handle gate to a user who
  // already has a handle, and typing a new one there would silently rewrite
  // their existing row (claimHandle's upsert conflicts on the id PK, so it
  // updates rather than errors).
  const [profileError, setProfileError] = useState(false)
  const [chatSeed, setChatSeed] = useState(null)  // optional pre-filled message for Chat
  const [openFriend, setOpenFriend] = useState(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Keyed on user?.id, not `user` itself: onAuthStateChange fires a new user
  // object (same id) on every token refresh / tab-focus revalidation. Keying
  // on the object would re-run this on each of those, dropping profile back
  // to undefined and unmounting the whole app tree via the `return null`
  // below — destroying an open chat thread, a form in progress, etc.
  useEffect(() => {
    if (!user) { setProfile(undefined); setProfileError(false); return }
    loadProfile()
  }, [user?.id])

  function loadProfile() {
    setProfile(undefined)
    setProfileError(false)
    getMyProfile().then(setProfile).catch(() => setProfileError(true))
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    handleNavigate('dashboard')
  }

  function handleSignedIn() {
    handleNavigate('dashboard')
  }

  // navigate(view) or navigate(view, { chatSeed }) — used to deep-link into Chat with a question
  function handleNavigate(view, opts = {}) {
    if (typeof opts.chatSeed === 'string') setChatSeed(opts.chatSeed)
    if (view !== 'friends') setOpenFriend(null)
    setActiveView(view)
  }

  // A signed-out visitor keeps the existing browse-then-sign-in flow — no gate.
  // A signed-in visitor is gated on having a profile row: `undefined` while it
  // loads (render nothing, so the gate doesn't flash on every page load), then
  // either an error/retry view (fetch failed — never the gate), the handle
  // picker (a genuine `null` — no row), or the app itself (loaded object).
  if (user && profileError) {
    return (
      <div className="handle-view">
        <div className="handle-card">
          <h1 className="handle-title">Couldn't load your profile</h1>
          <p className="handle-sub">Something went wrong reaching the server. Check your connection and try again.</p>
          <button type="button" className="handle-submit" onClick={loadProfile}>Retry</button>
          <button type="button" className="handle-mode-toggle" onClick={handleSignOut}>Sign out</button>
        </div>
      </div>
    )
  }
  if (user && profile === undefined) return null
  if (user && profile === null) {
    return <HandleSetup user={user} onDone={setProfile} />
  }

  const ActiveView = VIEWS[activeView]
  const viewProps =
    activeView === 'auth' ? { onSignedIn: handleSignedIn } :
    activeView === 'chat' ? { user, seed: chatSeed, onSeedConsumed: () => setChatSeed(null) } :
    activeView === 'dashboard' ? { user, onSignOut: handleSignOut, onNavigate: handleNavigate } :
    activeView === 'camera' ? { onNavigate: handleNavigate } :
    {}

  return (
    <div className="app-shell">
      <Sidebar
        active={activeView}
        onNavigate={handleNavigate}
        user={user}
        onSignOut={handleSignOut}
      />
      <main className="app-main">
        {activeView === 'friends'
          ? (openFriend
              ? <FriendProfile profile={openFriend} onBack={() => setOpenFriend(null)} />
              : <Friends user={user} onOpenFriend={setOpenFriend} onNavigate={handleNavigate} />)
          : <ActiveView {...viewProps} />}
      </main>
    </div>
  )
}
