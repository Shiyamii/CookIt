import { MAX_TIMER_SECONDS } from '../recipe/inline';

/**
 * Durations written in a step (`10 min`, `1h30`, `1 heure 30`, `45 secondes`, `2 à 3 minutes`),
 * found without AI (plan §5.2), to be proposed as timers the user accepts or refuses. French and
 * English. A range proposes its high value and keeps the low one for the user to choose.
 */
export type DetectedDuration = {
  /** Position of the duration in the text. */
  start: number;
  end: number;
  text: string;
  /** Proposed duration: the high value of a range. */
  seconds: number;
  /** For a range (`2 à 3 minutes`): the low value, to offer as the alternative. */
  lowSeconds?: number;
};

const NUMBER = String.raw`\d+(?:[.,]\d+)?`;
const HOURS = String.raw`h(?:eures?|ours?|rs?)?`;
const MINUTES = String.raw`min(?:ute)?s?|mn`;
const SECONDS = String.raw`s(?:ec(?:onde)?s?|econds?)?`;
const RANGE = String.raw`\s*(?:-|–|à|a|to|or|ou)\s*`;

// Each alternative is anchored on word boundaries; units are whole words (`10 m` is not minutes).
const DURATION = new RegExp(
  [
    // 1h30, 1 h 30, 1 heure 30, 1h30min, 1 hour 30 minutes
    String.raw`(?<h1>${NUMBER})\s*(?:${HOURS})\s*(?<m1>\d{1,2})(?:\s*(?:${MINUTES}))?(?![\p{L}\d])`,
    // 2 à 3 minutes, 2-3 h, 30 to 40 seconds
    String.raw`(?<low>${NUMBER})${RANGE}(?<high>${NUMBER})\s*(?<unit2>${HOURS}|${MINUTES}|${SECONDS})(?![\p{L}\d])`,
    // 10 min, 2 heures, 45 secondes, 1,5 h
    String.raw`(?<value>${NUMBER})\s*(?<unit>${HOURS}|${MINUTES}|${SECONDS})(?![\p{L}\d])`,
  ].join('|'),
  'giu',
);

function number(text: string): number {
  return Number(text.replace(',', '.'));
}

function unitSeconds(unit: string): number {
  const u = unit.toLowerCase();
  if (u.startsWith('h')) return 3600;
  if (u.startsWith('m')) return 60;
  return 1;
}

const valid = (seconds: number) => seconds > 0 && seconds <= MAX_TIMER_SECONDS;

export function detectDurations(text: string): DetectedDuration[] {
  const found: DetectedDuration[] = [];
  for (const match of text.matchAll(DURATION)) {
    const start = match.index ?? 0;
    // A number glued to a letter before it (`x10 min`, `A4`) is not a duration.
    if (start > 0 && /[\p{L}\d]/u.test(text.charAt(start - 1))) continue;
    const groups = match.groups ?? {};
    let seconds: number;
    let lowSeconds: number | undefined;
    if (groups.h1 !== undefined && groups.m1 !== undefined) {
      seconds = Math.round(number(groups.h1) * 3600 + Number(groups.m1) * 60);
    } else if (groups.low !== undefined && groups.high !== undefined && groups.unit2) {
      const unit = unitSeconds(groups.unit2);
      seconds = Math.round(number(groups.high) * unit);
      lowSeconds = Math.round(number(groups.low) * unit);
      if (lowSeconds >= seconds || !valid(lowSeconds)) lowSeconds = undefined;
    } else if (groups.value !== undefined && groups.unit) {
      seconds = Math.round(number(groups.value) * unitSeconds(groups.unit));
    } else {
      continue;
    }
    if (!valid(seconds)) continue;
    const end = start + match[0].length;
    found.push({ start, end, text: match[0], seconds, ...(lowSeconds && { lowSeconds }) });
  }
  return found;
}
