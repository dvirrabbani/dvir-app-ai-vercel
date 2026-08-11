'use client';

/**
 * One day written down: when you got up, what you ate, every trip to the
 * bathroom, when you went to sleep — split into the same three stretches as
 * everything else on the site, and everything placed by its own time.
 *
 * This is the editor only, not the card around it. It sits under the routines
 * page's *Your day* heading for the one day picked there, and it opens again
 * under any day in the range on `app/routines/summary` — a week read back is
 * also where you notice that Tuesday's bedtime never got written down, and
 * having to go back and re-pick the day to fix it is the thing that stops it
 * being fixed. Both write through `lib/lifestyle.ts`, so a day mended in the
 * summary is the same day the routines page shows.
 */

import { useCallback, useState } from 'react';
import { Bed, Check, Droplets, Moon, Plus, Salad, Sun, Sunrise, Trash2, Utensils } from 'lucide-react';
import {
  DAY_PARTS,
  DAY_PART_HOURS,
  DAY_PART_LABELS,
  DAY_PART_WHEN,
  DayPart,
  defaultTimeFor,
} from '@/lib/day-parts';
import {
  DayLog,
  ENTRY_MAX_LENGTH,
  LifestyleEntry,
  addMeal,
  addVisit,
  deleteMeal,
  deleteVisit,
  entriesInPart,
  setSleptAt,
  setWokeAt,
  updateMeal,
  updateVisit,
} from '@/lib/lifestyle';
import { addDish, dishesForPart, isOnMenu } from '@/lib/diet';
import { useDietMenu } from '@/lib/use-diet';
import { DishChips } from '@/components/routines/diet-menu';
import { SmallButton, fieldClass, timeClass, timeFieldClass } from '@/components/routines/shared';

const PART_ICONS: Record<DayPart, typeof Sun> = {
  morning: Sunrise,
  noon: Sun,
  evening: Moon,
};

/* -------------------------------------------------------------------------- */
/*  The pieces of a part                                                      */
/* -------------------------------------------------------------------------- */

/** Getting up and going to sleep: one time each, kept on the day rather than listed. */
function TimeField({
  icon,
  label,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (time: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-lg bg-black/[0.03] px-2.5 py-1.5 text-xs font-medium text-muted-foreground dark:bg-white/[0.04]">
      {icon}
      <span className="min-w-0 flex-1">{label}</span>
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className={`${timeFieldClass} shrink-0 px-2 py-1`}
      />
    </label>
  );
}

function SubHeading({ icon, title, count }: { icon: React.ReactNode; title: string; count: number }) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5">
      {icon}
      <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h5>
      {count > 0 && <span className="text-xs tabular-nums text-muted-foreground">· {count}</span>}
    </div>
  );
}

/**
 * Something already written down: clicking it opens the same fields again, so a
 * meal can be corrected or a visit re-timed, and the bin removes it outright.
 * Re-timing is also how an entry moves to another part of the day.
 */
function EntryRow({
  entry,
  label,
  withText,
  onSave,
  onRemove,
}: {
  entry: LifestyleEntry;
  /** What this row is, for the buttons to name. */
  label: string;
  /** Meals say what they were; a bathroom visit is only ever a time. */
  withText?: boolean;
  /** True when it took, which is what closes the row again. */
  onSave: (changes: { time: string; what: string }) => boolean;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [what, setWhat] = useState(entry.what);
  const [time, setTime] = useState(entry.time);

  const startEditing = useCallback(() => {
    setWhat(entry.what);
    setTime(entry.time);
    setEditing(true);
  }, [entry.time, entry.what]);

  const save = useCallback(() => {
    if (onSave({ time, what })) setEditing(false);
  }, [onSave, time, what]);

  if (editing) {
    return (
      <li className="rounded-lg bg-black/[0.03] p-2 dark:bg-white/[0.04]">
        {withText && (
          <input
            value={what}
            onChange={(e) => setWhat(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                save();
              }
            }}
            dir="auto"
            autoFocus
            maxLength={ENTRY_MAX_LENGTH}
            aria-label={`Change ${label}`}
            className={`${fieldClass} px-2 py-1.5`}
          />
        )}

        <div className={`flex flex-wrap items-center gap-1.5 ${withText ? 'mt-1.5' : ''}`}>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            aria-label={`Time of ${label}`}
            className={`${timeFieldClass} min-w-0 flex-1 px-2 py-1`}
          />
          <button
            type="button"
            onClick={save}
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#FF4D8E] px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-[#FF4D8E]/90"
          >
            <Check className="h-3.5 w-3.5" />
            Save
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="shrink-0 rounded-full px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-black/5 dark:hover:bg-white/10"
          >
            Cancel
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-1 rounded-lg bg-black/[0.03] py-1 pl-2.5 pr-1 dark:bg-white/[0.04]">
      <button
        type="button"
        onClick={startEditing}
        title={`Change ${label}`}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span className={`shrink-0 text-xs tabular-nums ${timeClass}`}>{entry.time}</span>
        {entry.what && (
          <span dir="auto" className="min-w-0 flex-1 truncate text-sm text-foreground hover:text-[#FF4D8E]">
            {entry.what}
          </span>
        )}
      </button>

      <SmallButton title={`Remove ${label}`} destructive onClick={onRemove}>
        <Trash2 className="h-3.5 w-3.5" />
      </SmallButton>
    </li>
  );
}

/** What was eaten, which is the one thing here that needs saying in words. */
function MealBlock({
  date,
  part,
  now,
  meals,
}: {
  date: string;
  part: DayPart;
  /** Today's clock when the day on screen is today, so lunch logs at lunchtime. */
  now: Date | null;
  meals: LifestyleEntry[];
}) {
  const label = DAY_PART_LABELS[part];
  const { menu, hydrated } = useDietMenu();
  const [what, setWhat] = useState('');
  const [time, setTime] = useState(() => defaultTimeFor(part, now ?? undefined));
  const [error, setError] = useState<string | null>(null);

  /** Writing a meal down, whether it was typed out or tapped off the menu. */
  const write = useCallback(
    (text: string) => {
      if (!addMeal(date, { time, what: text })) {
        setError(text.trim() ? 'That is as much as one day holds.' : 'What did you eat?');
        return false;
      }

      setError(null);
      return true;
    },
    [date, time]
  );

  const handleAdd = useCallback(() => {
    if (write(what)) setWhat('');
  }, [what, write]);

  // Something typed out that is not on the menu yet can be kept there, tagged
  // with this stretch of the day — which is how the menu fills up at all.
  const keepable = hydrated && what.trim().length > 0 && !isOnMenu(menu, what);

  return (
    <div>
      <SubHeading
        icon={<Utensils className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />}
        title="Ate"
        count={meals.length}
      />

      {meals.length > 0 && (
        <ul className="mb-1.5 space-y-1.5">
          {meals.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              label={entry.what}
              withText
              onSave={(changes) => updateMeal(date, entry.id, changes)}
              onRemove={() => deleteMeal(date, entry.id)}
            />
          ))}
        </ul>
      )}

      {hydrated && <DishChips dishes={dishesForPart(menu, part)} onPick={write} />}

      <input
        value={what}
        onChange={(e) => {
          setWhat(e.target.value);
          if (error) setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleAdd();
          }
        }}
        dir="auto"
        maxLength={ENTRY_MAX_LENGTH}
        placeholder="What did you eat?"
        aria-label={`What you ate ${DAY_PART_WHEN[part]}`}
        className={fieldClass}
      />

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          aria-label={`Time of the ${label.toLowerCase()} meal`}
          className={`${timeFieldClass} min-w-0 flex-1 px-2 py-1.5`}
        />
        <button
          type="button"
          onClick={handleAdd}
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#FF4D8E] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#FF4D8E]/90"
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </button>
        {keepable && (
          <button
            type="button"
            onClick={() => addDish({ name: what, parts: [part] })}
            title={`Keep ${what.trim()} on the menu`}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-[#1C1C1E] transition-colors hover:border-[#FF4D8E]/40 dark:border-white/10 dark:text-white"
          >
            <Salad className="h-3.5 w-3.5" />
            Keep
          </button>
        )}
      </div>

      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** Trips to the bathroom, which are only ever a time and a count of them. */
function BathroomBlock({
  date,
  part,
  now,
  visits,
}: {
  date: string;
  part: DayPart;
  now: Date | null;
  visits: LifestyleEntry[];
}) {
  const label = DAY_PART_LABELS[part];
  const [time, setTime] = useState(() => defaultTimeFor(part, now ?? undefined));

  return (
    <div className="mt-3">
      <SubHeading
        icon={<Droplets className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />}
        title="Bathroom"
        count={visits.length}
      />

      {visits.length > 0 && (
        <ul className="mb-1.5 space-y-1.5">
          {visits.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              label={`the ${entry.time} visit`}
              onSave={(changes) => updateVisit(date, entry.id, changes.time)}
              onRemove={() => deleteVisit(date, entry.id)}
            />
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          aria-label={`Time of the ${label.toLowerCase()} visit`}
          className={`${timeFieldClass} min-w-0 flex-1 px-2 py-1.5`}
        />
        <button
          type="button"
          onClick={() => addVisit(date, time)}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-[#FF4D8E]/40 dark:border-white/10"
        >
          <Plus className="h-3.5 w-3.5" />
          Log
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  One part of the day                                                       */
/* -------------------------------------------------------------------------- */

function PartLog({ part, date, log, now }: { part: DayPart; date: string; log: DayLog; now: Date | null }) {
  const Icon = PART_ICONS[part];

  return (
    <div className="rounded-xl border border-black/[0.06] p-3 dark:border-white/[0.08]">
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <Icon className="h-4 w-4 shrink-0 text-[#FF4D8E]" aria-hidden />
        <h4 className="text-sm font-semibold text-foreground">{DAY_PART_LABELS[part]}</h4>
        <span className="text-xs tabular-nums text-muted-foreground">{DAY_PART_HOURS[part]}</span>
      </div>

      {/* The two ends of the day sit at the two ends of the card: getting up at
          the top of the morning, going to sleep at the bottom of the evening. */}
      {part === 'morning' && (
        <div className="mb-3">
          <TimeField
            icon={<Sunrise className="h-3.5 w-3.5 shrink-0" aria-hidden />}
            label="Got up at"
            value={log.wokeAt}
            onChange={(time) => setWokeAt(date, time)}
          />
        </div>
      )}

      <MealBlock date={date} part={part} now={now} meals={entriesInPart(log.meals, part)} />
      <BathroomBlock date={date} part={part} now={now} visits={entriesInPart(log.bathroom, part)} />

      {part === 'evening' && (
        <div className="mt-3">
          <TimeField
            icon={<Bed className="h-3.5 w-3.5 shrink-0" aria-hidden />}
            label="Went to sleep at"
            value={log.sleptAt}
            onChange={(time) => setSleptAt(date, time)}
          />
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  The whole day                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The three parts of one day, side by side where there is room for them. Every
 * change is written straight to storage against `date` — there is no save
 * button, and nothing here holds a draft of the day.
 */
export function DayLogEditor({
  date,
  log,
  now,
  /** Narrow places (a row opened inside a list) keep the parts stacked. */
  columns = 3,
}: {
  date: string;
  log: DayLog;
  now: Date | null;
  columns?: 1 | 3;
}) {
  return (
    <div className={`grid gap-3 ${columns === 3 ? 'md:grid-cols-3' : ''}`}>
      {DAY_PARTS.map((part) => (
        <PartLog key={part} part={part} date={date} log={log} now={now} />
      ))}
    </div>
  );
}
