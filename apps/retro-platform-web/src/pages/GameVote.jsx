import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext.jsx'
import { gameRegistry, findGame } from '../games/gameRegistry'
import { isMockMode, roomService } from '../services/roomServiceInstance'
import { tallyVotes } from '../domain/voting'
import { gameSelectionSecondsRemaining } from '../domain/gameSelectionTimer'
import { useRoom } from '../hooks/useRoom'
import { roomJoinPath } from '../utils/roomInvite'
import HighlightTitle from '../components/HighlightTitle.jsx'
import RoomReactions from '../components/RoomReactions.jsx'
import TieBreakRoll from '../components/TieBreakRoll.jsx'
import '../App.css'

const CANDIDATE_IDS = gameRegistry.filter((game) => game.status === 'available').map((game) => game.id)

function GameVote() {
  const { roomCode = '' } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { t } = useLanguage()
  const { room, loading, setRoom } = useRoom(roomCode)
  const [now, setNow] = useState(() => Date.now())
  const [rollDone, setRollDone] = useState(false)
  const me = roomService.getCurrentPlayer()
  const myId = me?.id ?? null
  const isHost = me?.isHost ?? false
  const returningFromGame = searchParams.get('returnFromGame') === '1'
  const returnResetStarted = useRef(false)

  const resolved = !returningFromGame && room?.status === 'PLAYING' && Boolean(room.selectedGameId)
  const tieBreak = resolved ? room.tieBreak : undefined

  // Stop ticking once the vote is over: the re-renders are pointless then, and
  // they would restart the tie-break animation's timers on every tick.
  useEffect(() => {
    if (resolved) return
    setNow(Date.now())
    const tick = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(tick)
  }, [resolved, room?.votingEndsAt])

  const secondsLeft = gameSelectionSecondsRemaining(room?.votingEndsAt, now)

  // Stable identity so the animation's completion timer is never reset.
  const handleRollDone = useCallback(() => setRollDone(true), [])

  // Mock mode has no server maintenance loop, so its host preserves the
  // original behavior by closing the vote when the shared deadline expires.
  useEffect(() => {
    if (!isMockMode) return
    if (!isHost || room?.status !== 'GAME_SELECTION' || !room.votingEndsAt) return
    if (secondsLeft > 0) return
    void roomService.resolveVote(CANDIDATE_IDS).then(setRoom).catch(() => undefined)
  }, [isHost, room, secondsLeft, setRoom])

  useEffect(() => {
    if (room?.status === 'LOBBY') navigate(`/room/${room.code}`, { replace: true })
  }, [room, navigate])

  // A game return keeps the platform session intact. The host reopens the
  // existing room's selection using the normal room-service boundary; guests
  // wait on this page for that authoritative room update instead of relaunching.
  useEffect(() => {
    if (!returningFromGame || !room) return
    if (room.status === 'GAME_SELECTION') {
      navigate(`/room/${room.code}/games`, { replace: true })
      return
    }
    if (!isHost || room.status !== 'PLAYING' || returnResetStarted.current) return
    returnResetStarted.current = true
    void roomService.beginGameSelection(CANDIDATE_IDS).then((next) => {
      setRoom(next)
      navigate(`/room/${next.code}/games`, { replace: true })
    })
  }, [isHost, navigate, returningFromGame, room, setRoom])

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

  if (loading) {
    return (
      <div className="page"><div className="page-content">
        <div className="brand">{t('vote.brand')}</div>
        <p className="subtitle">{t('lobby.connecting')}</p>
      </div></div>
    )
  }

  if (!room) {
    return (
      <div className="page"><div className="page-content">
        <h1 className="title title-sm">{t('lobby.roomNotFoundTitle')}</h1>
        <button className="btn btn-primary" onClick={() => navigate(roomJoinPath(roomCode))}>{t('nav.joinRoom')}</button>
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

  // Cancelling is a change to the room, not a navigation. Putting the room back
  // in LOBBY is what returns everyone, through the same status effect that sent
  // them here; navigating alone would bounce straight back, because the lobby
  // redirects anyone who opens it while a vote is still running.
  async function handleReturnToLobby() {
    setRoom(await roomService.returnToLobby())
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

        {room.status === 'GAME_SELECTION' && room.votingEndsAt && (
          <div className={`vote-timer${secondsLeft <= 5 ? ' urgent' : ''}`} data-testid="game-selection-countdown">
            {secondsLeft}
            {t('vote.secondsSuffix')}
          </div>
        )}

        <div className="game-grid">
          {gameRegistry.map((game) => {
            const count = tally[game.id] ?? 0
            const picked = myVote === game.id
            const hasPhoto = Boolean(game.voteScreenshotUrl)
            const supportsRoomSize = room.players.length >= game.minPlayers &&
              (!game.maxPlayers || room.players.length <= game.maxPlayers)
            return (
              <button
                type="button"
                key={game.id}
                className={`game-card${picked ? ' picked' : ''}${hasPhoto ? ' has-photo' : ''}`}
                style={hasPhoto ? {
                  backgroundImage: `linear-gradient(to bottom, rgba(20,14,30,0.2) 0%, rgba(20,14,30,0.55) 55%, rgba(20,14,30,0.92) 100%), url(${game.voteScreenshotUrl})`,
                } : undefined}
                onClick={() => handleVote(game.id)}
                disabled={game.status !== 'available' || !supportsRoomSize}
                aria-pressed={picked}
              >
                {!hasPhoto && <span className="game-card-icon" aria-hidden="true">{game.visualLabel}</span>}
                <span className="game-card-name">{game.name}</span>
                <span className="game-card-text">{t(game.descriptionKey)}</span>
                <span className="game-card-votes">
                  {count}
                  {t('vote.voteCountSuffix')}
                </span>
                {game.status !== 'available' && (
                  <span className="game-card-soon">{t('vote.comingSoon')}</span>
                )}
                {game.status === 'available' && !supportsRoomSize && (
                  <span className="game-card-soon">
                    {game.minPlayers}{game.maxPlayers ? `–${game.maxPlayers}` : '+'} {t('gamesPage.playersSuffix')}
                  </span>
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

        {/* Both actions change the room for everyone, and the server only lets
            the host do that, so guests are not shown buttons that would fail. */}
        {isHost && (
          <div className="button-row vote-actions">
            <button className="btn btn-primary" type="button" onClick={handleFinishNow}>
              {t('vote.finishNow')}
            </button>
            <button className="btn btn-secondary" type="button" onClick={handleReturnToLobby}>
              {t('vote.cancel')}
            </button>
          </div>
        )}

        <RoomReactions roomCode={room.code} />
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
