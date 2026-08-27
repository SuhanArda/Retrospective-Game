import { createContext, useContext, useEffect, useState } from 'react'
import { colorForName } from '../utils/avatarColor.js'

const STORAGE_KEY = 'op_user'

const UserContext = createContext(null)

export function UserProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  })
  const [isEditing, setIsEditing] = useState(false)

  useEffect(() => {
    if (user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
    }
  }, [user])

  function saveUser(name, avatarId) {
    const trimmed = name.trim()
    if (trimmed.length < 2) return
    setUser({ name: trimmed, color: colorForName(trimmed), avatarId: avatarId ?? user?.avatarId })
    setIsEditing(false)
  }

  function openEditor() {
    setIsEditing(true)
  }

  // Only meaningful while editing an *existing* identity — first-time setup
  // has no valid user to fall back to, so it stays non-dismissible.
  function closeEditor() {
    setIsEditing(false)
  }

  const value = {
    user,
    saveUser,
    openEditor,
    closeEditor,
    needsIdentity: !user || isEditing,
  }

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}

export function useUser() {
  const ctx = useContext(UserContext)
  if (!ctx) throw new Error('useUser must be used within UserProvider')
  return ctx
}
