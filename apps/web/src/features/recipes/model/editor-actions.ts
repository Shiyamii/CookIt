import { parseInline, quantityLink, stepFromSegments, timerLink, unitIndex } from '@cookit/shared';
import { newId, newRow, type EditorGroup, type EditorRecipe } from './editor';

/** Edits of the visual editor, applied by `editorReducer` (pure: easy to test). */

export type Part = 'ingredients' | 'steps';
export type PresentationField = 'title' | 'description' | 'servings' | 'source';

export type EditorAction =
  | { type: 'replace'; recipe: EditorRecipe }
  | { type: 'setField'; field: PresentationField; value: string }
  | { type: 'addMeta' }
  | { type: 'setMeta'; id: string; key: string; value: string }
  | { type: 'removeMeta'; id: string }
  | { type: 'addGroup'; part: Part }
  | { type: 'renameGroup'; part: Part; groupId: string; name: string }
  | { type: 'removeGroup'; part: Part; groupId: string }
  | { type: 'moveGroup'; part: Part; groupId: string; toIndex: number }
  | { type: 'addRow'; part: Part; groupId: string; afterRowId?: string }
  | { type: 'setRow'; part: Part; rowId: string; raw: string }
  | { type: 'removeRow'; part: Part; rowId: string }
  /** To another position, possibly in another group of the same part. */
  | { type: 'moveRow'; part: Part; rowId: string; toGroupId: string; toIndex: number }
  /** One place up or down (buttons, next to drag and drop); a row crosses into the next group. */
  | { type: 'shiftRow'; part: Part; rowId: string; direction: -1 | 1 }
  | { type: 'shiftGroup'; part: Part; groupId: string; direction: -1 | 1 };

const key = (part: Part) => (part === 'ingredients' ? 'ingredientGroups' : 'stepGroups');

export function arrayMove<T>(items: readonly T[], from: number, to: number): T[] {
  const result = [...items];
  const [moved] = result.splice(from, 1);
  if (moved === undefined) return result;
  result.splice(Math.max(0, Math.min(to, result.length)), 0, moved);
  return result;
}

function mapGroups(
  recipe: EditorRecipe,
  part: Part,
  change: (groups: EditorGroup[]) => EditorGroup[],
): EditorRecipe {
  return { ...recipe, [key(part)]: change(recipe[key(part)]) };
}

/** Where a row goes one place up or down: across group boundaries, nowhere past the ends. */
function shiftTarget(
  groups: EditorGroup[],
  rowId: string,
  direction: -1 | 1,
): { toGroupId: string; toIndex: number } | undefined {
  const g = groups.findIndex((group) => group.rows.some((row) => row.id === rowId));
  const group = groups[g];
  if (!group) return undefined;
  const r = group.rows.findIndex((row) => row.id === rowId);
  const inside = r + direction;
  if (inside >= 0 && inside < group.rows.length) return { toGroupId: group.id, toIndex: inside };
  const next = groups[g + direction];
  if (!next) return undefined;
  return { toGroupId: next.id, toIndex: direction === 1 ? 0 : next.rows.length };
}

export function editorReducer(recipe: EditorRecipe, action: EditorAction): EditorRecipe {
  switch (action.type) {
    case 'shiftRow': {
      const target = shiftTarget(recipe[key(action.part)], action.rowId, action.direction);
      return target
        ? editorReducer(recipe, {
            type: 'moveRow',
            part: action.part,
            rowId: action.rowId,
            ...target,
          })
        : recipe;
    }
    case 'shiftGroup': {
      const groups = recipe[key(action.part)];
      const from = groups.findIndex((group) => group.id === action.groupId);
      const to = from + action.direction;
      if (from < 0 || to < 0 || to >= groups.length) return recipe;
      return mapGroups(recipe, action.part, () => arrayMove(groups, from, to));
    }
    case 'replace':
      return action.recipe;
    case 'setField':
      return { ...recipe, [action.field]: action.value };
    case 'addMeta':
      return { ...recipe, extraMeta: [...recipe.extraMeta, { id: newId(), key: '', value: '' }] };
    case 'setMeta':
      return {
        ...recipe,
        extraMeta: recipe.extraMeta.map((meta) =>
          meta.id === action.id ? { ...meta, key: action.key, value: action.value } : meta,
        ),
      };
    case 'removeMeta':
      return { ...recipe, extraMeta: recipe.extraMeta.filter((meta) => meta.id !== action.id) };
    case 'addGroup':
      return mapGroups(recipe, action.part, (groups) => [
        ...groups,
        { id: newId(), name: '', rows: [newRow()] },
      ]);
    case 'renameGroup':
      return mapGroups(recipe, action.part, (groups) =>
        groups.map((group) =>
          group.id === action.groupId ? { ...group, name: action.name } : group,
        ),
      );
    case 'removeGroup':
      return mapGroups(recipe, action.part, (groups) => {
        const rest = groups.filter((group) => group.id !== action.groupId);
        // A part always keeps one group to type into.
        return rest.length ? rest : [{ id: newId(), name: undefined, rows: [newRow()] }];
      });
    case 'moveGroup':
      return mapGroups(recipe, action.part, (groups) =>
        arrayMove(
          groups,
          groups.findIndex((group) => group.id === action.groupId),
          action.toIndex,
        ),
      );
    case 'addRow':
      return mapGroups(recipe, action.part, (groups) =>
        groups.map((group) => {
          if (group.id !== action.groupId) return group;
          const at = action.afterRowId
            ? group.rows.findIndex((row) => row.id === action.afterRowId) + 1
            : group.rows.length;
          const rows = [...group.rows];
          rows.splice(at, 0, newRow());
          return { ...group, rows };
        }),
      );
    case 'setRow':
      return mapGroups(recipe, action.part, (groups) =>
        groups.map((group) => ({
          ...group,
          rows: group.rows.map((row) =>
            row.id === action.rowId ? { ...row, raw: action.raw } : row,
          ),
        })),
      );
    case 'removeRow':
      return mapGroups(recipe, action.part, (groups) =>
        groups.map((group) => ({
          ...group,
          rows: group.rows.filter((row) => row.id !== action.rowId),
        })),
      );
    case 'moveRow':
      return mapGroups(recipe, action.part, (groups) => {
        const row = groups.flatMap((group) => group.rows).find((r) => r.id === action.rowId);
        if (!row) return groups;
        const without = groups.map((group) => ({
          ...group,
          rows: group.rows.filter((r) => r.id !== action.rowId),
        }));
        return without.map((group) => {
          if (group.id !== action.toGroupId) return group;
          const rows = [...group.rows];
          rows.splice(Math.max(0, Math.min(action.toIndex, rows.length)), 0, row);
          return { ...group, rows };
        });
      });
  }
}

/** Seconds from the hours and minutes typed in the timer form (undefined if not positive). */
export function timerSeconds(hours: string, minutes: string): number | undefined {
  const h = hours.trim() === '' ? 0 : Number(hours);
  const m = minutes.trim() === '' ? 0 : Number(minutes);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || m < 0) return undefined;
  const seconds = h * 3600 + m * 60;
  return seconds > 0 && seconds <= 7 * 24 * 3600 ? seconds : undefined;
}

/** The text shown for a new timer: `10 min`, `1 h 30`. */
function timerText(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (!h) return `${m} min`;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

/** Inserts a timer link at `position` in a step (the cursor of its text field). */
export function insertTimer(
  raw: string,
  position: number,
  seconds: number,
  label: string,
): { raw: string; cursor: number } {
  const at = Math.max(0, Math.min(position, raw.length));
  const link = timerLink(timerText(seconds), seconds, label);
  const before = raw.slice(0, at);
  const after = raw.slice(at);
  const space = before && !/\s$/.test(before) ? ' ' : '';
  const next = `${before}${space}${link}${after && !/^\s/.test(after) ? ' ' : ''}${after}`;
  return { raw: next, cursor: before.length + space.length + link.length };
}

/**
 * Marks the selected text (`2 c. à soupe`) as a quantity that follows the servings. Undefined if
 * the selection is empty or already part of a link.
 */
export function markQuantity(raw: string, start: number, end: number): string | undefined {
  const selected = raw.slice(start, end);
  if (!selected.trim() || /[[\]()]/.test(selected)) return undefined;
  return `${raw.slice(0, start)}${quantityLink(selected)}${raw.slice(end)}`;
}

/** Timers and quantities of a step, shown as chips under its text field. */
export type StepChip =
  | { segment: number; kind: 'timer'; text: string; label: string; seconds: number }
  | { segment: number; kind: 'quantity'; text: string };

export function stepChips(raw: string): StepChip[] {
  return parseInline(raw, unitIndex()).segments.flatMap((segment, index): StepChip[] => {
    if (segment.kind === 'timer') {
      return [
        {
          segment: index,
          kind: 'timer',
          text: segment.text,
          label: segment.label,
          seconds: segment.seconds,
        },
      ];
    }
    if (segment.kind === 'quantity')
      return [{ segment: index, kind: 'quantity', text: segment.text }];
    return [];
  });
}

/** The step with one timer changed (duration and label; its text follows the duration). */
export function updateTimer(raw: string, segment: number, seconds: number, label: string): string {
  const segments = parseInline(raw, unitIndex()).segments.map((s, index) =>
    index === segment && s.kind === 'timer'
      ? { ...s, text: timerText(seconds), seconds, label: label.trim() || timerText(seconds) }
      : s,
  );
  return stepFromSegments(segments);
}

/** The step with one timer or quantity turned back into plain text. */
export function unlinkSegment(raw: string, segment: number): string {
  const segments = parseInline(raw, unitIndex()).segments.map((s, index) =>
    index === segment ? { kind: 'text' as const, text: s.text } : s,
  );
  return stepFromSegments(segments);
}
