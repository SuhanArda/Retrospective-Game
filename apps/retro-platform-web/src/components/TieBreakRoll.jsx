import { useEffect, useState } from 'react'
import { useLanguage } from '../context/LanguageContext.jsx'

const CYCLE_MS = 110
const ROLL_MS = 2200

/**
 * Shown when a vote ends in a draw: cycles through the tied games like a dice
 * roll, then settles on the winner the room already agreed on. The winner is
 * decided by the room service, not here — this only makes the randomness
 * visible so nobody thinks the host quietly chose.
 */
function TieBreakRoll({ candidates, winner, onDone }) {
  const { t } = useLanguage()
  const [index, setIndex] = useState(0)
  const [settled, setSettled] = useState(false)

  useEffect(() => {
    const cycle = setInterval(() => setIndex((i) => (i + 1) % candidates.length), CYCLE_MS)
    const stop = setTimeout(() => {
      clearInterval(cycle)
      setSettled(true)
    }, ROLL_MS)
    return () => {
      clearInterval(cycle)
      clearTimeout(stop)
    }
  }, [candidates.length])

  useEffect(() => {
    if (!settled) return
    const done = setTimeout(onDone, 1400)
    return () => clearTimeout(done)
  }, [settled, onDone])

  const shown = settled ? winner : candidates[index]

  return (
    <div className="tie-overlay" role="status" aria-live="polite">
      <div className="tie-card">
        <div className={`tie-dice${settled ? ' settled' : ''}`} aria-hidden="true">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="4" />
            <circle cx="8.5" cy="8.5" r="1.4" fill="currentColor" stroke="none" />
            <circle cx="15.5" cy="15.5" r="1.4" fill="currentColor" stroke="none" />
            <circle cx="15.5" cy="8.5" r="1.4" fill="currentColor" stroke="none" />
            <circle cx="8.5" cy="15.5" r="1.4" fill="currentColor" stroke="none" />
            <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
          </svg>
        </div>

        <h2 className="tie-title">{t('vote.tieTitle')}</h2>
        <p className="tie-explain">{t('vote.tieExplain')}</p>

        <div className={`tie-slot${settled ? ' settled' : ''}`}>
          {settled && <span className="tie-winner-label">{t('vote.tieWinner')}</span>}
          <span className="tie-name">{shown}</span>
        </div>

        {!settled && <p className="tie-rolling">{t('vote.tieRolling')}</p>}
      </div>
    </div>
  )
}

export default TieBreakRoll
