import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext.jsx'
import HighlightTitle from '../components/HighlightTitle.jsx'
import '../App.css'

function NotFound() {
  const navigate = useNavigate()
  const { t } = useLanguage()

  return (
    <div className="page">
      <div className="page-content">
        <div className="brand">{t('notFound.brand')}</div>
        <HighlightTitle
          className="title title-sm"
          prefix={t('notFound.titlePrefix')}
          highlight={t('notFound.titleHighlight')}
          animate={false}
        />
        <p className="subtitle">{t('notFound.subtitle')}</p>
        <div className="button-row">
          <button className="btn btn-primary" onClick={() => navigate('/')}>
            {t('notFound.button')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default NotFound
