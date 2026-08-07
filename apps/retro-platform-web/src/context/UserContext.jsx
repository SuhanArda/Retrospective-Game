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
