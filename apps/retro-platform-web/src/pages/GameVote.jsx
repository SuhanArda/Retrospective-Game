import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext.jsx'
import { gameRegistry, findGame } from '../games/gameRegistry'
import { roomService } from '../services/roomServiceInstance'
import { tallyVotes } from '../domain/voting'
import HighlightTitle from '../components/HighlightTitle.jsx'
import TieBreakRoll from '../components/TieBreakRoll.jsx'
import '../App.css'

const CANDIDATE_IDS = gameRegistry.map((game) => game.id)

function GameVote() {
  const { roomCode = '' } = useParams()
  const navigate = useNavigate()
  const { t } = useLanguage()
  const [room, setRoom] = useState(() => roomService.getRoom(roomCode))
  const [now, setNow] = useState(() => Date.now())
  const [rollDone, setRollDone] = useState(false)
  const me = roomService.getCurrentPlayer()
  const myId = me?.id ?? null
  const isHost = me?.isHost ?? false

  useEffect(() => roomService.subscribe(roomCode, setRoom), [roomCode])

  const resolved = room?.status === 'PLAYING' && Boolean(room.selectedGameId)
  const tieBreak = resolved ? room.tieBreak : undefined

  // Stop ticking once the vote is over: the re-renders are pointless then, and
  // they would restart the tie-break animation's timers on every tick.
  useEffect(() => {
    if (resolved) return
    const tick = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(tick)
  }, [resolved])

  const secondsLeft = room?.votingEndsAt
    ? Math.max(0, Math.ceil((room.votingEndsAt - now) / 1000))
    : 0

  // Stable identity so the animation's completion timer is never reset.
  const handleRollDone = useCallback(() => setRollDone(true), [])

  // The host closes the vote for everyone — the same job the server will take
  // over later. Guests just wait for the resulting snapshot.
  useEffect(() => {
    if (!isHost || room?.status !== 'GAME_SELECTION' || !room.votingEndsAt) return
    if (secondsLeft > 0) return
    void roomService.resolveVote(CANDIDATE_IDS).then(setRoom)
  }, [isHost, room, secondsLeft])

  useEffect(() => {
    if (room?.status === 'LOBBY') navigate(`/room/${room.code}`, { replace: true })
  }, [room, navigate])

  const goToGame = useCallback(() => {
    if (room?.selectedGameId) navigate(`/room/${room.code}/game/${room.selectedGameId}`)
  }, [room, navigate])

  // Straight to the game unless a draw needs to be shown being rolled out.
  useEffect(() => {
    if (!resolved) return
    if (tieBreak && !rollDone) return
    goToGame()
  }, [resolved, tieBreak, rollDone, goToGame])

  const tally = useMemo(() => tallyVotes(room?.votes), [room?.votes])

  if (!room) {
    return (
      <div className="page"><div className="page-content">
        <h1 className="title title-sm">{t('lobby.roomNotFoundTitle')}</h1>
        <button className="btn btn-primary" onClick={() => navigate('/room/join')}>{t('nav.joinRoom')}</button>
      </div></div>
    )
  }

  const myVote = myId ? room.votes?.[myId] : undefined
  const votedCount = Object.keys(room.votes ?? {}).length

  async function handleVote(gameId) {
    if (room.status !== 'GAME_SELECTION') return
    setRoom(await roomService.castVote(gameId))
  }

  async function handleFinishNow() {
    setRoom(await roomService.resolveVote(CANDIDATE_IDS))
  }

  return (
    <div className="page">
      <div className="page-content page-content-wide">
        <div className="brand">{t('vote.brand')}</div>
        <HighlightTitle
          className="title title-sm"
          prefix={t('vote.titlePrefix')}
          highlight={t('vote.titleHighlight')}
          animate={false}
        />
        <p className="subtitle">{t('vote.subtitle')}</p>

        <div className={`vote-timer${secondsLeft <= 5 ? ' urgent' : ''}`}>
          {secondsLeft}
          {t('vote.secondsSuffix')}
        </div>

        <div className="game-grid">
          {gameRegistry.map((game) => {
            const count = tally[game.id] ?? 0
            const picked = myVote === game.id
            return (
              <button
                type="button"
                key={game.id}
                className={`game-card${picked ? ' picked' : ''}`}
                onClick={() => handleVote(game.id)}
                aria-pressed={picked}
              >
                <span className="game-card-icon" aria-hidden="true">{game.visualLabel}</span>
                <span className="game-card-name">{game.name}</span>
                <span className="game-card-text">{game.description}</span>
                <span className="game-card-votes">
                  {count}
                  {t('vote.voteCountSuffix')}
                </span>
                {game.status !== 'available' && (
                  <span className="game-card-soon">{t('vote.comingSoon')}</span>
                )}
                {picked && <span className="game-card-badge">{t('vote.yourPick')}</span>}
              </button>
            )
          })}
        </div>

        <p className="helper-text vote-count-line">
          {votedCount}/{room.players.length} {t('vote.votedCount')}
        </p>
        <p className="helper-text">{t('vote.comingSoonNote')}</p>

        <div className="button-row vote-actions">
          {isHost && (
            <button className="btn btn-primary" type="button" onClick={handleFinishNow}>
              {t('vote.finishNow')}
            </button>
          )}
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => navigate(`/room/${room.code}`)}
          >
            {t('vote.cancel')}
          </button>
        </div>
      </div>

      {tieBreak && !rollDone && (
        <TieBreakRoll
          candidates={tieBreak.candidates.map((id) => findGame(id)?.name ?? id)}
          winner={findGame(tieBreak.winner)?.name ?? tieBreak.winner}
          onDone={handleRollDone}
        />
      )}
    </div>
  )
}

export default GameVote
