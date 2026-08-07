import { useEffect, useRef, useState } from 'react'

const TYPE_SPEED = 55
const ERASE_SPEED = 32
const PAUSE_AFTER_TYPO = 650
const PAUSE_BEFORE_TYPE = 220

function commonPrefixLength(a, b) {
  let i = 0
  const max = Math.min(a.length, b.length)
  while (i < max && a[i] === b[i]) i++
  return i
}

/**
 * Renders `targetText` normally on first mount. On every later change (e.g. a
 * language switch), it erases whatever is currently shown and types the new
 * text back in, like someone retyping the sentence. Pass `enabled: false` to
 * skip the animation entirely and just swap the text instantly — use this on
 * most strings; the typing effect is a showcase touch for one or two spots.
 *
 * Pass `typo: { wrong }` to have it type a deliberately wrong version first,
 * pause, backspace the part that differs, and type the correct ending —
 * a small "oops, let me fix that" flourish. Only use this on a couple of
 * showcase strings, not everywhere.
 */
export function useTypewriter(targetText, { typo, enabled = true } = {}) {
  const [display, setDisplay] = useState(targetText)
  const runId = useRef(0)
  const displayRef = useRef(targetText)
  // Tracks the target text as of the last time this effect actually ran, so
  // we can tell a real change from React re-invoking the effect for other
  // reasons (e.g. React/StrictMode replaying it) without touching `display`.
  const prevTargetRef = useRef(targetText)

  useEffect(() => {
    displayRef.current = display
  }, [display])

  useEffect(() => {
    const prevTarget = prevTargetRef.current
    prevTargetRef.current = targetText

    if (!enabled || prevTarget === targetText) {
      setDisplay(targetText)
      displayRef.current = targetText
      return
    }

    const myRun = ++runId.current
    const timers = []
    let t = 0

    function schedule(fn, delay) {
      timers.push(
        setTimeout(() => {
          if (myRun === runId.current) fn()
        }, delay),
      )
    }

    const startText = displayRef.current

    for (let i = startText.length - 1; i >= 0; i--) {
      schedule(() => setDisplay(startText.slice(0, i)), t)
      t += ERASE_SPEED
    }
    t += PAUSE_BEFORE_TYPE

    if (typo?.wrong) {
      const wrong = typo.wrong
      for (let i = 1; i <= wrong.length; i++) {
        schedule(() => setDisplay(wrong.slice(0, i)), t)
        t += TYPE_SPEED
      }
      t += PAUSE_AFTER_TYPO

      const keep = commonPrefixLength(wrong, targetText)
      for (let i = wrong.length - 1; i >= keep; i--) {
        schedule(() => setDisplay(wrong.slice(0, i)), t)
        t += ERASE_SPEED
      }
      t += PAUSE_BEFORE_TYPE

      for (let i = keep + 1; i <= targetText.length; i++) {
        schedule(() => setDisplay(targetText.slice(0, i)), t)
        t += TYPE_SPEED
      }
    } else {
      for (let i = 1; i <= targetText.length; i++) {
        schedule(() => setDisplay(targetText.slice(0, i)), t)
        t += TYPE_SPEED
      }
    }

    return () => timers.forEach(clearTimeout)
    // `typo` is intentionally excluded: it's a fresh object every render, and
    // re-running this effect should only happen when the target text or the
    // enabled flag changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetText, enabled])

  return display
}
