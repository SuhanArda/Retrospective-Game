import { createContext, useContext, useEffect, useState } from 'react'
import { colorForName } from '../utils/avatarColor.js'

const STORAGE_KEY = 'op_user'

const UserContext = createContext(null)

function loadStoredUser() {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw)
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.name === 'string' &&
      parsed.name.trim().length >= 2 &&
      typeof parsed.color === 'string' &&
      parsed.color.length > 0
    ) {
      return parsed
    }
  } catch {
    // A stale or partially written identity should not prevent the app booting.
  }

  localStorage.removeItem(STORAGE_KEY)
  return null
}

export function UserProvider({ children }) {
  const [user, setUser] = useState(loadStoredUser)
  const [isEditing, setIsEditing] = useState(false)

  useEffect(() => {
    if (user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
    }
  }, [user])

  function saveUser(name) {
    const trimmed = name.trim()
    if (trimmed.length < 2) return
    setUser({ name: trimmed, color: colorForName(trimmed) })
    setIsEditing(false)
  }

  function openEditor() {
    setIsEditing(true)
  }

  const value = {
    user,
    saveUser,
    openEditor,
    needsIdentity: !user || isEditing,
  }

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}

export function useUser() {
  const ctx = useContext(UserContext)
  if (!ctx) throw new Error('useUser must be used within UserProvider')
  return ctx
}
