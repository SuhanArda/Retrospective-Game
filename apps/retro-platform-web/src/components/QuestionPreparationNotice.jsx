import { useSyncExternalStore } from 'react'
import { useLanguage } from '../context/LanguageContext.jsx'
import { getQuestionPreparationState, subscribeQuestionPreparation } from '../services/QuestionPreparationState'

export default function QuestionPreparationNotice({ roomCode }) {
  const { t } = useLanguage()
  const preparation = useSyncExternalStore(subscribeQuestionPreparation, getQuestionPreparationState)
  if (preparation.roomCode !== roomCode || preparation.status === 'idle') return null
  return <p className="helper-text" role="status" aria-live="polite">{t(`questionPreparation.${preparation.status}`)}</p>
}
