import { fold } from '../text';

/**
 * Comparison form of a unit alias: no case, accents, dots or spaces, so that `c. à soupe`,
 * `C.à.S`, `càs` and `CaS` all become `cas` / `casoupe`-like keys.
 */
export function normalizeAlias(alias: string): string {
  return fold(alias).replace(/[\s.]+/g, '');
}
