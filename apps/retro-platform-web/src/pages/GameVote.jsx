import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext.jsx'
import { gameRegistry } from '../games/gameRegistry'
import { roomService } from '../services/roomServiceInstance'
import HighlightTitle from '../components/HighlightTitle.jsx'
import '../App.css'

function GameVote() {
  const { roomCode = '' } = useParams()
  const navigate = useNavigate()
  const { t } = useLanguage()
  const [room, setRoom] = useState(() => roomService.getRoom(roomCode))
  const [selectingGameId, setSelectingGameId] = useState(null)
  const me = roomService.getCurrentPlayer()
  const isHost = me?.isHost ?? false

  useEffect(() => roomService.subscribe(roomCode, setRoom), [roomCode])

  useEffect(() => {
    if (!room) return
    if (room.status === 'LOBBY') navigate(`/room/${room.code}`, { replace: true })
    if (!isHost && room.status === 'PLAYING' && room.selectedGameId) {
      navigate(`/room/${room.code}/game/${room.selectedGameId}`, { replace: true })
    }
  }, [room, isHost, navigate])

  async function handleSelect(gameId) {
    if (!isHost) return
    setSelectingGameId(gameId)
    const next = await roomService.selectGame(gameId)
    setRoom(next)
    navigate(`/room/${next.code}/game/${gameId}`)
  }

  if (!room) {
    return (
      <div className="page"><div className="page-content">
        <h1 className="title title-sm">{t('lobby.roomNotFoundTitle')}</h1>
        <button className="btn btn-primary" onClick={() => navigate('/room/join')}>{t('nav.joinRoom')}</button>
      </div></div>
    )
  }

  return (
    <div className="page">
      <div className="page-content page-content-wide">
        <div className="brand">{t('vote.brand')}</div>
        <HighlightTitle className="title title-sm" prefix={t('vote.titlePrefix')} highlight={t('vote.titleHighlight')} animate={false} />
        <p className="subtitle">{isHost ? t('vote.selectionSubtitle') : t('vote.waitingForHost')}</p>

        <div className="game-grid">
          {gameRegistry.map((game) => {
            const disabled = !isHost || game.status !== 'available' || selectingGameId !== null
            return (
              <article className="game-card" key={game.id}>
                <span className="game-card-icon" aria-hidden="true">{game.visualLabel}</span>
                <span className="game-card-name">{game.name}</span>
                <span className="game-card-text">{game.description}</span>
                <span className="game-card-votes">{game.playerCount}</span>
                <button className="btn btn-primary btn-block" type="button" disabled={disabled} onClick={() => handleSelect(game.id)}>
                  {selectingGameId === game.id ? t('vote.launching') : t('vote.play')}
                </button>
              </article>
            )
          })}
        </div>

        <div className="button-row vote-actions">
          <button className="btn btn-secondary" type="button" onClick={() => navigate(`/room/${room.code}`)}>{t('vote.cancel')}</button>
        </div>
      </div>
    </div>
  )
}

export default GameVote
