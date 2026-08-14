import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext.jsx'
import { findGame } from '../games/gameRegistry'
import { gameLauncher } from '../games/gameLauncherInstance'
import { roomService } from '../services/roomServiceInstance'
import { useRoom } from '../hooks/useRoom'
import { loadPlatformSession } from '../session/platformSession'
import { prepareRoomQuestions } from '../services/QuestionBotService'
import { getRoomQuestionDraft } from '../services/RoomQuestionDraftStore'
import '../App.css'

function GameStarting() {
  const { roomCode = '', gameId = '' } = useParams()
  const navigate = useNavigate()
  const { t } = useLanguage()
  const launchedGameRef = useRef('')
  const [error, setError] = useState('')
  const [preparedGame, setPreparedGame] = useState('')
  const preparationStartedRef = useRef('')
  const activeGameRef = useRef('')
  const { room, loading } = useRoom(roomCode)
  const player = roomService.getCurrentPlayer()
  const platformSession = loadPlatformSession(window.sessionStorage)
  const game = findGame(gameId)

  const isPlayable = game?.status === 'available'
  const isHost = Boolean(player?.isHost)
  const activeGame = room?.currentGameSession?.gameSessionId && room.currentGameSession.gameId === game?.id
    ? `${room.code}:${game.id}:${room.currentGameSession.gameSessionId}`
    : ''
  activeGameRef.current = activeGame

  useEffect(() => {
    if (!activeGame || !isPlayable || !room || !game || !player || !platformSession?.reconnectToken) return
    if (!isHost) {
      setPreparedGame(activeGame)
      return
    }
    if (preparationStartedRef.current === activeGame) return
    preparationStartedRef.current = activeGame
    const draft = getRoomQuestionDraft(room.code)
    void prepareRoomQuestions({
      roomCode: room.code,
      gameId: game.id,
      style: draft?.style ?? 'dengeli',
      contextPrompt: draft?.contextPrompt,
      reportText: draft?.reportText,
      reportFile: draft?.reportFile,
      playerId: player.id,
      reconnectToken: platformSession.reconnectToken,
    }).catch((cause) => {
      if (import.meta.env.DEV) console.warn('[AIQuestion] preparation failed; continuing with authoritative defaults', cause)
    }).finally(() => {
      if (activeGameRef.current === activeGame) setPreparedGame(activeGame)
    })
  }, [activeGame, isHost, isPlayable, room, game, player, platformSession])

  useEffect(() => {
    // A placeholder game can win the vote — say so plainly instead of
    // reporting a launch failure.
    if (!activeGame || preparedGame !== activeGame || launchedGameRef.current === activeGame
      || !room || !player || !game || !isPlayable || !platformSession?.reconnectToken || !room.currentGameSession) return
    launchedGameRef.current = activeGame
    try {
      gameLauncher.launchGame({
        roomCode: room.code,
        playerId: player.id,
        displayName: player.displayName,
        gameId: game.id,
        isHost: player.isHost,
        gameSessionId: room.currentGameSession.gameSessionId,
        reconnectToken: platformSession.reconnectToken,
      })
    } catch {
      setError(t('starting.launchError'))
    }
  }, [activeGame, preparedGame, room, player, game, isPlayable, platformSession, t])

  if (loading) {
    return (
      <div className="page"><div className="page-content">
        <div className="brand">{t('starting.brand')}</div>
        <p className="subtitle">{t('lobby.connecting')}</p>
      </div></div>
    )
  }

  if (!room || !player || !game) {
    return (
      <div className="page"><div className="page-content">
        <div className="brand">{t('starting.brand')}</div>
        <h1 className="title title-sm">{t('starting.invalidSession')}</h1>
        <button className="btn btn-primary" onClick={() => navigate(`/room/${roomCode}/games`)}>{t('starting.backToGames')}</button>
      </div></div>
    )
  }

  return (
    <div className="page"><div className="page-content">
      <div className="brand">{t('starting.brand')}</div>
      <h1 className="title title-sm">{t('starting.titlePrefix')}<span>{game.name}</span></h1>
      <p className="subtitle">{isPlayable ? error || t('starting.launching') : t('starting.subtitle')}</p>
      <div className="card" style={{ alignItems: 'center', textAlign: 'center' }}>
        <div className="selected-game-icon">{game.visualLabel}</div>
        <h2 className="selected-game-name">{game.name}</h2>
        {!isPlayable && <p className="coming-soon-note">{t('starting.comingSoon')}</p>}
        {(error || !isPlayable) && (
          <button className="btn btn-secondary btn-block" onClick={() => navigate(`/room/${room.code}/games`)}>
            {t('starting.backToGames')}
          </button>
        )}
      </div>
    </div></div>
  )
}

export default GameStarting
