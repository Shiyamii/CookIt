import type { UnitIndex } from '../units/index-units';
import type { Quantity, UnitMatch } from './model';
import { parseQuantity } from './quantity';

// Word between a unit and the ingredient name (`250 g de farine`, `2 c. à soupe d'huile`, `1 cup of`).
const CONNECTOR = /^(?:(?:de|des|du|of)\s+|d['’])/iu;

/**
 * Reads `quantity unit name` in an ingredient line. Every part is optional: a line without a number
 * (`sel, poivre`, `une pincée de sel`) is all name and never scaled.
 */
export function parseIngredientLine(
  raw: string,
  units: UnitIndex,
): { quantity?: Quantity; unit?: UnitMatch; name: string } {
  const quantity = parseQuantity(raw);
  if (!quantity) return { name: raw.trim() };

  const unit = units.match(raw, quantity.end);
  if (!unit) return { quantity, name: raw.slice(quantity.end).trim() };
  const name = raw.slice(unit.end).trim().replace(CONNECTOR, '').trim();
  // `250 g` or `3 gousses` alone: the word is also the name. The unit is kept for its rounding.
  return { quantity, unit, name: name || raw.slice(unit.start, unit.end) };
}
