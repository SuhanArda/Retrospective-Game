import { useTypewriter } from '../hooks/useTypewriter.js'

function HighlightTitle({ prefix, highlight, typo, animate = true, className = 'title', as: Tag = 'h1' }) {
  const target = prefix + highlight
  const display = useTypewriter(target, {
    typo: typo ? { wrong: typo } : undefined,
    enabled: animate,
  })
  const plainLen = Math.min(display.length, prefix.length)
  const plain = display.slice(0, plainLen)
  const rest = display.slice(plainLen)
  // Reserve space for two lines while animating so the page doesn't jump
  // vertically as the line count fluctuates mid-type.
  const finalClassName = animate ? `${className} title-typing` : className

  return (
    <Tag className={finalClassName}>
      {plain}
      {rest && <span>{rest}</span>}
    </Tag>
  )
}

export default HighlightTitle
