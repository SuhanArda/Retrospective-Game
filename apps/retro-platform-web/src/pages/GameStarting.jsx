import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext.jsx'
import { findGame } from '../games/gameRegistry'
import { gameLauncher } from '../games/gameLauncherInstance'
import { roomService } from '../services/roomServiceInstance'
import '../App.css'

function GameStarting() {
  const { roomCode = '', gameId = '' } = useParams()
  const navigate = useNavigate()
  const { t } = useLanguage()
  const launchedRef = useRef(false)
  const [error, setError] = useState('')
  const room = roomService.getRoom(roomCode)
  const player = roomService.getCurrentPlayer()
  const game = findGame(gameId)

  const isPlayable = game?.status === 'available'

  useEffect(() => {
    // A placeholder game can win the vote — say so plainly instead of
    // reporting a launch failure.
    if (launchedRef.current || !room || !player || !game || !isPlayable) return
    launchedRef.current = true
    try {
      gameLauncher.launchGame({
        roomCode: room.code,
        playerId: player.id,
        displayName: player.displayName,
        gameId: game.id,
        isHost: player.isHost,
      })
    } catch {
      setError(t('starting.launchError'))
    }
  }, [room, player, game, isPlayable, t])

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
