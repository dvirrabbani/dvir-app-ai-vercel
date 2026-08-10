'use client';

/**
 * The menu behind the day log: the dishes you eat often, and the chips that put
 * one of them into the day with a single tap.
 *
 * The panel is the whole menu at once rather than one per card — a dish moves
 * between the morning, noon and the evening by its tags, and three separate
 * editors would hide that from you. The chips are the other half of it, and they
 * live down inside each part of the day where the eating is written down.
 */

import { useCallback, useState } from 'react';
import { Plus, Salad, Trash2 } from 'lucide-react';
import { DAY_PARTS, DAY_PART_LABELS, DayPart } from '@/lib/day-parts';
import { DISH_MAX_LENGTH, Dish, addDish, deleteDish, updateDish } from '@/lib/diet';
import { SmallButton, inlineFieldClass } from '@/components/routines/shared';

/** Literal greys: `text-muted-foreground` resolves to nothing in this project. */
const MUTED = 'text-[#4B5563] dark:text-[#9CA3AF]';

/* -------------------------------------------------------------------------- */
/*  Tapping a dish into the day                                               */
/* -------------------------------------------------------------------------- */

/**
 * What is on the menu for this stretch of the day. Tapping one writes it down at
 * the time in the field below, which is the whole point of keeping the list: the
 * meal you eat every morning should not be typed out every morning.
 */
export function DishChips({ dishes, onPick }: { dishes: Dish[]; onPick: (name: string) => void }) {
  if (dishes.length === 0) return null;

  return (
    <div className="mb-1.5 flex flex-wrap gap-1">
      {dishes.map((dish) => (
        <button
          key={dish.id}
          type="button"
          onClick={() => onPick(dish.name)}
          title={`Write down ${dish.name}`}
          className="inline-flex max-w-full items-center gap-1 rounded-full border border-gray-200 bg-white/60 px-2 py-0.5 text-xs text-[#1C1C1E] transition-colors hover:border-[#FF4D8E]/50 hover:text-[#D81B60] dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:text-[#FF9EC1]"
        >
          <Plus className="h-3 w-3 shrink-0" aria-hidden />
          <span dir="auto" className="min-w-0 truncate">
            {dish.name}
          </span>
        </button>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Editing the menu                                                          */
/* -------------------------------------------------------------------------- */

/** One of the three stretches, ticked on a dish or not. */
function PartToggle({ part, on, onClick }: { part: DayPart; on: boolean; onClick: () => void }) {
  const label = DAY_PART_LABELS[part];

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      title={on ? `Not ${label.toLowerCase()}` : label}
      className={`h-6 w-6 shrink-0 rounded-full border text-xs font-semibold transition-colors ${
        on
          ? 'border-transparent bg-[#D81B60] text-white hover:bg-[#B0154E]'
          : `border-gray-300 hover:border-[#FF4D8E] dark:border-white/20 ${MUTED}`
      }`}
    >
      {label.charAt(0)}
    </button>
  );
}

/**
 * A dish on the menu: its name, when it is eaten, and the bin. The name commits
 * when you leave the field or press Enter — a write per keystroke would go to
 * storage forty times for one word.
 */
function DishRow({ dish, onError }: { dish: Dish; onError: (message: string) => void }) {
  const [draft, setDraft] = useState(dish.name);

  // The stored name can move without this row touching it — another tab, or the
  // rename below being refused — so the draft follows it when it does.
  const [known, setKnown] = useState(dish.name);
  if (known !== dish.name) {
    setKnown(dish.name);
    setDraft(dish.name);
  }

  const commit = useCallback(() => {
    const name = draft.trim();
    if (!name || name === dish.name) {
      setDraft(dish.name);
      return;
    }

    if (!updateDish(dish.id, { name })) {
      setDraft(dish.name);
      onError('That is already on the menu.');
    }
  }, [dish.id, dish.name, draft, onError]);

  const toggle = useCallback(
    (part: DayPart) => {
      const parts = dish.parts.includes(part)
        ? dish.parts.filter((each) => each !== part)
        : [...dish.parts, part];

      updateDish(dish.id, { parts });
    },
    [dish.id, dish.parts]
  );

  return (
    <li className="flex flex-wrap items-center gap-1.5 rounded-lg bg-black/[0.03] p-1.5 dark:bg-white/[0.04]">
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        dir="auto"
        maxLength={DISH_MAX_LENGTH}
        aria-label={`Rename ${dish.name}`}
        className={`${inlineFieldClass} min-w-32 flex-1 px-2 py-1`}
      />

      <span className="flex shrink-0 items-center gap-1">
        {DAY_PARTS.map((part) => (
          <PartToggle key={part} part={part} on={dish.parts.includes(part)} onClick={() => toggle(part)} />
        ))}
      </span>

      <SmallButton title={`Take ${dish.name} off the menu`} destructive onClick={() => deleteDish(dish.id)}>
        <Trash2 className="h-3.5 w-3.5" />
      </SmallButton>
    </li>
  );
}

/**
 * The whole menu, opened from the day's heading. It sits above the three cards
 * because it is not about any one of them: a dish is tagged here and turns up as
 * a chip in whichever stretches it was tagged for.
 */
export function DietMenuPanel({ menu }: { menu: Dish[] }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleAdd = useCallback(() => {
    if (!name.trim()) {
      setError('What is the dish?');
      return;
    }

    if (!addDish({ name })) {
      setError('That is already on the menu, or the menu is full.');
      return;
    }

    setName('');
    setError(null);
  }, [name]);

  return (
    <div className="mb-4 rounded-xl border border-black/[0.06] p-3 dark:border-white/[0.08]">
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <Salad className="h-4 w-4 shrink-0 text-[#FF4D8E]" aria-hidden />
        <h4 className="text-sm font-semibold text-foreground">Your menu</h4>
        {menu.length > 0 && (
          <span className={`text-xs tabular-nums ${MUTED}`}>
            {menu.length} dish{menu.length === 1 ? '' : 'es'}
          </span>
        )}
      </div>

      {menu.length > 0 ? (
        <ul className="mb-2 space-y-1.5">
          {menu.map((dish) => (
            <DishRow key={dish.id} dish={dish} onError={setError} />
          ))}
        </ul>
      ) : (
        <p className={`mb-2 text-xs ${MUTED}`}>
          Nothing on the menu yet. Add what you eat often here, or write down a meal below and keep it.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAdd();
            }
          }}
          dir="auto"
          maxLength={DISH_MAX_LENGTH}
          placeholder="A dish you eat often"
          aria-label="A dish to put on the menu"
          className={`${inlineFieldClass} min-w-40 flex-1 px-3 py-1.5 text-sm`}
        />
        <button
          type="button"
          onClick={handleAdd}
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#D81B60] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#B0154E]"
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </button>
      </div>

      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}

      <p className={`mt-2 text-xs ${MUTED}`}>
        M, N and E are the stretches a dish is eaten at. One with none of them picked is eaten at any hour and shows
        under all three.
      </p>
    </div>
  );
}
