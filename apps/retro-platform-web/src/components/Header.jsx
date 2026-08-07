import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useUser } from '../context/UserContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import Avatar from './Avatar.jsx'
import TypeText from './TypeText.jsx'
import LangSwitch from './LangSwitch.jsx'
import ThemeToggle from './ThemeToggle.jsx'
import '../App.css'

function Header() {
  const [open, setOpen] = useState(false)
  const { user, openEditor } = useUser()
  const { t } = useLanguage()
  const navigate = useNavigate()

  const links = [
    { to: '/', label: t('nav.home') },
    { to: '/room/create', label: t('nav.createRoom') },
    { to: '/room/join', label: t('nav.joinRoom') },
  ]

  return (
    <>
      <div className="top-accent" />
      <header className="site-header">
        <button className="header-brand" onClick={() => navigate('/')} type="button">
          <span className="header-logo">
            <svg width="16" height="16" viewBox="0 0 64 64" fill="none" aria-hidden="true">
              <circle cx="22" cy="32" r="7" fill="#ff8c42" />
              <circle cx="43" cy="22" r="6" fill="#ff8c42" />
              <circle cx="43" cy="42" r="6" fill="#ff8c42" />
            </svg>
          </span>
          <span className="header-brand-text">
            <TypeText text={t('header.brand')} />
          </span>
        </button>

        <div className="header-actions">
          <LangSwitch />
          <ThemeToggle />
          {user && <Avatar name={user.name} color={user.color} size={34} />}
          <button
            className="menu-btn"
            onClick={() => setOpen(true)}
            type="button"
            aria-label={t('header.openMenu')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>
      </header>

      {open && (
        <>
          <div className="drawer-overlay" onClick={() => setOpen(false)} />
          <aside className="drawer">
            <button
              className="drawer-close"
              onClick={() => setOpen(false)}
              type="button"
              aria-label={t('header.closeMenu')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="5" y1="5" x2="19" y2="19" />
                <line x1="19" y1="5" x2="5" y2="19" />
              </svg>
            </button>

            {user && (
              <div className="drawer-profile">
                <Avatar name={user.name} color={user.color} size={42} />
                <div>
                  <div className="name">{user.name}</div>
                  <button
                    className="edit-link"
                    type="button"
                    onClick={() => {
                      setOpen(false)
                      openEditor()
                    }}
                  >
                    {t('nav.editName')}
                  </button>
                </div>
              </div>
            )}

            <nav className="drawer-nav">
              {links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.to === '/'}
                  className={({ isActive }) => `drawer-link${isActive ? ' active' : ''}`}
                  onClick={() => setOpen(false)}
                >
                  {link.label}
                </NavLink>
              ))}
            </nav>

            <div className="drawer-bottom">
              <div className="drawer-lang">
                <span>{t('nav.language')}</span>
                <LangSwitch />
              </div>
              <div className="drawer-lang">
                <span>{t('nav.theme')}</span>
                <ThemeToggle />
              </div>
            </div>
          </aside>
        </>
      )}
    </>
  )
}

export default Header
