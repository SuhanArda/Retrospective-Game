/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RoomLobby from './RoomLobby.jsx'
import { beginQuestionPreparation, skipQuestionPreparation } from '../services/QuestionPreparationState'
import { prepareRoomQuestions, QUESTION_PREPARATION_WINDOW_MS } from '../services/QuestionBotService'

const mocks = vi.hoisted(() => ({
  currentPlayer: null,
  room: null,
  writeText: vi.fn(),
  readRoomQuestionStatus: vi.fn(),
}))

vi.mock('../context/LanguageContext.jsx', () => ({ useLanguage: () => ({ t: (key) => key }) }))
vi.mock('../services/roomServiceInstance', () => ({
  isMockMode: false,
  roomService: {
    getConnectionStatus: () => 'connected',
    getCurrentPlayer: () => mocks.currentPlayer,
  },
}))
vi.mock('../hooks/useRoom', () => ({
  useRoom: () => ({ loading: false, room: mocks.room, setRoom: vi.fn() }),
}))
vi.mock('../games/gameRegistry', () => ({ findGame: () => null, gameRegistry: [] }))
vi.mock('../services/RoomQuestionDraftStore', () => ({ deleteRoomQuestionDraft: vi.fn() }))
vi.mock('../services/QuestionBotService', async (importOriginal) => ({
  ...await importOriginal(), readRoomQuestionStatus: mocks.readRoomQuestionStatus,
}))
vi.mock('../components/RoomReactions.jsx', () => ({ default: () => null }))

function Location() {
  const location = useLocation()
  return <span data-location>{`${location.pathname}${location.search}`}</span>
}

describe('room lobby admission and sharing', () => {
  let container
  let root

  beforeEach(() => {
    skipQuestionPreparation('previous-room')
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    mocks.currentPlayer = null
    mocks.room = null
    mocks.writeText.mockReset().mockResolvedValue(undefined)
    mocks.readRoomQuestionStatus.mockReset().mockResolvedValue('preparing')
    window.sessionStorage.clear()
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: mocks.writeText } })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  async function renderLobby() {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/room/ABC123']}>
          <Routes>
            <Route path="/room/:roomCode" element={<RoomLobby />} />
            <Route path="/room/join" element={<Location />} />
          </Routes>
        </MemoryRouter>,
      )
    })
  }

  function admitRoom() {
    mocks.currentPlayer = { id: 'host-1', displayName: 'Host', color: '#123456', isHost: true }
    mocks.room = { code: 'ABC123', roomName: 'Retro', players: [mocks.currentPlayer], status: 'LOBBY', maxParticipants: 10 }
    window.sessionStorage.setItem('retro-platform.session', JSON.stringify({
      playerId: 'host-1', displayName: 'Host', roomCode: 'ABC123', isHost: true, reconnectToken: 'token-1',
    }))
  }

  it.each(['gemini', 'demo'])('ignores an in-flight status timeout until the actual POST settles with %s', async (provider) => {
    vi.useFakeTimers()
    admitRoom()
    mocks.readRoomQuestionStatus.mockImplementation(() => new Promise((_resolve, reject) => {
      window.setTimeout(() => reject(new DOMException('Timed out', 'TimeoutError')), 3000)
    }))
    await renderLobby()
    expect(mocks.readRoomQuestionStatus).toHaveBeenCalledTimes(1)
    let resolvePost
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(resolve => { resolvePost = resolve })))
    let pending
    await act(async () => {
      pending = prepareRoomQuestions({ roomCode: 'ABC123', contextPrompt: 'Sprint', style: 'dengeli',
        playerId: 'host-1', reconnectToken: 'token-1' })
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(container.textContent).toContain('questionPreparation.preparing')
    expect(container.textContent).not.toContain('lobby.questionsUnavailable')
    expect(mocks.readRoomQuestionStatus).toHaveBeenCalledTimes(1)
    await act(async () => {
      resolvePost(new Response(JSON.stringify({
        roomId: 'ABC123', roomInstanceId: 'instance', questionSetId: 'set-1', provider, generationStatus: 'ready',
        questions: Array.from({ length: 20 }, (_, i) => ({ id: String(i), text: `Question ${i}`, answer: `Answer ${i}`, category: 'reflection' })),
        createdAt: 1, updatedAt: 1,
      }), { status: 201 }))
      await pending
    })
    expect(container.textContent).toContain(`questionPreparation.${provider === 'gemini' ? 'ready' : 'fallback'}`)
    expect(container.textContent).not.toContain('questionPreparation.preparing')
    expect(container.textContent).not.toContain('lobby.questionsUnavailable')
  })

  it('uses the local POST as authority without issuing status GETs', async () => {
    admitRoom()
    const finish = beginQuestionPreparation('ABC123')
    await renderLobby()
    expect(mocks.readRoomQuestionStatus).not.toHaveBeenCalled()
    expect(container.textContent).toContain('questionPreparation.preparing')
    await act(async () => finish('fallback'))
    expect(container.textContent).toContain('questionPreparation.fallback')
    expect(mocks.readRoomQuestionStatus).not.toHaveBeenCalled()
  })

  it('bounds reconnect polling and only declares unavailable at its deadline', async () => {
    vi.useFakeTimers()
    admitRoom()
    await renderLobby()
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(container.textContent).toContain('lobby.questionsPreparing')
    expect(container.textContent).not.toContain('lobby.questionsUnavailable')
    expect(mocks.readRoomQuestionStatus).toHaveBeenCalledTimes(4)
    await act(async () => { await vi.advanceTimersByTimeAsync(QUESTION_PREPARATION_WINDOW_MS - 10_000) })
    expect(container.textContent).toContain('lobby.questionsUnavailable')
    const calls = mocks.readRoomQuestionStatus.mock.calls.length
    await act(async () => { await vi.advanceTimersByTimeAsync(QUESTION_PREPARATION_WINDOW_MS) })
    expect(mocks.readRoomQuestionStatus).toHaveBeenCalledTimes(calls)
  })

  it('stops on a genuine status authentication failure', async () => {
    vi.useFakeTimers()
    admitRoom()
    mocks.readRoomQuestionStatus.mockRejectedValue(new Error('QUESTION_STATUS_AUTH_FAILED'))
    await renderLobby()
    expect(container.textContent).toContain('lobby.questionsUnavailable')
    expect(container.textContent).not.toContain('lobby.questionsPreparing')
    await act(async () => { await vi.advanceTimersByTimeAsync(QUESTION_PREPARATION_WINDOW_MS) })
    expect(mocks.readRoomQuestionStatus).toHaveBeenCalledTimes(1)
  })

  it('redirects a fresh direct room URL to the prefilled join flow', async () => {
    await renderLobby()

    expect(container.querySelector('[data-location]')?.textContent).toBe('/room/join?roomCode=ABC123')
  })

  it('copies a credential-free join URL without navigating the host', async () => {
    mocks.currentPlayer = { id: 'host-1', displayName: 'Host', color: '#123456', isHost: true, isReady: true }
    mocks.room = {
      id: 'room-1', code: 'ABC123', roomName: 'Retro', hostPlayerId: 'host-1',
      players: [mocks.currentPlayer], status: 'LOBBY', maxParticipants: 10,
      questionTimeSeconds: 30, votingTimeSeconds: 30, createdAt: 1,
    }
    await renderLobby()

    const copyButton = [...container.querySelectorAll('button')]
      .find((button) => button.textContent === 'lobby.copyLink')
    await act(async () => copyButton?.click())

    expect(mocks.writeText).toHaveBeenCalledWith(`${window.location.origin}/room/join?roomCode=ABC123`)
    expect(container.querySelector('[data-location]')).toBeNull()
  })

  it('shows preparation across lobby entry and updates when the background request settles', async () => {
    mocks.currentPlayer = { id: 'host-1', displayName: 'Host', color: '#123456', isHost: true }
    mocks.room = { code: 'ABC123', roomName: 'Retro', players: [mocks.currentPlayer], status: 'LOBBY', maxParticipants: 10 }
    const finish = beginQuestionPreparation('ABC123')
    await renderLobby()
    expect(container.textContent).toContain('questionPreparation.preparing')
    await act(async () => finish('fallback'))
    expect(container.textContent).toContain('questionPreparation.fallback')
    expect(container.textContent).not.toContain('questionPreparation.preparing')
  })

  // The room has no other way to tell an AI question set apart from the shared
  // built-in one, so an unreachable service must still say something.
  it('does not poll or show preparation when the moderator skipped AI', async () => {
    mocks.currentPlayer = { id: 'host-1', displayName: 'Host', color: '#123456', isHost: true }
    mocks.room = { code: 'ABC123', roomName: 'Retro', players: [mocks.currentPlayer], status: 'LOBBY', maxParticipants: 10 }
    window.sessionStorage.setItem('retro-platform.session', JSON.stringify({
      playerId: 'host-1', displayName: 'Host', roomCode: 'ABC123', isHost: true, reconnectToken: 'token-1',
    }))
    skipQuestionPreparation('ABC123')
    vi.useFakeTimers()
    await renderLobby()
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000) })
    expect(mocks.readRoomQuestionStatus).not.toHaveBeenCalled()
    expect(container.textContent).not.toContain('questionPreparation.preparing')
    expect(container.querySelector('.question-status')).toBeNull()
  })

  it.each([
    ['ai', 'lobby.questionsReady'],
    ['fallback', 'lobby.questionsFallback'],
  ])('reports %s question sets in the lobby', async (status, label) => {
    mocks.currentPlayer = { id: 'host-1', displayName: 'Host', color: '#123456', isHost: true, isReady: true }
    mocks.room = {
      id: 'room-1', code: 'ABC123', roomName: 'Retro', hostPlayerId: 'host-1',
      players: [mocks.currentPlayer], status: 'LOBBY', maxParticipants: 10,
      questionTimeSeconds: 30, votingTimeSeconds: 30, createdAt: 1,
    }
    window.sessionStorage.setItem('retro-platform.session', JSON.stringify({
      playerId: 'host-1', displayName: 'Host', roomCode: 'ABC123', isHost: true, reconnectToken: 'token-1',
    }))
    mocks.readRoomQuestionStatus.mockResolvedValue(status)

    await renderLobby()

    expect(container.textContent).toContain(label)
  })

  it('reports an unreachable question service instead of staying silent', async () => {
    mocks.currentPlayer = { id: 'host-1', displayName: 'Host', color: '#123456', isHost: true, isReady: true }
    mocks.room = {
      id: 'room-1', code: 'ABC123', roomName: 'Retro', hostPlayerId: 'host-1',
      players: [mocks.currentPlayer], status: 'LOBBY', maxParticipants: 10,
      questionTimeSeconds: 30, votingTimeSeconds: 30, createdAt: 1,
    }
    window.sessionStorage.setItem('retro-platform.session', JSON.stringify({
      playerId: 'host-1', displayName: 'Host', roomCode: 'ABC123', isHost: true, reconnectToken: 'token-1',
    }))
    mocks.readRoomQuestionStatus.mockRejectedValue(new Error('QUESTION_BOT_UNAVAILABLE'))
    vi.useFakeTimers()

    await renderLobby()
    await act(async () => { vi.advanceTimersByTime(3000) })

    expect(container.textContent).toContain('lobby.questionsUnavailable')
  })
})
