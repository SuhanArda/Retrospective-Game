import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../context/UserContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { roomService } from '../services/roomServiceInstance'
import { saveRoomQuestionDraft } from '../services/RoomQuestionDraftStore'
import '../App.css'

const QUESTION_TIME_OPTIONS = [15, 30, 45, 60]
const VOTING_TIME_OPTIONS = [15, 30, 45, 60]

function CreateRoom() {
  const navigate = useNavigate()
  const { user } = useUser()
  const { t } = useLanguage()
  const [roomName, setRoomName] = useState('')
  const [maxParticipants, setMaxParticipants] = useState('10')
  const [questionTime, setQuestionTime] = useState(30)
  const [votingTime, setVotingTime] = useState(30)
  const [contextPrompt, setContextPrompt] = useState('')
  const [reportFile, setReportFile] = useState(null)
  const [questionStyle, setQuestionStyle] = useState('dengeli')
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  function validate() {
    const next = {}
    if (roomName.trim().length < 3) next.roomName = t('createRoom.roomNameError')
    const max = Number(maxParticipants)
    if (!Number.isInteger(max) || max < 2 || max > 50) {
      next.maxParticipants = t('createRoom.maxParticipantsError')
    }
    if (!contextPrompt.trim() && !reportFile) next.report = 'Kısa bir prompt gir veya TXT, PDF ya da DOCX raporu ekle.'
    return next
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const validation = validate()
    setErrors(validation)
    if (Object.keys(validation).length > 0 || !user) return

    setSubmitting(true)
    const { room } = await roomService.createRoom({
      displayName: user.name,
      color: user.color,
      roomName,
      maxParticipants: Number(maxParticipants),
      questionTimeSeconds: questionTime,
      votingTimeSeconds: votingTime,
    })
    saveRoomQuestionDraft(room.code, {
      contextPrompt: contextPrompt.trim(),
      reportText: '',
      reportFileName: reportFile?.name ?? null,
      reportFile,
      style: questionStyle,
    })
    setSubmitting(false)
    navigate(`/room/${room.code}`)
  }

  async function handleReportChange(event) {
    const selectedFile = event.target.files?.[0] ?? null
    setReportFile(selectedFile)
    if (!selectedFile) return
    const extension = selectedFile.name.slice(selectedFile.name.lastIndexOf('.')).toLowerCase()
    const allowedTypes = {
      '.txt': 'text/plain',
      '.pdf': 'application/pdf',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }
    if (selectedFile.size > 5 * 1024 * 1024 || allowedTypes[extension] !== selectedFile.type) {
      setReportFile(null)
      setErrors((current) => ({ ...current, report: 'Yalnızca en fazla 5 MB boyutunda TXT, PDF veya DOCX raporu yüklenebilir.' }))
      return
    }
    setErrors((current) => ({ ...current, report: undefined }))
  }

  return (
    <div className="page">
      <div className="page-content">
        <button className="link-button" onClick={() => navigate('/')} type="button">
          {t('createRoom.back')}
        </button>
        <div className="brand">{t('createRoom.brand')}</div>
        <h1 className="title title-sm">{t('createRoom.title')}</h1>
        <p className="subtitle">{t('createRoom.subtitle')}</p>

        <form className="card" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="roomName">{t('createRoom.roomNameLabel')}</label>
            <input
              id="roomName"
              className={`input${errors.roomName ? ' has-error' : ''}`}
              type="text"
              placeholder={t('createRoom.roomNamePlaceholder')}
              value={roomName}
              onChange={(event) => setRoomName(event.target.value)}
              maxLength={40}
              autoFocus
            />
            {errors.roomName && <span className="error-text">{errors.roomName}</span>}
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="maxParticipants">{t('createRoom.maxParticipantsLabel')}</label>
              <input
                id="maxParticipants"
                className={`input${errors.maxParticipants ? ' has-error' : ''}`}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={2}
                value={maxParticipants}
                onChange={(event) => setMaxParticipants(event.target.value.replace(/[^0-9]/g, ''))}
                onFocus={(event) => event.target.select()}
              />
              {errors.maxParticipants && <span className="error-text">{errors.maxParticipants}</span>}
            </div>
            <div className="field">
              <label htmlFor="questionTime">{t('createRoom.questionTimeLabel')}</label>
              <select id="questionTime" className="select" value={questionTime} onChange={(event) => setQuestionTime(Number(event.target.value))}>
                {QUESTION_TIME_OPTIONS.map((seconds) => <option key={seconds} value={seconds}>{seconds} {t('createRoom.questionTimeUnit')}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="votingTime">{t('createRoom.votingTimeLabel')}</label>
              <select id="votingTime" className="select" value={votingTime} onChange={(event) => setVotingTime(Number(event.target.value))}>
                {VOTING_TIME_OPTIONS.map((seconds) => <option key={seconds} value={seconds}>{seconds} {t('createRoom.questionTimeUnit')}</option>)}
              </select>
            </div>
          </div>

          <div className="field">
            <label htmlFor="roomPrompt">Kısa prompt (opsiyonel)</label>
            <textarea id="roomPrompt" className="input textarea" value={contextPrompt} onChange={(event) => setContextPrompt(event.target.value)} maxLength={1000} rows={3} placeholder="Örn. Son sprintte yaşanan iletişim sorunlarına odaklan." />
          </div>

          <div className="field">
            <label htmlFor="roomReport">Rapor (opsiyonel)</label>
            <label className={`file-drop${reportFile ? ' has-file' : ''}`} htmlFor="roomReport">
              <span className="file-drop-content">{reportFile ? reportFile.name : 'En fazla 5 MB TXT, PDF veya DOCX seç'}</span>
              <input id="roomReport" type="file" accept=".txt,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={handleReportChange} />
            </label>
            <span className="helper-text">İçerik oda verisine yazılmaz; yalnızca moderatörün tarayıcı belleğinde geçici tutulur.</span>
            {errors.report && <span className="error-text">{errors.report}</span>}
          </div>

          <div className="field">
            <label htmlFor="questionStyle">Soru kategorisi</label>
            <select id="questionStyle" className="select" value={questionStyle} onChange={(event) => setQuestionStyle(event.target.value)}>
              <option value="dengeli">Dengeli</option>
              <option value="eğlendirici">Eğlendirici</option>
              <option value="düşündürücü">Düşündürücü</option>
            </select>
          </div>

          <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
            <span className="btn-content">
              {submitting && <span className="spinner" />}
              {submitting ? t('createRoom.submitting') : t('createRoom.submit')}
            </span>
          </button>
        </form>
      </div>
    </div>
  )
}

export default CreateRoom
