/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import JoinRoom from './JoinRoom.jsx'

const mocks = vi.hoisted(() => ({
  ensureRoom: vi.fn(),
  getCurrentPlayer: vi.fn(),
  joinRoom: vi.fn(),
}))

vi.mock('../context/UserContext.jsx', () => ({ useUser: () => ({ user: { name: 'Guest' } }) }))
vi.mock('../context/LanguageContext.jsx', () => ({ useLanguage: () => ({ t: (key) => key }) }))
vi.mock('../services/roomServiceInstance', () => ({ roomService: mocks }))

function Location() {
  const location = useLocation()
  return <span data-location>{`${location.pathname}${location.search}`}</span>
}

describe('room invite join flow', () => {
  let container
  let root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    mocks.ensureRoom.mockReset().mockResolvedValue(null)
    mocks.getCurrentPlayer.mockReset().mockReturnValue(null)
    mocks.joinRoom.mockReset()
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  async function renderInvite(path = '/room/join?roomCode=ABC123') {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/room/join" element={<JoinRoom />} />
            <Route path="/room/:roomCode" element={<Location />} />
          </Routes>
        </MemoryRouter>,
      )
    })
  }

  it('prefills the shared room code and joins only after form submission', async () => {
    const room = { code: 'ABC123' }
    mocks.joinRoom.mockResolvedValue({ ok: true, room, player: { id: 'guest-1' } })
    await renderInvite()

    expect(container.querySelector('#code')?.value).toBe('ABC123')
    expect(mocks.joinRoom).not.toHaveBeenCalled()

    await act(async () => container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))

    expect(mocks.joinRoom).toHaveBeenCalledWith(expect.objectContaining({
      roomCode: 'ABC123',
      displayName: 'Guest',
    }))
    expect(container.querySelector('[data-location]')?.textContent).toBe('/room/ABC123')
  })

  it('resumes an admitted same-room participant without creating a duplicate', async () => {
    const room = { code: 'ABC123' }
    mocks.ensureRoom.mockResolvedValue(room)
    mocks.getCurrentPlayer.mockReturnValue({ id: 'existing-player' })

    await renderInvite()

    expect(container.querySelector('[data-location]')?.textContent).toBe('/room/ABC123')
    expect(mocks.joinRoom).not.toHaveBeenCalled()
  })

  it('preserves the existing room-not-found error on an invalid invite target', async () => {
    mocks.joinRoom.mockResolvedValue({ ok: false, error: 'ROOM_NOT_FOUND' })
    await renderInvite('/room/join?roomCode=ZZZ999')

    await act(async () => container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))

    expect(container.textContent).toContain('joinRoom.notFoundError')
  })
})
