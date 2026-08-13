import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext.jsx'
import { findGame } from '../games/gameRegistry'
import { gameLauncher } from '../games/gameLauncherInstance'
import { roomService } from '../services/roomServiceInstance'
import { useRoom } from '../hooks/useRoom'
import { loadPlatformSession } from '../session/platformSession'
import { prepareRoomQuestions, roomQuestionsAreReady } from '../services/QuestionBotService'
import { deleteRoomQuestionDraft, getRoomQuestionDraft } from '../services/RoomQuestionDraftStore'
import '../App.css'

function GameStarting() {
  const { roomCode = '', gameId = '' } = useParams()
  const navigate = useNavigate()
  const { t } = useLanguage()
  const launchedRef = useRef(false)
  const [error, setError] = useState('')
  const [questionsReady, setQuestionsReady] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const preparationStartedRef = useRef(false)
  const { room, loading } = useRoom(roomCode)
  const player = roomService.getCurrentPlayer()
  const platformSession = loadPlatformSession(window.sessionStorage)
  const game = findGame(gameId)

  const isPlayable = game?.status === 'available'
  const isHost = Boolean(player?.isHost)

  useEffect(() => {
    if (!room || !game || questionsReady) return
    let cancelled = false
    const check = async () => {
      try {
        if (await roomQuestionsAreReady(room.code, game.id) && !cancelled) setQuestionsReady(true)
      } catch {
        if (!cancelled && !isHost) setError('AI soru servisine ulaşılamıyor. Moderatörün servisi açması gerekiyor.')
      }
    }
    void check()
    const timer = window.setInterval(check, 1200)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [room, game, questionsReady, isHost])

  useEffect(() => {
    if (!isHost || !isPlayable || !room || !game || questionsReady || preparationStartedRef.current) return
    preparationStartedRef.current = true
    setPreparing(true)
    setError('')
    const draft = getRoomQuestionDraft(room.code)
    void prepareRoomQuestions({
      roomCode: room.code,
      gameId: game.id,
      style: draft?.style ?? 'dengeli',
      contextPrompt: draft?.contextPrompt,
      reportText: draft?.reportText,
    }).then(() => {
      deleteRoomQuestionDraft(room.code)
      setQuestionsReady(true)
    }).catch(() => {
      preparationStartedRef.current = false
      setError('Sorular hazırlanamadı. AI soru servisinin çalıştığını kontrol edin.')
    }).finally(() => setPreparing(false))
  }, [isHost, isPlayable, room, game, questionsReady])

  useEffect(() => {
    // A placeholder game can win the vote — say so plainly instead of
    // reporting a launch failure.
    if (launchedRef.current || !questionsReady || !room || !player || !game || !isPlayable || !platformSession?.reconnectToken || !room.currentGameSession) return
    launchedRef.current = true
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
  }, [room, player, game, isPlayable, platformSession, questionsReady, t])

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
        {isPlayable && !questionsReady && isHost && <div className="ai-waiting"><span className="spinner" /><h3>{preparing ? 'Sorular hazırlanıyor...' : 'Soru servisine bağlanılıyor...'}</h3><p>Hazır olduğunda oyun otomatik başlayacak.</p>{error && <p className="error-text">{error}</p>}</div>}
        {isPlayable && !questionsReady && !isHost && <div className="ai-waiting"><span className="spinner" /><h3>Moderatör soruları hazırlıyor...</h3><p>Hazır olduğunda oyun otomatik başlayacak.</p>{error && <p className="error-text">{error}</p>}</div>}
        {questionsReady && <p className="ai-ready-note">✓ Sorular hazır · Oyun başlatılıyor</p>}
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
