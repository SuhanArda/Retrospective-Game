/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RoomLobby from './RoomLobby.jsx'

const mocks = vi.hoisted(() => ({
  currentPlayer: null,
  room: null,
  writeText: vi.fn(),
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
vi.mock('../components/RoomReactions.jsx', () => ({ default: () => null }))

function Location() {
  const location = useLocation()
  return <span data-location>{`${location.pathname}${location.search}`}</span>
}

describe('room lobby admission and sharing', () => {
  let container
  let root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    mocks.currentPlayer = null
    mocks.room = null
    mocks.writeText.mockReset().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: mocks.writeText } })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
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
})
