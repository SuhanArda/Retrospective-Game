import { useLanguage } from '../context/LanguageContext.jsx'

function LangSwitch({ className = '' }) {
  const { lang, setLang } = useLanguage()

  return (
    <div className={`lang-switch ${className}`.trim()} role="group" aria-label="Language">
      <button type="button" className={lang === 'tr' ? 'active' : ''} onClick={() => setLang('tr')}>
        TR
      </button>
      <button type="button" className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>
        EN
      </button>
    </div>
  )
}

export default LangSwitch
