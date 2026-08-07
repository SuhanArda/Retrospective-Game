import { useTypewriter } from '../hooks/useTypewriter.js'

function TypeText({ text, as: Tag = 'span', typo, className }) {
  const display = useTypewriter(text, { typo })
  return <Tag className={className}>{display}</Tag>
}

export default TypeText
