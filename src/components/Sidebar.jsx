import './Sidebar.css'

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard',  icon: GridIcon },
  { id: 'camera',    label: 'Form Check', icon: CameraIcon },
  { id: 'chat',      label: 'AI Coach',   icon: ChatIcon },
  { id: 'workouts',  label: 'Workouts',   icon: WorkoutsIcon },
  { id: 'calories',  label: 'Calories',   icon: CaloriesIcon },
  { id: 'logging',   label: 'Daily Log',  icon: LogIcon },
  { id: 'goals',     label: 'Goals',      icon: GoalIcon },
]

export default function Sidebar({ active, onNavigate, user, onSignOut }) {
  const username = user?.user_metadata?.username?.trim() || null
  const emailPrefix = user?.email?.split('@')[0] ?? ''
  const displayName = username || emailPrefix || 'Sign in'
  const initial = (username?.[0] ?? user?.email?.[0] ?? '?').toUpperCase()

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <img src="/barbell_logo.png" alt="MyFitBud logo" className="logo-img" />
        <span className="logo-text">MyFitBud<span className="logo-dot">.ai</span></span>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`nav-item ${active === id ? 'nav-item--active' : ''}`}
            onClick={() => onNavigate(id)}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <button
        className={`nav-item about-nav-item ${active === 'about' ? 'nav-item--active' : ''}`}
        onClick={() => onNavigate('about')}
      >
        <AboutIcon />
        <span>About Us</span>
      </button>

      <div
        className="sidebar-user sidebar-user--clickable"
        onClick={() => onNavigate(user ? 'account' : 'auth')}
        role="button"
      >
        <div className="user-avatar">{initial}</div>
        <div className="user-info">
          <div className="user-name">{user ? displayName : 'Sign in'}</div>
          {user ? (
            <button
              className="user-signout"
              onClick={(e) => { e.stopPropagation(); onSignOut() }}
            >
              Sign out
            </button>
          ) : (
            <div className="user-streak">Click to log in</div>
          )}
        </div>
      </div>
    </aside>
  )
}

function GridIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
    </svg>
  )
}
function CameraIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
    </svg>
  )
}
function ChatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  )
}
function LogIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
      <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
      <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
    </svg>
  )
}
function AboutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  )
}
function CaloriesIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
      <line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>
    </svg>
  )
}
function WorkoutsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.5 6.5h11"/><path d="M6.5 17.5h11"/>
      <path d="M3 9.5l3-3 3 3"/><path d="M3 14.5l3 3 3-3"/>
      <path d="M15 9.5l3-3 3 3"/><path d="M15 14.5l3 3 3-3"/>
    </svg>
  )
}
function GoalIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
    </svg>
  )
}

