import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, EllipsisVertical, GripVertical, Plus, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import type { EditorGroup } from '../model/editor';
import type { Part } from '../model/editor-actions';
import { IngredientRowEditor } from './IngredientRowEditor';
import { StepRowEditor } from './StepRowEditor';
import type { EditorVm } from './VisualEditor';

/**
 * Groups of one part (ingredients or steps). Groups and rows are reordered by drag and drop (a
 * row can go to another group of the same part) or with the "move up / down" menu items, which
 * also work with a keyboard or a screen reader.
 */
export function GroupsEditor({ vm, part }: { vm: EditorVm; part: Part }) {
  const { t } = useTranslation();
  const groups = part === 'ingredients' ? vm.recipe.ingredientGroups : vm.recipe.stepGroups;
  const sensors = useSensors(
    // A short move before dragging: taps on the fields still work on touch screens.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const groupIndex = groups.findIndex((group) => group.id === overId);
    if (groups.some((group) => group.id === activeId)) {
      if (groupIndex >= 0)
        vm.dispatch({ type: 'moveGroup', part, groupId: activeId, toIndex: groupIndex });
      return;
    }
    // A row dropped on a row (its place) or on a group (its end).
    if (groupIndex >= 0) {
      const target = groups[groupIndex];
      if (target) {
        vm.dispatch({
          type: 'moveRow',
          part,
          rowId: activeId,
          toGroupId: target.id,
          toIndex: target.rows.length,
        });
      }
      return;
    }
    for (const group of groups) {
      const index = group.rows.findIndex((row) => row.id === overId);
      if (index >= 0) {
        vm.dispatch({
          type: 'moveRow',
          part,
          rowId: activeId,
          toGroupId: group.id,
          toIndex: index,
        });
        return;
      }
    }
  };

  const title = part === 'ingredients' ? t('recipes.ingredients') : t('recipes.steps');

  return (
    <section className="grid gap-4" aria-label={title}>
      <h2 className="text-lg font-semibold">{title}</h2>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext
          items={groups.map((group) => group.id)}
          strategy={verticalListSortingStrategy}
        >
          {groups.map((group, index) => (
            <GroupEditor
              key={group.id}
              vm={vm}
              part={part}
              group={group}
              first={index === 0}
              last={index === groups.length - 1}
            />
          ))}
        </SortableContext>
      </DndContext>
      <Button
        variant="outline"
        className="justify-self-start"
        onClick={() => vm.dispatch({ type: 'addGroup', part })}
      >
        <Plus /> {t('recipes.editor.addGroup')}
      </Button>
    </section>
  );
}

function GroupEditor({
  vm,
  part,
  group,
  first,
  last,
}: {
  vm: EditorVm;
  part: Part;
  group: EditorGroup;
  first: boolean;
  last: boolean;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: group.id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`${part}-group`}
      className="grid min-w-0 gap-2 rounded-lg border bg-card p-3"
    >
      <div className="flex items-center gap-1">
        <DragHandle
          label={t('recipes.editor.dragGroup')}
          attributes={attributes}
          listeners={listeners}
        />
        <Input
          aria-label={t('recipes.editor.groupName')}
          placeholder={
            first ? t('recipes.editor.groupNameOptional') : t('recipes.editor.groupName')
          }
          className="h-10 min-w-0 flex-1 font-medium"
          value={group.name ?? ''}
          onChange={(event) =>
            vm.dispatch({ type: 'renameGroup', part, groupId: group.id, name: event.target.value })
          }
        />
        <ItemMenu
          label={t('recipes.editor.groupActions')}
          canUp={!first}
          canDown={!last}
          onUp={() => vm.dispatch({ type: 'shiftGroup', part, groupId: group.id, direction: -1 })}
          onDown={() => vm.dispatch({ type: 'shiftGroup', part, groupId: group.id, direction: 1 })}
          onDelete={() => vm.dispatch({ type: 'removeGroup', part, groupId: group.id })}
          deleteLabel={t('recipes.editor.deleteGroup')}
        />
      </div>
      <SortableContext
        items={group.rows.map((row) => row.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul className="grid gap-2">
          {group.rows.map((row, index) => {
            // A row moves across groups; only the very first and very last cannot move further.
            const moves = {
              canUp: !first || index > 0,
              canDown: !last || index < group.rows.length - 1,
            };
            return (
              <SortableRow key={row.id} id={row.id}>
                {(handle) =>
                  part === 'ingredients' ? (
                    <IngredientRowEditor vm={vm} row={row} handle={handle} {...moves} />
                  ) : (
                    <StepRowEditor vm={vm} row={row} handle={handle} {...moves} />
                  )
                }
              </SortableRow>
            );
          })}
        </ul>
      </SortableContext>
      <Button
        variant="ghost"
        size="sm"
        className="justify-self-start"
        onClick={() => vm.dispatch({ type: 'addRow', part, groupId: group.id })}
      >
        <Plus />{' '}
        {part === 'ingredients' ? t('recipes.editor.addIngredient') : t('recipes.editor.addStep')}
      </Button>
    </div>
  );
}

type Sortable = ReturnType<typeof useSortable>;

function SortableRow({ id, children }: { id: string; children: (handle: ReactNode) => ReactNode }) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <li ref={setNodeRef} style={style} className="min-w-0">
      {children(
        <DragHandle
          label={t('recipes.editor.dragRow')}
          attributes={attributes}
          listeners={listeners}
        />,
      )}
    </li>
  );
}

function DragHandle({
  label,
  attributes,
  listeners,
}: {
  label: string;
  attributes: Sortable['attributes'];
  listeners: Sortable['listeners'];
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="size-4" />
    </button>
  );
}

/** Move up / down and delete, for a group or a row. */
export function ItemMenu({
  label,
  canUp,
  canDown,
  onUp,
  onDown,
  onDelete,
  deleteLabel,
}: {
  label: string;
  canUp: boolean;
  canDown: boolean;
  onUp: () => void;
  onDown: () => void;
  onDelete: () => void;
  deleteLabel: string;
}) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} className="shrink-0">
          <EllipsisVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={!canUp} onSelect={onUp}>
          <ArrowUp /> {t('recipes.editor.moveUp')}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!canDown} onSelect={onDown}>
          <ArrowDown /> {t('recipes.editor.moveDown')}
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 /> {deleteLabel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
