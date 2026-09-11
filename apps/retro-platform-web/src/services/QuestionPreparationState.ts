type PreparationStatus = 'idle' | 'preparing' | 'ready' | 'fallback';
interface PreparationState { roomCode: string | null; status: PreparationStatus }

// One active room per platform tab. Contains no questions, sources or credentials.
let state: PreparationState = { roomCode: null, status: 'idle' };
const listeners = new Set<() => void>();

export function getQuestionPreparationState(): PreparationState { return state; }
export function skipQuestionPreparation(roomCode: string): void {
  state = { roomCode, status: 'idle' };
  listeners.forEach(listener => listener());
}
export function subscribeQuestionPreparation(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function beginQuestionPreparation(roomCode: string): (status: 'ready' | 'fallback') => void {
  const pending: PreparationState = { roomCode, status: 'preparing' };
  state = pending;
  listeners.forEach(listener => listener());
  return (status) => {
    if (state !== pending) return; // Ignore late completion after entering another room.
    state = { roomCode, status };
    listeners.forEach(listener => listener());
  };
}
