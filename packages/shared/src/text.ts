/** Lowercases and removes accents, for matching keywords written in any language. */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}
