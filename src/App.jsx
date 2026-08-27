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
  const [chatSeed, setChatSeed] = useState(null)  // optional pre-filled message for Chat

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user) { setProfile(undefined); return }
    setProfile(undefined)
    getMyProfile().then(setProfile).catch(() => setProfile(null))
  }, [user])

  async function handleSignOut() {
    await supabase.auth.signOut()
    setActiveView('dashboard')
  }

  function handleSignedIn() {
    setActiveView('dashboard')
  }

  // navigate(view) or navigate(view, { chatSeed }) — used to deep-link into Chat with a question
  function handleNavigate(view, opts = {}) {
    if (typeof opts.chatSeed === 'string') setChatSeed(opts.chatSeed)
    setActiveView(view)
  }

  // A signed-out visitor keeps the existing browse-then-sign-in flow — no gate.
  // A signed-in visitor is gated on having a profile row: `undefined` while it
  // loads (render nothing, so the gate doesn't flash on every page load), then
  // either the handle picker (`null`) or the app itself (loaded object).
  if (user && profile === undefined) return null
  if (user && profile === null) {
    return <HandleSetup user={user} onDone={() => getMyProfile().then(setProfile)} />
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
        <ActiveView {...viewProps} />
      </main>
    </div>
  )
}
