import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useUser } from '../context/UserContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { colorForName } from '../utils/avatarColor.js'
import { isValidRoomCode, normalizeRoomCode } from '../utils/roomCode'
import { validateJoinRoom } from '../validation/joinRoomValidation'
import { roomService } from '../services/roomServiceInstance'
import '../App.css'

function JoinRoom() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useUser()
  const { t } = useLanguage()
  const inviteRoomCode = normalizeRoomCode(searchParams.get('roomCode') ?? '')
  const [code, setCode] = useState(inviteRoomCode)
  const [displayName, setDisplayName] = useState(user?.name ?? '')
  const [errors, setErrors] = useState({})
  const [serviceError, setServiceError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resuming, setResuming] = useState(() => isValidRoomCode(inviteRoomCode))

  useEffect(() => {
    setCode(inviteRoomCode)
    if (!isValidRoomCode(inviteRoomCode)) {
      setResuming(false)
      return undefined
    }

    let active = true
    setResuming(true)
    roomService.ensureRoom(inviteRoomCode)
      .then((room) => {
        if (active && room && roomService.getCurrentPlayer()) {
          navigate(`/room/${room.code}`, { replace: true })
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setResuming(false)
      })
    return () => { active = false }
  }, [inviteRoomCode, navigate])

  function handleCodeChange(event) {
    const value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
    setCode(value)
    setErrors((current) => ({ ...current, roomCode: undefined }))
    setServiceError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const validation = validateJoinRoom({ roomCode: code, displayName })
    setErrors(validation)
    setServiceError('')
    if (Object.keys(validation).length > 0) return

    setSubmitting(true)
    const result = await roomService.joinRoom({
      roomCode: normalizeRoomCode(code),
      displayName: displayName.trim(),
      color: colorForName(displayName),
    })
    setSubmitting(false)

    if (!result.ok) {
      const messages = {
        INVALID_ROOM_CODE: t('joinRoom.error'),
        ROOM_NOT_FOUND: t('joinRoom.notFoundError'),
        ROOM_FULL: t('joinRoom.roomFullError'),
        ROOM_ALREADY_STARTED: t('joinRoom.alreadyStartedError'),
      }
      setServiceError(messages[result.error])
      return
    }
    navigate(`/room/${result.room.code}`)
  }

  return (
    <div className="page">
      <div className="page-content">
        <button className="link-button" onClick={() => navigate('/')} type="button">
          {t('joinRoom.back')}
        </button>
        <div className="brand">{t('joinRoom.brand')}</div>
        <h1 className="title title-sm">{t('joinRoom.title')}</h1>
        <p className="subtitle">{t('joinRoom.subtitle')}</p>

        <form className="card" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="code">{t('joinRoom.label')}</label>
            <input
              id="code"
              className={`input input-code${errors.roomCode || serviceError ? ' has-error' : ''}`}
              type="text"
              inputMode="text"
              autoComplete="off"
              placeholder="ABC123"
              value={code}
              onChange={handleCodeChange}
              maxLength={6}
              autoFocus
              aria-describedby={errors.roomCode || serviceError ? 'room-code-error' : undefined}
            />
            {(errors.roomCode || serviceError) && (
              <span className="error-text" id="room-code-error">
                {serviceError || (errors.roomCode === 'EMPTY_ROOM_CODE' ? t('joinRoom.emptyCodeError') : t('joinRoom.error'))}
              </span>
            )}
          </div>

          <div className="field">
            <label htmlFor="displayName">{t('joinRoom.displayNameLabel')}</label>
            <input
              id="displayName"
              className={`input${errors.displayName ? ' has-error' : ''}`}
              type="text"
              value={displayName}
              onChange={(event) => {
                setDisplayName(event.target.value)
                setErrors((current) => ({ ...current, displayName: undefined }))
              }}
              maxLength={24}
              aria-describedby={errors.displayName ? 'display-name-error' : 'display-name-hint'}
            />
            {errors.displayName ? (
              <span className="error-text" id="display-name-error">{t('joinRoom.displayNameError')}</span>
            ) : (
              <span className="helper-text" id="display-name-hint">{t('joinRoom.displayNameHint')}</span>
            )}
          </div>

          <button className="btn btn-primary btn-block" type="submit" disabled={submitting || resuming}>
            <span className="btn-content">
              {submitting && <span className="spinner" />}
              {submitting ? t('joinRoom.submitting') : t('joinRoom.submit')}
            </span>
          </button>
        </form>
      </div>
    </div>
  )
}

export default JoinRoom
