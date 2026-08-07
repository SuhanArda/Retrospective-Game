import { useEffect, useState } from 'react'
import { useUser } from '../context/UserContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import Avatar from './Avatar.jsx'
import '../App.css'

const PREVIEW_COLOR = '#5b2a86'

function IdentityGate({ children }) {
  const { user, needsIdentity, saveUser } = useUser()
  const { t } = useLanguage()
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (needsIdentity) {
      setName(user?.name ?? '')
      setError('')
    }
  }, [needsIdentity, user])

  function handleSubmit(e) {
    e.preventDefault()
    if (name.trim().length < 2) {
      setError(t('identity.error'))
      return
    }
    saveUser(name)
    setName('')
    setError('')
  }

  return (
    <>
      {children}
      {needsIdentity && (
        <div className="identity-overlay">
          <form className="identity-modal" onSubmit={handleSubmit} noValidate>
            <Avatar name={name} color={PREVIEW_COLOR} size={64} />
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
            <button className="btn btn-primary btn-block" type="submit">
              {t('identity.submit')}
            </button>
          </form>
        </div>
      )}
    </>
  )
}

export default IdentityGate
