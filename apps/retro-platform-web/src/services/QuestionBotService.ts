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

// A sleeping AI service answers through the backend gateway as 502, 503 or 504.
// The failed call itself starts the wake, so a single retry lands on a service
// that is now up. Other statuses are real rejections and are not retried.
const wakeUpStatuses = new Set([502, 503, 504]);
export const QUESTION_RETRY_DELAY_MS = 5_000;

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, milliseconds); });
}

/**
 * Starts waking the AI service without waiting for it. Call this as soon as the
 * moderator opens the room form: on a free tier instance the wake can take about
 * a minute, and that minute should be spent while they type, not afterwards.
 */
export function warmUpQuestionBot(): void {
  if (!questionApiUrl) return;
  void fetch(`${questionApiUrl}/api/ai/warmup`, {
    method: 'POST',
    signal: AbortSignal.timeout(120_000),
  }).catch(() => { /* The generation call reports real failures. */ });
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
  const send = () => fetch(`${requireApiUrl()}/api/rooms/${encodeURIComponent(input.roomCode)}/ai/questions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(input.playerId, input.reconnectToken) },
    keepalive: reportFile === null,
    // Matches the backend gateway timeout so a slow first generation is never
    // abandoned here while the service is still producing the question set.
    signal: AbortSignal.timeout(120_000),
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

  let response = await send();
  if (wakeUpStatuses.has(response.status)) {
    await wait(QUESTION_RETRY_DELAY_MS);
    response = await send();
  }
  if (!response.ok) throw new Error('QUESTION_PREPARATION_FAILED');
  return parseRoomQuestionSet(await response.json());
}

/** 'preparing' while the bot is still working, then whichever set the room got. */
export type RoomQuestionStatus = 'preparing' | 'ai' | 'fallback';

/**
 * Tells the room which question set it is about to play with: one generated
 * from the moderator's prompt, or the shared built-in set the bot falls back to
 * when generation fails. A room without a set yet is still preparing.
 */
export async function readRoomQuestionStatus(
  roomCode: string,
  playerId: string,
  reconnectToken: string,
): Promise<RoomQuestionStatus> {
  const response = await fetch(`${requireApiUrl()}/api/rooms/${encodeURIComponent(roomCode)}/ai/questions`, {
    headers: authHeaders(playerId, reconnectToken),
    signal: AbortSignal.timeout(3_000),
  });
  if (response.status === 404) return 'preparing';
  if (!response.ok) throw new Error('QUESTION_BOT_UNAVAILABLE');
  return parseRoomQuestionSet(await response.json()).provider === 'gemini' ? 'ai' : 'fallback';
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
