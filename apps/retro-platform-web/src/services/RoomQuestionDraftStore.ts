export interface RoomQuestionDraft {
  contextPrompt: string;
  reportText: string;
  reportFileName: string | null;
  reportFile: File | null;
  style: "dengeli" | "eğlendirici" | "düşündürücü";
}

interface StoredDraft {
  value: RoomQuestionDraft;
  timeout: ReturnType<typeof setTimeout>;
}

const drafts = new Map<string, StoredDraft>();
// Keep the moderator input available while the room moves between games.
// Explicit leave/room-close handlers delete it sooner; this timeout only
// protects against abandoned browser sessions.
const DRAFT_TTL_MS = 3 * 60 * 60 * 1000;

export function saveRoomQuestionDraft(roomCode: string, draft: RoomQuestionDraft): void {
  deleteRoomQuestionDraft(roomCode);
  const timeout = setTimeout(() => deleteRoomQuestionDraft(roomCode), DRAFT_TTL_MS);
  drafts.set(roomCode, { value: draft, timeout });
}

export function getRoomQuestionDraft(roomCode: string): RoomQuestionDraft | null {
  return drafts.get(roomCode)?.value ?? null;
}

export function deleteRoomQuestionDraft(roomCode: string): void {
  const stored = drafts.get(roomCode);
  if (!stored) return;
  clearTimeout(stored.timeout);
  drafts.delete(roomCode);
}
