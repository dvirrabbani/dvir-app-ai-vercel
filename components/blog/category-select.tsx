'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, ChevronDown, Pencil, Plus, Settings2, Trash2, X } from 'lucide-react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  CATEGORY_COLORS,
  CATEGORY_NAME_MAX_LENGTH,
  CategoryResult,
  PostCategory,
  addCategory,
  categoryUsage,
  deleteCategory,
  getCategoryColor,
  renameCategory,
  setCategoryColor,
} from '@/lib/categories';
import { useCategories } from '@/lib/use-categories';

interface CategorySelectProps {
  value: string;
  onChange: (category: string) => void;
  id?: string;
  className?: string;
}

const rowClass =
  'relative flex select-none items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-[#1C1C1E] dark:text-white';

/** Says what went wrong in the same words the action was asked in. */
function describe(result: CategoryResult, name: string): string | null {
  switch (result) {
    case 'ok':
      return null;
    case 'empty':
      return 'Give the category a name.';
    case 'duplicate':
      return `There is already a category called “${name}”.`;
    case 'full':
      return 'That is as many categories as the list holds.';
    case 'in-use':
      return `${categoryUsage(name)} post${categoryUsage(name) === 1 ? '' : 's'} still filed under “${name}”. Move them first.`;
    default:
      return 'That category is no longer there.';
  }
}

/** The swatches a category can be coloured, shown as a row of dots. */
function ColorRow({ selected, onPick }: { selected: string; onPick: (color: string) => void }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {CATEGORY_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onPick(color)}
          aria-label={`Colour ${color}`}
          aria-pressed={color === selected}
          className={cn(
            'size-5 rounded-full border-2 transition-transform hover:scale-110',
            color === selected ? 'border-[#1C1C1E] dark:border-white' : 'border-transparent'
          )}
          style={{ backgroundColor: color }}
        />
      ))}
    </span>
  );
}

function EditableRow({
  category,
  onDone,
}: {
  category: PostCategory;
  /** `close` is false for a change that should leave the row open to keep editing. */
  onDone: (message: string | null, close: boolean) => void;
}) {
  const [name, setName] = useState(category.name);

  const commit = useCallback(() => {
    if (name.trim() === category.name) return;
    onDone(describe(renameCategory(category.id, name), name.trim()), true);
  }, [category.id, category.name, name, onDone]);

  const usage = categoryUsage(category.name);

  return (
    <div className={cn(rowClass, 'flex-col items-stretch gap-2 bg-black/[0.03] dark:bg-white/[0.05]')}>
      <span className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          // Radix listens for typing to jump between items; without this the
          // menu swallows the keystrokes meant for this field.
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
          }}
          onBlur={commit}
          dir="auto"
          autoFocus
          maxLength={CATEGORY_NAME_MAX_LENGTH}
          aria-label={`Rename ${category.name}`}
          className="min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-sm outline-none focus:border-[#FF4D8E]/50 dark:border-white/10 dark:bg-white/10"
        />
        <button
          type="button"
          onClick={() => onDone(describe(deleteCategory(category.id), category.name), true)}
          title={usage > 0 ? `${usage} post${usage === 1 ? '' : 's'} use this` : `Remove ${category.name}`}
          aria-label={`Remove ${category.name}`}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </button>
      </span>

      {/* Recolouring leaves the row open, so a name and a colour can be changed
          in one visit rather than having to come back for the second. */}
      <ColorRow
        selected={category.color}
        onPick={(color) => onDone(describe(setCategoryColor(category.id, color), category.name), false)}
      />
    </div>
  );
}

/**
 * A native <select> draws its option list through the operating system, which
 * ignores CSS for hover and selected states. This is the same control built from
 * the menu primitive so every option is legible and highlights as you move over it.
 *
 * It also edits the list: the categories are the author's, stored rather than
 * written into the source, so adding, renaming, recolouring and removing all
 * happen here where they are chosen.
 *
 * Colours are written out rather than taken from the `bg-popover` / `text-foreground`
 * tokens: those are declared in globals.css as bare HSL channels, which Tailwind v4
 * cannot use as colours, so they resolve to nothing (a transparent popover). The rest
 * of the blog UI works around this the same way.
 */
export function CategorySelect({ value, onChange, id, className }: CategorySelectProps) {
  const { categories, hydrated } = useCategories();
  const [managing, setManaging] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(CATEGORY_COLORS[0]);
  const [message, setMessage] = useState<string | null>(null);

  // A post with no category yet takes the first one on the list.
  useEffect(() => {
    if (!value && categories.length > 0) onChange(categories[0].name);
  }, [categories, onChange, value]);

  const finish = useCallback((problem: string | null, close: boolean) => {
    setMessage(problem);
    if (!problem && close) setEditingId(null);
  }, []);

  const handleAdd = useCallback(() => {
    const result = addCategory(newName, newColor);
    setMessage(describe(result, newName.trim()));
    if (result === 'ok') setNewName('');
  }, [newColor, newName]);

  const label = value || (hydrated ? 'Choose a category' : '…');

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) {
          setManaging(false);
          setEditingId(null);
          setMessage(null);
        }
      }}
    >
      <DropdownMenuTrigger
        id={id}
        className={cn(
          'group flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm outline-none transition-colors',
          'border border-gray-200 bg-white/60 text-[#1C1C1E] dark:border-white/10 dark:bg-white/5 dark:text-white',
          'hover:border-[#FF4D8E]/40',
          'focus-visible:border-[#FF4D8E]/50 focus-visible:ring-2 focus-visible:ring-[#FF4D8E]/20',
          'data-[state=open]:border-[#FF4D8E]/50 data-[state=open]:ring-2 data-[state=open]:ring-[#FF4D8E]/20',
          className
        )}
      >
        <span className="flex items-center gap-2.5">
          <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: getCategoryColor(value) }} />
          <span className="font-medium">{label}</span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-gray-500 transition-transform duration-200 group-data-[state=open]:rotate-180 dark:text-gray-400" />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        // Width matches the trigger so the list reads as one control, and the
        // surface is fully opaque so option text never sits over the page behind it.
        className={cn(
          'max-h-[70vh] w-(--radix-dropdown-menu-trigger-width) overflow-y-auto rounded-xl p-1.5 shadow-2xl',
          'border border-gray-200 bg-white dark:border-white/10 dark:bg-[#1C1C1E]'
        )}
      >
        {managing ? (
          <div className="space-y-1">
            {categories.map((category) =>
              editingId === category.id ? (
                <EditableRow key={category.id} category={category} onDone={finish} />
              ) : (
                <div key={category.id} className={cn(rowClass, 'justify-between')}>
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
                    <span dir="auto" className="truncate">
                      {category.name}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setMessage(null);
                      setEditingId(category.id);
                    }}
                    title={`Edit ${category.name}`}
                    aria-label={`Edit ${category.name}`}
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-black/5 hover:text-[#FF4D8E] dark:hover:bg-white/10"
                  >
                    <Pencil className="size-4" />
                  </button>
                </div>
              )
            )}

            <div className="mt-1 space-y-2 border-t border-gray-200 pt-2 dark:border-white/10">
              <span className="flex items-center gap-2 px-1">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAdd();
                    }
                  }}
                  dir="auto"
                  maxLength={CATEGORY_NAME_MAX_LENGTH}
                  placeholder="New category"
                  aria-label="New category name"
                  className="min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-sm outline-none focus:border-[#FF4D8E]/50 dark:border-white/10 dark:bg-white/10"
                />
                <button
                  type="button"
                  onClick={handleAdd}
                  aria-label="Add category"
                  className="inline-flex items-center gap-1 rounded-md bg-[#FF4D8E] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#FF4D8E]/90"
                >
                  <Plus className="size-3.5" />
                  Add
                </button>
              </span>
              <span className="block px-1">
                <ColorRow selected={newColor} onPick={setNewColor} />
              </span>
            </div>

            {message && <p className="px-1 pt-1 text-xs text-destructive">{message}</p>}

            <button
              type="button"
              onClick={() => {
                setManaging(false);
                setEditingId(null);
                setMessage(null);
              }}
              className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-black/5 dark:hover:bg-white/10"
            >
              <X className="size-4" />
              Done editing
            </button>
          </div>
        ) : (
          <>
            <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
              {categories.map((category) => {
                const selected = category.name === value;

                return (
                  <DropdownMenuPrimitive.RadioItem
                    key={category.id}
                    value={category.name}
                    className={cn(
                      // `category-option` carries the hover and selected states; see globals.css.
                      'category-option cursor-pointer outline-none transition-colors',
                      rowClass
                    )}
                    // Inline, so the selected row keeps its colour even while hovered.
                    style={selected ? { backgroundColor: `${category.color}33` } : undefined}
                  >
                    <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
                    <span dir="auto" className="flex-1 truncate">
                      {category.name}
                    </span>
                    {selected && <Check className="size-4 shrink-0" style={{ color: category.color }} />}
                  </DropdownMenuPrimitive.RadioItem>
                );
              })}
            </DropdownMenuRadioGroup>

            {categories.length === 0 && hydrated && (
              <p className="px-3 py-2 text-sm text-muted-foreground">No categories yet.</p>
            )}

            <DropdownMenuPrimitive.Item
              // Kept open: this swaps the menu over to editing rather than choosing.
              onSelect={(event) => {
                event.preventDefault();
                setManaging(true);
              }}
              className={cn(
                'mt-1 cursor-pointer border-t border-gray-200 pt-2.5 text-muted-foreground outline-none',
                'hover:text-[#FF4D8E] focus:text-[#FF4D8E] dark:border-white/10',
                rowClass
              )}
            >
              <Settings2 className="size-4" />
              Edit categories
            </DropdownMenuPrimitive.Item>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
