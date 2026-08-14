import { afterEach, describe, expect, it, vi } from 'vitest'
import { deleteRoomQuestionDraft, getRoomQuestionDraft, saveRoomQuestionDraft } from './RoomQuestionDraftStore'

const draft = {
  contextPrompt: 'İletişim sorunlarına odaklan',
  reportText: '',
  reportFileName: null,
  reportFile: null,
  style: 'dengeli' as const,
}

describe('RoomQuestionDraftStore', () => {
  afterEach(() => {
    deleteRoomQuestionDraft('ABC234')
    vi.useRealTimers()
  })

  it('taslağı yalnızca bellekte tutar ve açıkça siler', () => {
    saveRoomQuestionDraft('ABC234', draft)
    expect(getRoomQuestionDraft('ABC234')).toEqual(draft)
    deleteRoomQuestionDraft('ABC234')
    expect(getRoomQuestionDraft('ABC234')).toBeNull()
  })

  it('taslağı oyun geçişlerinde korur ve güvenlik süresi sonunda siler', () => {
    vi.useFakeTimers()
    saveRoomQuestionDraft('ABC234', draft)
    vi.advanceTimersByTime(30 * 60 * 1000)
    expect(getRoomQuestionDraft('ABC234')).toEqual(draft)
    vi.advanceTimersByTime(150 * 60 * 1000)
    expect(getRoomQuestionDraft('ABC234')).toBeNull()
  })
})
