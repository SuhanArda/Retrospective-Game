/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GameStarting from './GameStarting.jsx'

const mocks = vi.hoisted(() => ({
  gameId: 'retro-rush',
  isHost: true,
  launchGame: vi.fn(),
  prepareRoomQuestions: vi.fn(),
}))

vi.mock('../context/LanguageContext.jsx', () => ({ useLanguage: () => ({ t: (key) => key }) }))
vi.mock('../games/gameRegistry', () => ({
  findGame: (gameId) => ({ id: gameId, name: gameId, visualLabel: 'G', status: 'available' }),
}))
vi.mock('../games/gameLauncherInstance', () => ({ gameLauncher: { launchGame: mocks.launchGame } }))
vi.mock('../services/roomServiceInstance', () => ({
  roomService: { getCurrentPlayer: () => ({ id: 'player-1', displayName: 'Player', isHost: mocks.isHost }) },
}))
vi.mock('../hooks/useRoom', () => ({
  useRoom: () => ({
    loading: false,
    room: {
      code: 'ABC234',
      currentGameSession: { gameSessionId: 'session-1', gameId: mocks.gameId },
    },
  }),
}))
vi.mock('../session/platformSession', () => ({
  loadPlatformSession: () => ({ reconnectToken: 'not-a-real-token' }),
}))
vi.mock('../services/QuestionBotService', () => ({
  prepareRoomQuestions: mocks.prepareRoomQuestions,
}))
vi.mock('../services/RoomQuestionDraftStore', () => ({
  deleteRoomQuestionDraft: vi.fn(),
  getRoomQuestionDraft: () => null,
}))

describe('GameStarting', () => {
  let container
  let root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    mocks.gameId = 'retro-rush'
    mocks.isHost = true
    mocks.launchGame.mockReset()
    mocks.prepareRoomQuestions.mockReset()
    mocks.prepareRoomQuestions.mockImplementation(() => new Promise(() => undefined))
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  async function renderStartingPage(gameId) {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[`/room/ABC234/game/${gameId}`]}>
          <Routes>
            <Route path="/room/:roomCode/game/:gameId" element={<GameStarting />} />
          </Routes>
        </MemoryRouter>,
      )
    })
  }

  it('launches Retro Rush without waiting for pending AI preparation', async () => {
    await renderStartingPage('retro-rush')

    expect(mocks.prepareRoomQuestions).toHaveBeenCalledOnce()
    expect(mocks.launchGame).toHaveBeenCalledWith(expect.objectContaining({
      gameId: 'retro-rush', gameSessionId: 'session-1', roomCode: 'ABC234',
    }))
    expect(container.textContent).not.toContain('Soru servisine')
  })

  it('launches Spin for a guest without making AI part of the launch path', async () => {
    mocks.gameId = 'spin-the-bottle'
    mocks.isHost = false

    await renderStartingPage('spin-the-bottle')

    expect(mocks.prepareRoomQuestions).not.toHaveBeenCalled()
    expect(mocks.launchGame).toHaveBeenCalledWith(expect.objectContaining({
      gameId: 'spin-the-bottle', gameSessionId: 'session-1', roomCode: 'ABC234',
    }))
  })
})
