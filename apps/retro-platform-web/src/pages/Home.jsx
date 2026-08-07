import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext.jsx'
import { heroTypo } from '../i18n/translations.js'
import HighlightTitle from '../components/HighlightTitle.jsx'
import '../App.css'

const iconProps = {
  width: 28,
  height: 28,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

const featureIcons = [
  // A document being written on — covers both "upload a report" and "just describe it".
  <svg {...iconProps} key="doc-pencil">
    <path d="M13 3.5H7A1.8 1.8 0 0 0 5.2 5.3v13.4A1.8 1.8 0 0 0 7 20.5h10a1.8 1.8 0 0 0 1.8-1.8v-6" />
    <path d="M8.8 9.5h4.5M8.8 13h3.5M8.8 16.5h2.5" />
    <path d="M18.4 3.4a1.6 1.6 0 0 1 2.2 2.2L17 9.3l-2.6.5.5-2.6 3.5-3.8Z" />
  </svg>,
  // A question mark with sparkles — the AI turning that content into questions.
  <svg {...iconProps} key="ai-question">
    <circle cx="10.5" cy="13" r="7" />
    <path d="M8.6 10.9a2 2 0 1 1 2.9 2.2c-.6.3-1 .9-1 1.6v.3" />
    <circle cx="10.5" cy="17.6" r="0.7" fill="currentColor" stroke="none" />
    <path d="M19 3.5v3.2M17.4 5.1h3.2" />
    <path d="M20 13.5v2M19 14.5h2" />
  </svg>,
  // A gamepad whose buttons are a pause symbol — the game stopping for a question.
  <svg {...iconProps} key="gamepad-pause">
    <rect x="2.5" y="8" width="19" height="10" rx="5" />
    <path d="M7 11v4M5 13h4" />
    <path d="M16 11.6v3.2M18.6 11.6v3.2" />
  </svg>,
]

function Home() {
  const navigate = useNavigate()
  const { lang, t } = useLanguage()
  const features = t('home.features')

  return (
    <div className="page">
      <div className="page-content">
        <div className="brand">{t('home.brand')}</div>
        <HighlightTitle
          prefix={t('home.titlePrefix')}
          highlight={t('home.titleHighlight')}
          typo={heroTypo[lang]}
        />
        <p className="subtitle">{t('home.subtitle')}</p>
        <div className="button-row">
          <button className="btn btn-primary" onClick={() => navigate('/room/create')}>
            {t('home.createRoom')}
          </button>
          <button className="btn btn-secondary" onClick={() => navigate('/room/join')}>
            {t('home.joinRoom')}
          </button>
        </div>

        <div className="feature-grid">
          {features.map((f, i) => (
            <div className="feature-card" key={i}>
              <div className="feature-icon">{featureIcons[i]}</div>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default Home
