import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext.jsx'
import { isMockMode, roomService } from '../services/roomServiceInstance'
import { findGame, gameRegistry } from '../games/gameRegistry'
import { useRoom } from '../hooks/useRoom'
import { deleteRoomQuestionDraft } from '../services/RoomQuestionDraftStore'
import { readRoomQuestionStatus } from '../services/QuestionBotService'
import { loadPlatformSession } from '../session/platformSession'
import { buildRoomInviteUrl, roomJoinPath } from '../utils/roomInvite'
import Avatar from '../components/Avatar.jsx'
import HighlightTitle from '../components/HighlightTitle.jsx'
import RoomReactions from '../components/RoomReactions.jsx'
import '../App.css'

const CANDIDATE_IDS = gameRegistry.filter((game) => game.status === 'available').map((game) => game.id)
const QUESTION_STATUS_POLL_MS = 3000
// Enough to cover a sleeping question service waking up and generating; after
// that the badge simply stays hidden instead of polling a dead endpoint.
const QUESTION_STATUS_ATTEMPTS = 40

function RoomLobby() {
  const { roomCode = '' } = useParams()
  const navigate = useNavigate()
  const { t } = useLanguage()
  const { room, loading, setRoom } = useRoom(roomCode)
  const [copied, setCopied] = useState(null)
  const [questionStatus, setQuestionStatus] = useState(null)
  const me = roomService.getCurrentPlayer()
  const isHost = me?.isHost ?? false
  const connectionStatus = roomService.getConnectionStatus()

  useEffect(() => {
    if (!loading && !roomService.getCurrentPlayer()) {
      navigate(roomJoinPath(roomCode), { replace: true })
    }
  }, [loading, room, roomCode, navigate])

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

  // Question generation runs in the background after the room is created, so the
  // lobby is where everyone finds out whether the room got AI questions from the
  // moderator's prompt or the built-in set.
  useEffect(() => {
    if (isMockMode || !roomCode) return undefined
    const session = loadPlatformSession(window.sessionStorage)
    if (!session?.reconnectToken) return undefined

    let cancelled = false
    let timer = null
    let attempt = 0

    async function poll() {
      try {
        const status = await readRoomQuestionStatus(roomCode, session.playerId, session.reconnectToken)
        if (cancelled) return
        setQuestionStatus(status)
        if (status !== 'preparing') return
      } catch {
        if (cancelled) return
      }
      attempt += 1
      if (attempt < QUESTION_STATUS_ATTEMPTS) timer = window.setTimeout(poll, QUESTION_STATUS_POLL_MS)
    }

    poll()
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [roomCode])

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
    deleteRoomQuestionDraft(roomCode)
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
  const roomUrl = buildRoomInviteUrl(window.location.origin, canonicalCode)
  const selectedGame = room.selectedGameId ? findGame(room.selectedGameId) : null

  return (
    <div className="page">
      <div className="page-content">
        <div className="brand">{t('lobby.brand')}</div>
        <HighlightTitle className="title title-sm" prefix={`${room.roomName} `} highlight={`#${canonicalCode}`} animate={false} />
        <p className="subtitle">{t('lobby.waiting')}</p>
        <div className={`connection-status ${connectionStatus}`} role="status">
          <span className="status-dot" />
          {isMockMode
            ? t('lobby.mockStatus')
            : connectionStatus === 'connected'
              ? t('lobby.liveStatus')
              : connectionStatus === 'disconnected'
                ? t('lobby.disconnectedStatus')
                : t('lobby.reconnectingStatus')}
        </div>
        {questionStatus && (
          <div className={`connection-status question-status ${questionStatus}`} role="status">
            <span className="status-dot" />
            {questionStatus === 'preparing'
              ? t('lobby.questionsPreparing')
              : questionStatus === 'ai'
                ? t('lobby.questionsReady')
                : t('lobby.questionsFallback')}
          </div>
        )}

        <div className="card lobby-card" style={{ marginTop: 20 }}>
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
                <div className="participant" style={{ borderLeft: `4px solid ${player.color}` }} key={player.id}>
                  <span className="participant-name">
                    <Avatar name={player.displayName} color={player.color} avatarId={player.avatarId} size={24} />
                    {player.displayName}
                    {player.id === me?.id ? ` ${t('lobby.youSuffix')}` : ''}
                    {player.isHost && <span className="host-badge">{t('lobby.hostSuffix')}</span>}
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

        <RoomReactions roomCode={canonicalCode} />
      </div>
    </div>
  )
}

export default RoomLobby
