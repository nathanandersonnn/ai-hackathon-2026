import { useState } from 'react'
import Sidebar from './components/Sidebar'
import Camera from './components/Camera/Camera'
import Chat from './components/Chat/Chat'
import Dashboard from './components/Dashboard/Dashboard'
import Logging from './components/Logging/Logging'
import Goals from './components/Goals/Goals'
import Workouts from './components/Workouts/Workouts'
import Calories from './components/Calories/Calories'
import './App.css'

const VIEWS = {
  dashboard: Dashboard,
  camera: Camera,
  chat: Chat,
  workouts: Workouts,
  calories: Calories,
  logging: Logging,
  goals: Goals,
}

export default function App() {
  const [activeView, setActiveView] = useState('dashboard')
  const ActiveView = VIEWS[activeView]

  return (
    <div className="app-shell">
      <Sidebar active={activeView} onNavigate={setActiveView} />
      <main className="app-main">
        <ActiveView />
      </main>
    </div>
  )
}
