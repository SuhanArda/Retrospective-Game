/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.jsx'

vi.mock('./context/UserContext.jsx', () => ({ UserProvider: ({ children }) => children }))
vi.mock('./context/LanguageContext.jsx', () => ({ LanguageProvider: ({ children }) => children }))
vi.mock('./context/ThemeContext.jsx', () => ({ ThemeProvider: ({ children }) => children }))
vi.mock('./components/IdentityGate.jsx', () => ({ default: ({ children }) => children }))
vi.mock('./components/Header.jsx', () => ({ default: () => null }))
vi.mock('./pages/Home.jsx', () => ({ default: () => <main data-page="home" /> }))
vi.mock('./pages/Games.jsx', () => ({ default: () => <main data-page="games" /> }))
vi.mock('./pages/CreateRoom.jsx', () => ({ default: () => <main data-page="create-room" /> }))
vi.mock('./pages/JoinRoom.jsx', () => ({ default: () => <main data-page="join-room" /> }))
vi.mock('./pages/RoomLobby.jsx', () => ({ default: () => <main data-page="room-lobby" /> }))
vi.mock('./pages/GameVote.jsx', () => ({ default: () => <main data-page="game-vote" /> }))
vi.mock('./pages/GameStarting.jsx', () => ({ default: () => <main data-page="game-starting" /> }))
vi.mock('./pages/NotFound.jsx', () => ({ default: () => <main data-page="not-found" /> }))

describe('direct browser routes', () => {
  let container
  let root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  it.each([
    ['/', 'home'],
    ['/room/create', 'create-room'],
    ['/room/join', 'join-room'],
    ['/room/ABC123', 'room-lobby'],
    ['/room/ABC123/games', 'game-vote'],
    ['/room/ABC123/game/retro-rush', 'game-starting'],
  ])('boots %s without navigation state', async (path, expectedPage) => {
    await act(async () => {
      root.render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
    })

    expect(container.querySelector('main')?.dataset.page).toBe(expectedPage)
  })
})
