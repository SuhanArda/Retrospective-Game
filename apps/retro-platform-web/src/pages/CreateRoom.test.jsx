/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CreateRoom from './CreateRoom.jsx'

const mocks = vi.hoisted(() => ({
  createRoom: vi.fn(),
  prepareRoomQuestions: vi.fn(),
}))

vi.mock('../context/UserContext.jsx', () => ({
  useUser: () => ({ user: { name: 'Host', color: '#5b2a86', avatarId: 'robot' } }),
}))
vi.mock('../context/LanguageContext.jsx', () => ({ useLanguage: () => ({ t: (key) => key }) }))
vi.mock('../services/roomServiceInstance', () => ({ roomService: { createRoom: mocks.createRoom } }))
vi.mock('../services/QuestionBotService', () => ({ prepareRoomQuestions: mocks.prepareRoomQuestions }))

function Location() {
  const location = useLocation()
  return <span data-location>{location.pathname}</span>
}

describe('optional room question prompt', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    mocks.createRoom.mockReset().mockResolvedValue({
      room: { code: 'ABC234' },
      player: { id: 'player-1' },
      reconnectToken: 'reconnect-token',
    })
    mocks.prepareRoomQuestions.mockReset().mockResolvedValue(undefined)
  })

  it.each([
    ['an empty prompt', '', undefined],
    ['a whitespace-only prompt', '   ', undefined],
    ['a supplied prompt', '  Sprint iletişimi  ', 'Sprint iletişimi'],
  ])('creates the room with %s', async (_label, prompt, expectedPrompt) => {
    const view = render(
      <MemoryRouter initialEntries={['/room/create']}>
        <Routes>
          <Route path="/room/create" element={<CreateRoom />} />
          <Route path="/room/:roomCode" element={<Location />} />
        </Routes>
      </MemoryRouter>,
    )

    fireEvent.change(view.container.querySelector('#roomName'), { target: { value: 'Sprint Retro' } })
    fireEvent.change(view.container.querySelector('#roomPrompt'), { target: { value: prompt } })
    fireEvent.submit(view.container.querySelector('form'))

    await waitFor(() => expect(mocks.createRoom).toHaveBeenCalledTimes(1))
    expect(mocks.prepareRoomQuestions).toHaveBeenCalledWith(expect.objectContaining({
      roomCode: 'ABC234',
      contextPrompt: expectedPrompt,
    }))
    await waitFor(() => expect(view.container.querySelector('[data-location]')?.textContent).toBe('/room/ABC234'))
  })

  it('keeps room creation successful when question preparation fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mocks.prepareRoomQuestions.mockRejectedValue(new Error('Gemini unavailable'))
    const view = render(
      <MemoryRouter initialEntries={['/room/create']}>
        <Routes>
          <Route path="/room/create" element={<CreateRoom />} />
          <Route path="/room/:roomCode" element={<Location />} />
        </Routes>
      </MemoryRouter>,
    )

    fireEvent.change(view.container.querySelector('#roomName'), { target: { value: 'Sprint Retro' } })
    fireEvent.submit(view.container.querySelector('form'))

    await waitFor(() => expect(view.container.querySelector('[data-location]')?.textContent).toBe('/room/ABC234'))
    expect(mocks.createRoom).toHaveBeenCalledTimes(1)
  })

  it('preserves room name validation', () => {
    const view = render(
      <MemoryRouter initialEntries={['/room/create']}>
        <CreateRoom />
      </MemoryRouter>,
    )

    fireEvent.submit(view.container.querySelector('form'))

    expect(mocks.createRoom).not.toHaveBeenCalled()
  })
})
