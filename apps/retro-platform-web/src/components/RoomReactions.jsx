import { useCallback, useEffect, useRef, useState } from 'react'
import { REACTION_EMOJI } from '../domain/reactions'
import { roomService } from '../services/roomServiceInstance'
import { useLanguage } from '../context/LanguageContext.jsx'

const FLIGHT_MS = 2600

/**
 * Ceiling on how many emoji can be in the air at once. The server caps each
 * player at five a second, but a full room of people all holding a button is
 * still enough to fill the DOM faster than the timers empty it.
 */
const MAX_ON_SCREEN = 80

/**
 * The emoji strip and the emoji it throws up the screen.
 *
 * Nothing here decides anything: reactions arrive from the room service and are
 * drawn, including this player's own — the server sends them back the same way
 * it sends everyone else's, so there is no local echo to keep in step.
 *
 * Each flight is removed by its own timer rather than by an animation event,
 * so a reduced-motion visitor (whose animations are cut to nothing globally)
 * still gets a DOM that empties itself.
 */
function RoomReactions({ roomCode }) {
  const { t } = useLanguage()
  const [flying, setFlying] = useState([])
  const nextId = useRef(0)

  useEffect(() => {
    if (!roomCode) return undefined
    const timers = new Set()

    const stop = roomService.subscribeToReactions(roomCode, (reaction) => {
      const id = nextId.current
      nextId.current += 1

      const item = {
        id,
        emoji: reaction.emoji,
        displayName: reaction.displayName,
        color: reaction.color,
        // Kept off the very edges so a long name is not clipped by the viewport.
        left: 8 + Math.random() * 84,
        drift: Math.round((Math.random() - 0.5) * 90),
        duration: FLIGHT_MS + Math.round(Math.random() * 900),
      }

      setFlying((current) => [...current, item].slice(-MAX_ON_SCREEN))

      const timer = window.setTimeout(() => {
        timers.delete(timer)
        setFlying((current) => current.filter((flight) => flight.id !== id))
      }, item.duration)
      timers.add(timer)
    })

    return () => {
      stop()
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [roomCode])

  const send = useCallback((emoji) => {
    void roomService.sendReaction(emoji)
  }, [])

  return (
    <>
      {/* Decorative: announcing every emoji would make a screen reader unusable
          the moment anyone started spamming, which is the expected use. */}
      <div className="reaction-sky" aria-hidden="true">
        {flying.map((flight) => (
          <span
            key={flight.id}
            className="reaction-float"
            style={{
              left: `${flight.left}%`,
              animationDuration: `${flight.duration}ms`,
              '--reaction-drift': `${flight.drift}px`,
              '--reaction-color': flight.color,
            }}
          >
            <span className="reaction-float-emoji">{flight.emoji}</span>
            <span className="reaction-float-name">{flight.displayName}</span>
          </span>
        ))}
      </div>

      <div className="reaction-bar">
        <span className="reaction-bar-label">{t('reactions.label')}</span>
        <div className="reaction-buttons">
          {REACTION_EMOJI.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="reaction-button"
              onClick={() => send(emoji)}
              aria-label={`${t('reactions.send')} ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

export default RoomReactions
