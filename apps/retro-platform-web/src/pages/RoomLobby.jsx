import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext.jsx'
import { isMockMode, roomService } from '../services/roomServiceInstance'
import { findGame, gameRegistry } from '../games/gameRegistry'
import { useRoom } from '../hooks/useRoom'
import Avatar from '../components/Avatar.jsx'
import HighlightTitle from '../components/HighlightTitle.jsx'
import '../App.css'

const CANDIDATE_IDS = gameRegistry.map((game) => game.id)

function RoomLobby() {
  const { roomCode = '' } = useParams()
  const navigate = useNavigate()
  const { t } = useLanguage()
  const { room, loading, setRoom } = useRoom(roomCode)
  const [copied, setCopied] = useState(null)
  const me = roomService.getCurrentPlayer()
  const isHost = me?.isHost ?? false

  // Everyone follows the room's phase, not just the host who triggered it —
  // otherwise guests sit in the lobby while the vote runs without them.
  useEffect(() => {
    if (!room) return
    if (room.status === 'GAME_SELECTION') {
      navigate(`/room/${room.code}/games`)
    } else if (room.status === 'PLAYING' && room.selectedGameId) {
      navigate(`/room/${room.code}/game/${room.selectedGameId}`)
    }
  }, [room, navigate])

  async function copy(value, kind) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(kind)
      window.setTimeout(() => setCopied(null), 1500)
    } catch {
      setCopied(null)
    }
  }

  async function handleLeave() {
    await roomService.leaveRoom()
    navigate('/')
  }

  async function handleChooseGame() {
    const next = await roomService.beginGameSelection(CANDIDATE_IDS)
    setRoom(next)
    navigate(`/room/${next.code}/games`)
  }

  if (loading) {
    return (
      <div className="page"><div className="page-content">
        <div className="brand">{t('lobby.brand')}</div>
        <p className="subtitle">{t('lobby.connecting')}</p>
      </div></div>
    )
  }

  if (!room) {
    return (
      <div className="page"><div className="page-content">
        <div className="brand">{t('lobby.brand')}</div>
        <h1 className="title title-sm">{t('lobby.roomNotFoundTitle')}</h1>
        <p className="subtitle">{t('lobby.roomNotFoundSubtitle')}</p>
        <button className="btn btn-primary" onClick={() => navigate('/room/join')}>{t('nav.joinRoom')}</button>
      </div></div>
    )
  }

  const canonicalCode = room.code
  const roomUrl = `${window.location.origin}/room/${canonicalCode}`
  const selectedGame = room.selectedGameId ? findGame(room.selectedGameId) : null

  return (
    <div className="page">
      <div className="page-content">
        <div className="brand">{t('lobby.brand')}</div>
        <HighlightTitle className="title title-sm" prefix={`${room.roomName} `} highlight={`#${canonicalCode}`} animate={false} />
        <p className="subtitle">{t('lobby.waiting')}</p>
        <div className="connection-status connected" role="status">
          <span className="status-dot" />
          {isMockMode ? t('lobby.mockStatus') : t('lobby.liveStatus')}
        </div>

        <div className="card" style={{ marginTop: 20 }}>
          <div className="field">
            <label>{t('lobby.roomCodeLabel')}</label>
            <div className="code-display">
              <span className="code">{canonicalCode}</span>
              <button type="button" className="copy-btn" onClick={() => copy(canonicalCode, 'code')}>
                {copied === 'code' ? t('createRoom.copied') : t('createRoom.copy')}
              </button>
            </div>
          </div>

          <div className="field">
            <label>{t('lobby.settingsLabel')}</label>
            <div className="settings-grid">
              <span className="settings-row">{t('lobby.maxParticipantsPrefix')}{room.players.length}/{room.maxParticipants}</span>
              <span className="settings-row">{t('lobby.questionTimePrefix')}{room.questionTimeSeconds} {t('createRoom.questionTimeUnit')}</span>
              <span className="settings-row">{t('lobby.votingTimePrefix')}{room.votingTimeSeconds} {t('createRoom.questionTimeUnit')}</span>
              {selectedGame && <span className="settings-row">{t('lobby.selectedGamePrefix')}{selectedGame.name}</span>}
            </div>
          </div>

          <div className="field">
            <label>{t('lobby.participantsLabel')}</label>
            <div className="participant-list">
              {room.players.map((player) => (
                <div className="participant" key={player.id}>
                  <span className="participant-name">
                    <Avatar name={player.displayName} color={player.color} size={24} />
                    {player.displayName}
                    {player.isHost ? ` ${t('lobby.hostSuffix')}` : ''}
                    {player.id === me?.id ? ` ${t('lobby.youSuffix')}` : ''}
                  </span>
                  <span className={`ready-state${player.isReady ? ' is-ready' : ''}`}>
                    {player.isReady ? t('lobby.ready') : t('lobby.notReady')}
                  </span>
                </div>
              ))}
            </div>
            <span className="helper-text">{t('lobby.participantsHelper')}</span>
          </div>

          <div className="invite-section">
            <h3>{t('lobby.inviteTitle')}</h3>
            <button type="button" className="btn btn-secondary" onClick={() => copy(roomUrl, 'link')}>
              {copied === 'link' ? t('lobby.linkCopied') : t('lobby.copyLink')}
            </button>
            <span className="helper-text">{t('lobby.inviteHint')}</span>
          </div>

          {isHost ? (
            <>
              <button className="btn btn-primary btn-block" type="button" onClick={handleChooseGame}>
                {t('lobby.chooseGame')}
              </button>
              <span className="helper-text" style={{ textAlign: 'center' }}>{t('lobby.startHelperHost')}</span>
            </>
          ) : (
            <span className="helper-text" style={{ textAlign: 'center' }}>{t('lobby.waitingForHost')}</span>
          )}

          <button className="btn btn-secondary btn-block" type="button" onClick={handleLeave}>{t('lobby.leave')}</button>
        </div>
      </div>
    </div>
  )
}

export default RoomLobby
