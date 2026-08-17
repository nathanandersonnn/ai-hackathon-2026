import { useEffect, useState } from 'react'
import './Sidebar.css'

// Desktop shows every destination in the rail. A phone can't hold eight
// legible targets in one row, so mobile promotes the five that get used
// mid-session and puts the rest behind More.
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard',  icon: GridIcon,     primary: true },
  { id: 'workouts',  label: 'Workouts',   icon: WorkoutsIcon, primary: true },
  { id: 'camera',    label: 'Form Check', icon: CameraIcon,   primary: true },
  { id: 'chat',      label: 'AI Coach',   icon: ChatIcon,     primary: true },
  { id: 'calories',  label: 'Calories',   icon: CaloriesIcon },
  { id: 'logging',   label: 'Daily Log',  icon: LogIcon },
  { id: 'goals',     label: 'Goals',      icon: GoalIcon },
]

const OVERFLOW_ITEMS = NAV_ITEMS.filter(i => !i.primary)

export default function Sidebar({ active, onNavigate, user, onSignOut }) {
  const [sheetOpen, setSheetOpen] = useState(false)

  const username = user?.user_metadata?.username?.trim() || null
  const emailPrefix = user?.email?.split('@')[0] ?? ''
  const displayName = username || emailPrefix || 'Sign in'
  const initial = (username?.[0] ?? user?.email?.[0] ?? '?').toUpperCase()

  // A destination behind More still lights the More slot, so the bar always
  // shows where you are.
  const inOverflow = OVERFLOW_ITEMS.some(i => i.id === active) ||
                     active === 'about' || active === 'account'

  useEffect(() => {
    if (!sheetOpen) return
    const onKey = e => e.key === 'Escape' && setSheetOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheetOpen])

  function go(view) {
    setSheetOpen(false)
    onNavigate(view)
  }

  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-logo">
          <img src="/barbell_logo.png" alt="" className="logo-img" />
          <span className="logo-text">MyFitBud<span className="logo-dot">.ai</span></span>
        </div>

        <nav className="sidebar-nav" aria-label="Main">
          {NAV_ITEMS.map(({ id, label, icon: Icon, primary }) => (
            <button
              key={id}
              data-nav-id={id}
              data-primary={primary ? 'true' : 'false'}
              className={`nav-item ${active === id ? 'nav-item--active' : ''}`}
              aria-current={active === id ? 'page' : undefined}
              onClick={() => go(id)}
            >
              <Icon />
              <span>{label}</span>
            </button>
          ))}

          {/* Mobile-only fifth slot. Hidden on desktop, where the rail has
              room for every destination. */}
          <button
            className={`nav-item nav-item--more ${inOverflow ? 'nav-item--active' : ''}`}
            aria-expanded={sheetOpen}
            aria-haspopup="dialog"
            onClick={() => setSheetOpen(v => !v)}
          >
            <MoreIcon />
            <span>More</span>
          </button>
        </nav>

        <button
          className={`nav-item about-nav-item ${active === 'about' ? 'nav-item--active' : ''}`}
          onClick={() => go('about')}
        >
          <AboutIcon />
          <span>About Us</span>
        </button>

        <div
          className="sidebar-user sidebar-user--clickable"
          onClick={() => go(user ? 'account' : 'auth')}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && go(user ? 'account' : 'auth')}
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

      {sheetOpen && (
        <MoreSheet
          active={active}
          user={user}
          displayName={displayName}
          initial={initial}
          onGo={go}
          onSignOut={onSignOut}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </>
  )
}

// ── More sheet ───────────────────────────────────────────────
// Rises from the bar it belongs to rather than dropping over the page,
// so the gesture and the geometry agree.
function MoreSheet({ active, user, displayName, initial, onGo, onSignOut, onClose }) {
  return (
    <div
      className="more-scrim"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="more-sheet" role="dialog" aria-label="More destinations">
        <div className="more-grip" aria-hidden="true" />

        <div className="more-list">
          {OVERFLOW_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`more-row ${active === id ? 'more-row--active' : ''}`}
              aria-current={active === id ? 'page' : undefined}
              onClick={() => onGo(id)}
            >
              <Icon />
              <span>{label}</span>
            </button>
          ))}
          <button
            className={`more-row ${active === 'about' ? 'more-row--active' : ''}`}
            onClick={() => onGo('about')}
          >
            <AboutIcon />
            <span>About Us</span>
          </button>
        </div>

        <div className="more-account">
          <button className="more-account-id" onClick={() => onGo(user ? 'account' : 'auth')}>
            <div className="user-avatar">{initial}</div>
            <div className="user-info">
              <div className="user-name">{user ? displayName : 'Sign in'}</div>
              <div className="user-streak">{user ? 'View account' : 'Save your training'}</div>
            </div>
          </button>
          {user && (
            <button className="more-signout" onClick={() => { onClose(); onSignOut() }}>
              Sign out
            </button>
          )}
        </div>
      </div>
    </div>
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
// Three loaded slots — the same rack vocabulary the dashboard uses, not a
// generic hamburger.
function MoreIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="4" x2="5" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/><line x1="19" y1="4" x2="19" y2="20"/>
      <line x1="2" y1="14" x2="8" y2="14"/><line x1="9" y1="10" x2="15" y2="10"/><line x1="16" y1="16" x2="22" y2="16"/>
    </svg>
  )
}
