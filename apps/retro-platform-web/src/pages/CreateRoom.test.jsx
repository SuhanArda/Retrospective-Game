/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CreateRoom from './CreateRoom.jsx'
import { beginQuestionPreparation, getQuestionPreparationState, skipQuestionPreparation } from '../services/QuestionPreparationState'

const mocks = vi.hoisted(() => ({
  createRoom: vi.fn(),
  prepareRoomQuestions: vi.fn(),
  warmUpQuestionBot: vi.fn(),
}))

vi.mock('../context/UserContext.jsx', () => ({
  useUser: () => ({ user: { name: 'Host', color: '#5b2a86', avatarId: 'robot' } }),
}))
vi.mock('../context/LanguageContext.jsx', () => ({ useLanguage: () => ({ t: (key) => key }) }))
vi.mock('../services/roomServiceInstance', () => ({ roomService: { createRoom: mocks.createRoom } }))
vi.mock('../services/QuestionBotService', () => ({
  prepareRoomQuestions: mocks.prepareRoomQuestions,
  warmUpQuestionBot: mocks.warmUpQuestionBot,
}))

function Location() {
  const location = useLocation()
  return <span data-location>{location.pathname}</span>
}

describe('optional room question prompt', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  beforeEach(() => {
    skipQuestionPreparation('previous-room')
    mocks.createRoom.mockReset().mockResolvedValue({
      room: { code: 'ABC234' },
      player: { id: 'player-1' },
      reconnectToken: 'reconnect-token',
    })
    mocks.prepareRoomQuestions.mockReset().mockResolvedValue(undefined)
    mocks.warmUpQuestionBot.mockReset()
  })

  it.each([
    ['an untouched prompt', undefined, undefined],
    ['an empty prompt', '', undefined],
    ['a whitespace-only prompt', '   ', undefined],
    ['a real prompt', 'Sprint iletişimi', 'Sprint iletişimi'],
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
    expect(mocks.warmUpQuestionBot).not.toHaveBeenCalled()
    if (prompt !== undefined) fireEvent.change(view.container.querySelector('#roomPrompt'), { target: { value: prompt } })
    expect(mocks.warmUpQuestionBot).not.toHaveBeenCalled()
    fireEvent.submit(view.container.querySelector('form'))

    await waitFor(() => expect(mocks.createRoom).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(view.container.querySelector('[data-location]')?.textContent).toBe('/room/ABC234'))
    if (expectedPrompt) {
      expect(mocks.prepareRoomQuestions).toHaveBeenCalledTimes(1)
      expect(mocks.warmUpQuestionBot).toHaveBeenCalledTimes(1)
      expect(mocks.prepareRoomQuestions).toHaveBeenCalledWith(expect.objectContaining({
        roomCode: 'ABC234', contextPrompt: expectedPrompt,
      }))
    } else {
      expect(mocks.prepareRoomQuestions).not.toHaveBeenCalled()
      expect(mocks.warmUpQuestionBot).not.toHaveBeenCalled()
      expect(getQuestionPreparationState()).toEqual({ roomCode: 'ABC234', status: 'idle' })
    }
  })

  it('prepares a report-only room and never logs its contents', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const view = render(<MemoryRouter><CreateRoom /></MemoryRouter>)
    const reportFile = new File(['private report contents'], 'retro.txt', { type: 'text/plain' })
    fireEvent.change(view.container.querySelector('#roomName'), { target: { value: 'Sprint Retro' } })
    fireEvent.change(view.container.querySelector('#roomReport'), { target: { files: [reportFile] } })
    expect(mocks.warmUpQuestionBot).not.toHaveBeenCalled()
    fireEvent.submit(view.container.querySelector('form'))
    await waitFor(() => expect(mocks.prepareRoomQuestions).toHaveBeenCalledTimes(1))
    expect(mocks.prepareRoomQuestions).toHaveBeenCalledWith(expect.objectContaining({ contextPrompt: undefined, reportFile }))
    expect(mocks.warmUpQuestionBot).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith('[Platform AI] preparation enabled roomCode=ABC234 source=report')
    expect(JSON.stringify(log.mock.calls)).not.toContain('private report contents')
  })

  it('skips immediately and clears stale preparation when the prompt was erased', async () => {
    vi.useFakeTimers()
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const finishOldRequest = beginQuestionPreparation('ABC234')
    const view = render(<MemoryRouter initialEntries={['/room/create']}><Routes>
      <Route path="/room/create" element={<CreateRoom />} />
      <Route path="/room/:roomCode" element={<Location />} />
    </Routes></MemoryRouter>)
    fireEvent.change(view.container.querySelector('#roomName'), { target: { value: 'Sprint Retro' } })
    fireEvent.change(view.container.querySelector('#roomPrompt'), { target: { value: 'Sprint' } })
    fireEvent.change(view.container.querySelector('#roomPrompt'), { target: { value: '' } })
    await act(async () => { fireEvent.submit(view.container.querySelector('form')) })
    finishOldRequest('ready')
    expect(mocks.prepareRoomQuestions).not.toHaveBeenCalled()
    expect(mocks.warmUpQuestionBot).not.toHaveBeenCalled()
    expect(getQuestionPreparationState()).toEqual({ roomCode: 'ABC234', status: 'idle' })
    expect(view.container.textContent).not.toContain('questionPreparation.preparing')
    expect(view.container.querySelector('[data-location]')?.textContent).toBe('/room/ABC234')
    expect(log).toHaveBeenCalledWith('[Platform AI] preparation skipped roomCode=ABC234 reason=no_ai_input')
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
    fireEvent.change(view.container.querySelector('#roomPrompt'), { target: { value: 'Sprint' } })
    fireEvent.submit(view.container.querySelector('form'))

    await waitFor(() => expect(view.container.querySelector('[data-location]')?.textContent).toBe('/room/ABC234'))
    expect(mocks.createRoom).toHaveBeenCalledTimes(1)
    expect(mocks.prepareRoomQuestions).toHaveBeenCalledTimes(1)
  })

  it('enters the lobby after two seconds while question preparation is still pending', async () => {
    vi.useFakeTimers()
    mocks.prepareRoomQuestions.mockImplementation(() => new Promise(() => undefined))
    const view = render(
      <MemoryRouter initialEntries={['/room/create']}><Routes>
        <Route path="/room/create" element={<CreateRoom />} />
        <Route path="/room/:roomCode" element={<Location />} />
      </Routes></MemoryRouter>,
    )
    fireEvent.change(view.container.querySelector('#roomName'), { target: { value: 'Sprint Retro' } })
    fireEvent.change(view.container.querySelector('#roomPrompt'), { target: { value: 'Sprint' } })
    await act(async () => { fireEvent.submit(view.container.querySelector('form')) })
    expect(view.container.textContent).toContain('questionPreparation.preparing')
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(view.container.querySelector('[data-location]')?.textContent).toBe('/room/ABC234')
    expect(mocks.prepareRoomQuestions).toHaveBeenCalledTimes(1)
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

  it('reports admission failure before question preparation without logging credentials', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mocks.createRoom.mockRejectedValue(new Error('private-reconnect-token'))
    const view = render(<MemoryRouter><CreateRoom /></MemoryRouter>)
    fireEvent.change(view.container.querySelector('#roomName'), { target: { value: 'Sprint Retro' } })
    fireEvent.submit(view.container.querySelector('form'))
    await waitFor(() => expect(view.container.querySelector('[role="alert"]')).not.toBeNull())
    expect(mocks.prepareRoomQuestions).not.toHaveBeenCalled()
    expect(mocks.warmUpQuestionBot).not.toHaveBeenCalled()
    expect(warning).toHaveBeenCalledWith('[Platform AI] question preparation not invoked reason=room_creation_or_realtime_admission_failed')
    expect(view.container.querySelector('button[type="submit"]').disabled).toBe(false)
  })
})
