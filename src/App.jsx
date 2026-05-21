import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase/client'
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
  const [chatSeed, setChatSeed] = useState(null)  // optional pre-filled message for Chat

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

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
