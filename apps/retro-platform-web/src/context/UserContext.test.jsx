/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { UserProvider, useUser } from './UserContext.jsx'

function CurrentUser() {
  const { user } = useUser()
  return <span data-user>{user?.name ?? 'missing'}</span>
}

describe('persisted user identity', () => {
  let container
  let root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    localStorage.clear()
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    localStorage.clear()
  })

  async function renderProvider() {
    await act(async () => {
      root.render(<UserProvider><CurrentUser /></UserProvider>)
    })
  }

  it('restores a valid identity during a direct page load', async () => {
    localStorage.setItem('op_user', JSON.stringify({ name: 'Arda', color: '#5b2a86' }))

    await renderProvider()

    expect(container.querySelector('[data-user]')?.textContent).toBe('Arda')
  })

  it('clears malformed JSON and still renders the application', async () => {
    localStorage.setItem('op_user', '{bad json')

    await renderProvider()

    expect(container.querySelector('[data-user]')?.textContent).toBe('missing')
    expect(localStorage.getItem('op_user')).toBeNull()
  })

  it('clears a stale identity with an invalid shape', async () => {
    localStorage.setItem('op_user', JSON.stringify({ displayName: 'Old format' }))

    await renderProvider()

    expect(container.querySelector('[data-user]')?.textContent).toBe('missing')
    expect(localStorage.getItem('op_user')).toBeNull()
  })
})
