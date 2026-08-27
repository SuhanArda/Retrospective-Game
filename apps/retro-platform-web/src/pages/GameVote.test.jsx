/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GameVote from './GameVote.jsx'

const mocks = vi.hoisted(() => ({ room: null, currentPlayer: null }))

vi.mock('../context/LanguageContext.jsx', () => ({ useLanguage: () => ({ t: (key) => key }) }))
vi.mock('../services/roomServiceInstance', () => ({
  isMockMode: false,
  roomService: { getCurrentPlayer: () => mocks.currentPlayer },
}))
vi.mock('../hooks/useRoom', () => ({
  useRoom: () => ({ loading: false, room: mocks.room, setRoom: vi.fn() }),
}))
vi.mock('../games/gameRegistry', () => ({ findGame: () => null, gameRegistry: [] }))
vi.mock('../components/RoomReactions.jsx', () => ({ default: () => null }))

function Location() {
  const location = useLocation()
  return <span data-location>{`${location.pathname}${location.search}`}</span>
}

describe('game selection direct-load recovery', () => {
  let container
  let root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    mocks.room = null
    mocks.currentPlayer = null
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  it('renders a controlled recovery path and preserves the room code', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/room/ABC123/games']}>
          <Routes>
            <Route path="/room/:roomCode/games" element={<GameVote />} />
            <Route path="/room/join" element={<Location />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    expect(container.textContent).toContain('lobby.roomNotFoundTitle')
    await act(async () => container.querySelector('button')?.click())
    expect(container.querySelector('[data-location]')?.textContent).toBe('/room/join?roomCode=ABC123')
  })
})
