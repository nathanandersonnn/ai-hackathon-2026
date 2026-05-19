import './About.css'

// ─────────────────────────────────────────────
//  FILL IN YOUR TEXT IN THE SECTIONS BELOW
//  Search for "EDIT:" to find every spot quickly
// ─────────────────────────────────────────────

// EDIT: App tagline shown under the title
const TAGLINE = "Your AI-powered fitness companion — built for real life."

// EDIT: 2–3 sentence description of what MyFitBud is
const DESCRIPTION = `
  One of the biggest barriers to a healthy life comes from not knowing what to do.
  We've all been there: Scrolling through YouTube videos, trying to learn and understand.
  This takes time, and busy schedules often mean putting that off indefinitely. Even those of us
  who workout regularly have to have five seperate apps: One for steps, one for weight logging, one
  to log workouts, another to find new exercises and one to count macros. The MyFitBud.ai team carries 
  a strong passion for physical fitness, and we want to create an all in one space for this. The camera
  feauture allows you to feel confident in your movements, knowing that you won't injure yourself from 
  improper form. We also understand that life happens, and MyFitBud is built to adapt to changing 
  circumstances.
`

// EDIT: Team members — add or remove objects as needed
const TEAM = [
  { name: "Nathan Anderson",   role: "Frontend Development & UI",  bio: "I'm a third year Computer Science Major, with a strong passion for physical fitness." },
  { name: "Aiden Rubey",   role: "AI Chat & Backend",          bio: "EDIT: Short bio here." },
  { name: "George Leyva",   role: "UI, Frontend & Integration", bio: "EDIT: Short bio here." },
]

// EDIT: Any links you want to show (GitHub, demo, etc.) — set href to the real URL
const LINKS = [
  { label: "GitHub",       href: "#" },
  { label: "Live Demo",    href: "#" },
  { label: "Contact Us",   href: "#" },
]

// EDIT: Hackathon / project context
const CONTEXT = "Built at the 2026 AI Hackathon."

// ─────────────────────────────────────────────
//  Component — no need to edit below this line
// ─────────────────────────────────────────────

export default function About() {
  return (
    <div className="about-view">
      <header className="page-header">
        <div>
          <h1 className="page-title">About MyFitBud.ai</h1>
          <p className="page-subtitle">{TAGLINE}</p>
        </div>
      </header>

      <div className="about-layout">

        <div className="about-card">
          <h2 className="card-title">What We Built</h2>
          <p className="about-body">{DESCRIPTION.trim()}</p>
        </div>

        <div className="about-card">
          <h2 className="card-title">The Team</h2>
          <div className="team-grid">
            {TEAM.map((member, i) => (
              <div key={i} className="team-card">
                <div className="team-avatar">{member.name.charAt(0)}</div>
                <div className="team-info">
                  <div className="team-name">{member.name}</div>
                  <div className="team-role">{member.role}</div>
                  <div className="team-bio">{member.bio}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="about-card about-footer-row">
          <div className="about-context">{CONTEXT}</div>
          <div className="about-links">
            {LINKS.map((l, i) => (
              <a key={i} href={l.href} className="about-link" target="_blank" rel="noreferrer">
                {l.label}
              </a>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
