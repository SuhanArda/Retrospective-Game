/**
 * The emoji a player can send while waiting, and the shape one arrives in.
 *
 * This list must match `ReactionPolicy.Allowed` in
 * `services/retro-platform-api/Rooms/ReactionPolicy.cs` character for
 * character. The server refuses anything it does not recognise, so a mismatch
 * here shows up as a reaction that silently never reaches anyone.
 *
 * Watch the invisible ones: "❤️" is U+2764 followed by U+FE0F, the variation
 * selector that asks for the emoji rendering rather than the text one. The
 * bare "❤" is a different string and the server rejects it.
 */
/** Eighteen, so the strip lays out as even rows rather than a ragged last line. */
export const REACTION_EMOJI = [
  '👍', '😂', '🔥', '❤️', '🎉', '👀', '💀', '🤡', '🥱',
  '🗿', '🫠', '🤯', '🫡', '🙏', '🧠', '🍿', '🐐', '🚀',
] as const;

export type ReactionEmoji = (typeof REACTION_EMOJI)[number];

/**
 * One reaction, as broadcast to the room. The identity fields come from the
 * server's copy of the room rather than from whoever sent it, so they can be
 * displayed as-is.
 */
export interface RoomReaction {
  playerId: string;
  displayName: string;
  color: string;
  emoji: string;
  /** Unix ms, stamped by the server. */
  sentAt: number;
}

export function isReactionEmoji(value: string): value is ReactionEmoji {
  return (REACTION_EMOJI as readonly string[]).includes(value);
}
