import { useEffect, useState } from 'react'
import { useUser } from '../context/UserContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import Avatar from './Avatar.jsx'
import { AVATAR_OPTIONS, avatarImageSrc } from '../utils/avatarOptions.js'
import { roomService } from '../services/roomServiceInstance'
import '../App.css'

const PREVIEW_COLOR = '#5b2a86'

function IdentityGate({ children }) {
  const { user, needsIdentity, saveUser, closeEditor } = useUser()
  const { t } = useLanguage()
  const [name, setName] = useState('')
  const [avatarId, setAvatarId] = useState(null)
  const [error, setError] = useState('')

  // Dismissible only when there's already a saved identity to fall back to
  // (i.e. this is the "edit name" flow, not first-time mandatory setup).
  const dismissible = Boolean(user)

  useEffect(() => {
    if (needsIdentity) {
      setName(user?.name ?? '')
      setAvatarId(user?.avatarId ?? null)
      setError('')
    }
  }, [needsIdentity, user])

  // Lock background scroll while the modal is open, and restore it on close.
  useEffect(() => {
    if (!needsIdentity) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [needsIdentity])

  // Esc closes the modal, but only in the dismissible (edit) case.
  useEffect(() => {
    if (!needsIdentity || !dismissible) return undefined
    function handleKeyDown(e) {
      if (e.key === 'Escape') closeEditor()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [needsIdentity, dismissible, closeEditor])

  // currentTarget is always the overlay (that's what the listener is bound
  // to); target is whatever was actually under the cursor. They're equal
  // only when the mousedown started on the overlay backdrop itself, not on
  // (or inside) the modal card that sits on top of it.
  function handleOverlayMouseDown(e) {
    if (dismissible && e.target === e.currentTarget) closeEditor()
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (name.trim().length < 2) {
      setError(t('identity.error'))
      return
    }
    saveUser(name, avatarId)
    // This dialog also opens from inside an already-joined room (the
    // Header's "edit" link) — when it does, the room's own copy of your
    // avatar needs updating too, or the lobby keeps showing the old one.
    // Silently skipped outside a room: getCurrentPlayer() is null before
    // you've ever joined one, which is the common case for first-time setup.
    if (roomService.getCurrentPlayer()) {
      void roomService.updateAvatar(avatarId ?? undefined).catch(() => {})
    }
    setName('')
    setError('')
  }

  return (
    <>
      {children}
      {needsIdentity && (
        <div className="identity-overlay" onMouseDown={handleOverlayMouseDown}>
          <form className="identity-modal" onSubmit={handleSubmit} noValidate>
            <div className="identity-modal-header">
              <Avatar name={name} color={PREVIEW_COLOR} avatarId={avatarId} size={64} />
              <div>
                <h2>{t('identity.heading')}</h2>
                <p className="helper-text">{t('identity.helper')}</p>
              </div>
              <input
                className={`input${error ? ' has-error' : ''}`}
                placeholder={t('identity.placeholder')}
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  if (error) setError('')
                }}
                maxLength={24}
                autoFocus
              />
              {error && <span className="error-text">{error}</span>}
            </div>

            <div className="identity-modal-divider" />

            <div className="identity-modal-avatars">
              <p className="helper-text">{t('identity.avatarHint')}</p>
              <div className="avatar-picker">
                {AVATAR_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`avatar-picker-option${avatarId === option.id ? ' is-selected' : ''}`}
                    aria-label={option.label}
                    aria-pressed={avatarId === option.id}
                    onClick={() => setAvatarId(avatarId === option.id ? null : option.id)}
                  >
                    <img src={avatarImageSrc(option.id)} alt="" width={72} height={72} className="avatar-image" />
                  </button>
                ))}
              </div>
            </div>

            <div className="identity-modal-footer">
              <button className="btn btn-primary btn-block" type="submit" disabled={name.trim().length < 2}>
                {t('identity.submit')}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}

export default IdentityGate
