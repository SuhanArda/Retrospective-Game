import type { GeneratedQuestion } from "@retro-platform/contracts";

export function adaptSpinTheBottleQuestion(
  questions: readonly GeneratedQuestion[],
  questionId: string,
  wantsEntertainment: boolean,
): string | null {
  const requestedCategory = wantsEntertainment ? "entertainment" : "work";
  const pool = questions.filter((item) =>
    item.gameCategory ? item.gameCategory === requestedCategory : (item.category === "fun") === wantsEntertainment,
  );
  if (pool.length === 0) return null;
  const hash = [...questionId].reduce((total, character) => total + character.charCodeAt(0), 0);
  return pool[hash % pool.length]?.text ?? null;
}
