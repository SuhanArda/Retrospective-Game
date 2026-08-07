import { useLanguage } from '../context/LanguageContext.jsx'

function ConnectionStatus({ status }) {
  const { t } = useLanguage()
  const label = status === 'connected' ? t('lobby.connected') : t('lobby.connecting')

  return (
    <div className={`connection-status ${status}`}>
      <span className="status-dot" />
      {label}
    </div>
  )
}

export default ConnectionStatus
