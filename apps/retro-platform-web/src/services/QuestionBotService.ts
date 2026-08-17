import type { RoomQuestionSet } from '@retro-platform/contracts';
import { parseRoomQuestionSet } from '@retro-platform/realtime-client';

const questionApiUrl = typeof import.meta.env.VITE_API_URL === 'string' && import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL : null;

function requireApiUrl(): string {
  if (!questionApiUrl) throw new Error('QUESTION_BOT_UNAVAILABLE');
  return questionApiUrl;
}

function authHeaders(playerId: string, reconnectToken: string): Record<string, string> {
  return { 'X-Player-Id': playerId, 'X-Reconnect-Token': reconnectToken };
}

async function encodeReportFile(file: File): Promise<{ name: string; mimeType: string; dataBase64: string }> {
  const dataBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('REPORT_READ_FAILED'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const separator = result.indexOf(',');
      if (separator < 0) reject(new Error('REPORT_READ_FAILED'));
      else resolve(result.slice(separator + 1));
    };
    reader.readAsDataURL(file);
  });
  return { name: file.name, mimeType: file.type, dataBase64 };
}

export async function prepareRoomQuestions(input: {
  roomCode: string;
  style: 'dengeli' | 'eğlendirici' | 'düşündürücü';
  contextPrompt?: string;
  reportText?: string;
  reportFile?: File | null;
  playerId: string;
  reconnectToken: string;
  replaceExisting?: boolean;
}): Promise<RoomQuestionSet> {
  const reportFile = input.reportFile ? await encodeReportFile(input.reportFile) : null;
  const response = await fetch(`${requireApiUrl()}/api/rooms/${encodeURIComponent(input.roomCode)}/ai/questions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(input.playerId, input.reconnectToken) },
    keepalive: reportFile === null,
    signal: AbortSignal.timeout(45_000),
    body: JSON.stringify({
      topic: input.contextPrompt?.trim() || null,
      reportText: input.reportText?.trim() || null,
      reportFile,
      language: 'tr',
      style: input.style,
      count: 20,
      replaceExisting: input.replaceExisting === true,
    }),
  });
  if (!response.ok) throw new Error('QUESTION_PREPARATION_FAILED');
  return parseRoomQuestionSet(await response.json());
}

export async function roomQuestionsAreReady(roomCode: string, playerId: string, reconnectToken: string): Promise<boolean> {
  const response = await fetch(`${requireApiUrl()}/api/rooms/${encodeURIComponent(roomCode)}/ai/questions`, {
    headers: authHeaders(playerId, reconnectToken),
    signal: AbortSignal.timeout(3_000),
  });
  if (response.status === 404) return false;
  if (!response.ok) throw new Error('QUESTION_BOT_UNAVAILABLE');
  return parseRoomQuestionSet(await response.json()).questions.length === 20;
}
