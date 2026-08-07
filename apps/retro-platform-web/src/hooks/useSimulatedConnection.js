import { useEffect, useState } from 'react'

/**
 * Stands in for a real connection hook (e.g. a SignalR hub connection) until
 * the backend exists. Starts 'connecting', flips to 'connected' shortly after
 * — same shape a real hook would return, so swapping this out later is a
 * one-line change in RoomLobby rather than a UI rewrite.
 */
export function useSimulatedConnection() {
  const [status, setStatus] = useState('connecting')

  useEffect(() => {
    const timer = setTimeout(() => setStatus('connected'), 650)
    return () => clearTimeout(timer)
  }, [])

  return status
}
