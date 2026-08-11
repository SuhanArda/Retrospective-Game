import { useCallback, useEffect, useRef, useState } from 'react'
import { useLanguage } from '../context/LanguageContext.jsx'

/** How long the click-triggered coding scene runs, start to finish. */
const WORK_MS = 5600

/**
 * Idle behaviours. Picked at random, never the same one twice running — a loop
 * you can predict stops reading as alive after the second cycle.
 */
const IDLE_ACTS = ['wave', 'yawn', 'look', 'hop']

const IDLE_GAP_MIN_MS = 3200
const IDLE_GAP_SPREAD_MS = 3300

/**
 * The little robot filling the gap between the drawer's links and its
 * language/theme row.
 *
 * Drawn inline rather than loaded as an image: the page's CSP does not allow
 * fetching one, and inline shapes take their colours from CSS variables, so it
 * follows the light/dark theme instead of being a fixed-colour cut-out.
 *
 * Two layers of life. Underneath, always running: a slow drift with the shadow
 * tightening in step, random blinks, a pulsing antenna. On top, one of four
 * short acts every few seconds. Clicking starts the coding scene instead — it
 * is on click rather than on a loop because this drawer is usually open for
 * about two seconds, and a six-second set piece nobody asked for would mostly
 * go unseen.
 *
 * Acts restart by changing `key`, which gives the element a new identity. That
 * is what replays a CSS animation that has already finished.
 */
function DrawerMascot() {
  const { t } = useLanguage()
  const [blinking, setBlinking] = useState(false)
  const [working, setWorking] = useState(false)
  // Starts on a wave, so opening the drawer is a greeting.
  const [act, setAct] = useState({ name: 'wave', key: 0 })
  const actRef = useRef(act)
  actRef.current = act

  // One timer bag for every scheduled thing, emptied on unmount. The drawer
  // unmounts whenever it closes, so this runs often.
  const timers = useRef(new Set())
  const later = useCallback((run, ms) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id)
      run()
    }, ms)
    timers.current.add(id)
    return id
  }, [])

  useEffect(() => {
    const bag = timers.current
    return () => bag.forEach((id) => window.clearTimeout(id))
  }, [])

  // Blinks land at uneven intervals on purpose: on a fixed timer the robot
  // reads as a machine ticking rather than something alive.
  useEffect(() => {
    const schedule = () => {
      later(() => {
        setBlinking(true)
        later(() => {
          setBlinking(false)
          schedule()
        }, 150)
      }, 2200 + Math.random() * 3800)
    }
    schedule()
  }, [later])

  useEffect(() => {
    const schedule = () => {
      later(() => {
        setAct((current) => {
          // Never repeat: pick from the others, then step past the current one.
          const others = IDLE_ACTS.filter((name) => name !== current.name)
          const next = others[Math.floor(Math.random() * others.length)]
          return { name: next, key: current.key + 1 }
        })
        schedule()
      }, IDLE_GAP_MIN_MS + Math.random() * IDLE_GAP_SPREAD_MS)
    }
    schedule()
  }, [later])

  const startWorking = () => {
    if (working) return
    setWorking(true)
    later(() => {
      setWorking(false)
      // Comes back pleased with itself.
      setAct({ name: 'hop', key: actRef.current.key + 1 })
    }, WORK_MS)
  }

  const mode = working ? 'working' : `act-${act.name}`

  return (
    <div className="drawer-mascot" onClick={startWorking}>
      <svg
        key={working ? 'working' : act.key}
        className={`drawer-mascot-art ${mode}`}
        viewBox="0 0 120 140"
        fill="none"
        aria-hidden="true"
      >
        <ellipse cx="60" cy="131" rx="24" ry="4.5" className="mascot-shadow" />

        <g className="mascot-body">
          <g className="mascot-hop">
            <g className="mascot-head">
              <path d="M60 30 V19" className="mascot-antenna" />
              <circle cx="60" cy="14" r="4.5" className="mascot-bulb" />

              <rect x="29" y="29" width="62" height="50" rx="23" className="mascot-fill" />
              {/* Off-centre highlight — a flat orange block is what made the
                  first version look carved rather than moulded. */}
              <ellipse cx="45" cy="42" rx="13" ry="7" className="mascot-gloss" />

              <rect x="37" y="40" width="46" height="29" rx="14" className="mascot-face" />

              <g className={`mascot-eyes${blinking ? ' blinking' : ''}`}>
                <ellipse cx="50" cy="53" rx="4" ry="4.8" className="mascot-ink" />
                <ellipse cx="70" cy="53" rx="4" ry="4.8" className="mascot-ink" />
              </g>

              <circle cx="42" cy="62" r="3.2" className="mascot-cheek" />
              <circle cx="78" cy="62" r="3.2" className="mascot-cheek" />
              <path d="M54 62 Q60 67 66 62" className="mascot-smile" />
              <ellipse cx="60" cy="63" rx="5" ry="6" className="mascot-mouth" />
            </g>

            <rect x="36" y="83" width="48" height="35" rx="17" className="mascot-fill" />
            <ellipse cx="60" cy="99" rx="14" ry="10" className="mascot-face" />
            <ellipse cx="49" cy="121" rx="7" ry="4" className="mascot-fill" />
            <ellipse cx="71" cy="121" rx="7" ry="4" className="mascot-fill" />

            {working ? (
              <>
                <path d="M37 91 Q33 99 41 104" className="mascot-limb mascot-type-left" />
                <path d="M83 91 Q87 99 79 104" className="mascot-limb mascot-type-right" />
              </>
            ) : (
              <>
                <path d="M37 91 Q27 99 29 109" className="mascot-limb" />
                <g className="mascot-arm">
                  <path d="M83 91 Q95 80 93 66" className="mascot-limb" />
                  <circle cx="93" cy="61" r="7" className="mascot-fill" />
                </g>
              </>
            )}
          </g>

          {working && (
            <g className="mascot-laptop">
              <g className="mascot-lid">
                <rect x="35" y="74" width="50" height="34" rx="4" className="mascot-lid-shell" />
                <rect x="38" y="77" width="44" height="28" rx="2" className="mascot-screen" />

                <rect x="42" y="82" width="20" height="2.6" rx="1.3" className="mascot-code c1" />
                <rect x="42" y="87" width="30" height="2.6" rx="1.3" className="mascot-code c2" />
                <rect x="46" y="92" width="24" height="2.6" rx="1.3" className="mascot-code c3" />
                <rect x="46" y="97" width="14" height="2.6" rx="1.3" className="mascot-code c4" />

                <path d="M52 91 l5 6 l11 -13" className="mascot-check" />
              </g>
              <rect x="31" y="107" width="58" height="5" rx="2.5" className="mascot-lid-shell" />
            </g>
          )}
        </g>
      </svg>

      <span className="drawer-mascot-text">
        {working ? t('mascot.working') : t('mascot.greeting')}
      </span>
    </div>
  )
}

export default DrawerMascot
