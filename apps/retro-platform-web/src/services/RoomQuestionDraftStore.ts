export interface RoomQuestionDraft {
  contextPrompt: string;
  reportText: string;
  reportFileName: string | null;
  style: "dengeli" | "eğlendirici" | "düşündürücü";
}

const drafts = new Map<string, RoomQuestionDraft>();

export function saveRoomQuestionDraft(roomCode: string, draft: RoomQuestionDraft): void {
  drafts.set(roomCode, draft);
}

export function getRoomQuestionDraft(roomCode: string): RoomQuestionDraft | null {
  return drafts.get(roomCode) ?? null;
}

export function deleteRoomQuestionDraft(roomCode: string): void {
  drafts.delete(roomCode);
}
