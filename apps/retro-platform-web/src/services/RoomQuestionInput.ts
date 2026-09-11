export function hasAiQuestionInput(input: {
  contextPrompt?: string | null;
  reportText?: string | null;
  reportFile?: File | null;
}): boolean {
  return Boolean(input.contextPrompt?.trim() || input.reportText?.trim() || input.reportFile);
}
