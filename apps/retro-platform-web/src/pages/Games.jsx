import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext.jsx'
import { gameRegistry } from '../games/gameRegistry'
import HighlightTitle from '../components/HighlightTitle.jsx'
import '../App.css'

/**
 * The shop window: what the platform has, and what a round actually feels
 * like. Written for someone who has never opened a room — it explains the
 * games rather than asking anyone to pick one, which is what the in-room vote
 * screen is for.
 *
 * Games that do not exist yet are listed on purpose, marked as such. Someone
 * deciding whether this is worth their team's time wants to see where it is
 * going, and one lonely card would undersell it.
 */
function Games() {
  const navigate = useNavigate()
  const { t } = useLanguage()

  return (
    <div className="page">
      <div className="page-content page-content-wide">
        <div className="brand">{t('gamesPage.brand')}</div>
        <HighlightTitle
          className="title title-sm"
          prefix={t('gamesPage.titlePrefix')}
          highlight={t('gamesPage.titleHighlight')}
          animate={false}
        />
        <p className="subtitle">{t('gamesPage.subtitle')}</p>

        <div className="showcase-grid">
          {gameRegistry.map((game) => {
            const steps = t(game.stepsKey)
            return (
              <article className="showcase-card" key={game.id}>
                <div className={`showcase-art art-${game.id}`} aria-hidden="true">
                  <span className="showcase-art-label">{game.visualLabel}</span>
                </div>

                <div className="showcase-body">
                  <div className="showcase-heading">
                    <h2>{game.name}</h2>
                    <span
                      className={`showcase-badge${game.status === 'available' ? ' is-ready' : ''}`}
                    >
                      {game.status === 'available'
                        ? t('gamesPage.available')
                        : t('gamesPage.comingSoon')}
                    </span>
                  </div>

                  <p className="showcase-players">
                    {game.minPlayers}+ {t('gamesPage.playersSuffix')}
                  </p>

                  <p className="showcase-detail">{t(game.detailKey)}</p>

                  <h3 className="showcase-steps-title">{t('gamesPage.howItWorks')}</h3>
                  <ol className="showcase-steps">
                    {Array.isArray(steps) && steps.map((step, index) => <li key={index}>{step}</li>)}
                  </ol>
                </div>
              </article>
            )
          })}
        </div>

        <div className="button-row">
          <button className="btn btn-primary" onClick={() => navigate('/room/create')}>
            {t('gamesPage.createRoom')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default Games
