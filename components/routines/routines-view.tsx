'use client';

import { useMemo, useState } from 'react';
import {
  CalendarDays,
  CalendarRange,
  Check,
  Clock,
  Moon,
  Pencil,
  Settings2,
  ShoppingBasket,
  Sun,
  Sunrise,
} from 'lucide-react';
import { WEEKDAY_LABELS, formatDayTitle, formatMonthTitle, fromDateKey, monthGrid, toDateKey } from '@/lib/calendar';
import { DAY_PARTS, DAY_PART_HOURS, DAY_PART_LABELS, DayPart } from '@/lib/day-parts';
import {
  CADENCE_REGION_LABELS,
  GroupOccurrence,
  Routine,
  RoutineCadence,
  STOCK_FULL_LABELS,
  STOCK_LABELS,
  STOCK_STATES,
  StockState,
  TaskOccurrence,
  describeDays,
  gatherByGroup,
  occurrencesOn,
  progressOf,
  setStockState,
  shoppingList,
  splitByPart,
  stockStateOf,
} from '@/lib/routines';
import { useRoutines } from '@/lib/use-routines';
import { PartEditor } from '@/components/routines/part-editor';
import { NewRoutineForm, RoutineEditor } from '@/components/routines/routine-editor';
import {
  DayCell,
  RegionHeader,
  TaskRow,
  cardClass,
  progressClass,
  timeClass,
} from '@/components/routines/shared';

/** Have is settled, low is a warning, buy is the one that needs acting on. */
const STOCK_CLASS: Record<StockState, string> = {
  have: 'bg-[rgba(16,185,129,0.16)] text-[#065F46] dark:bg-[rgba(52,211,153,0.2)] dark:text-[#6EE7B7]',
  low: 'bg-[rgba(245,158,11,0.2)] text-[#92400E] dark:bg-[rgba(251,191,36,0.2)] dark:text-[#FCD34D]',
  need: 'bg-[rgba(220,38,38,0.14)] text-[#B91C1C] dark:bg-[rgba(248,113,113,0.2)] dark:text-[#FCA5A5]',
};

/* -------------------------------------------------------------------------- */
/*  A stock item                                                              */
/* -------------------------------------------------------------------------- */

function StockRow({ occurrence }: { occurrence: TaskOccurrence }) {
  const { routine, task } = occurrence;
  const state = stockStateOf(routine, task.id);

  return (
    <li className="flex items-center gap-3 rounded-xl bg-black/[0.03] p-3 dark:bg-white/[0.04]">
      <span
        dir="auto"
        className={`min-w-0 flex-1 truncate text-sm ${state === 'have' ? 'text-muted-foreground' : 'font-medium text-foreground'}`}
      >
        {task.title}
      </span>

      <span
        role="group"
        aria-label={`Stock level for ${task.title}`}
        className="inline-flex shrink-0 rounded-full border border-gray-200 p-0.5 dark:border-white/10"
      >
        {STOCK_STATES.map((candidate) => {
          const active = candidate === state;
          return (
            <button
              key={candidate}
              type="button"
              onClick={() => setStockState(routine.id, task.id, candidate)}
              aria-pressed={active}
              title={`${task.title}: ${STOCK_FULL_LABELS[candidate]}`}
              aria-label={`${task.title}: ${STOCK_FULL_LABELS[candidate]}`}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                active ? STOCK_CLASS[candidate] : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {STOCK_LABELS[candidate]}
            </button>
          );
        })}
      </span>
    </li>
  );
}

/** What to actually carry to the shop, gathered from the whole routine. */
function ShoppingSummary({ routine }: { routine: Routine }) {
  const wanted = shoppingList(routine);
  if (wanted.length === 0) {
    return (
      <p className={`mt-2 rounded-xl px-3 py-2 text-xs font-medium ${STOCK_CLASS.have}`}>
        Nothing to buy — everything is in.
      </p>
    );
  }

  return (
    <p className={`mt-2 rounded-xl px-3 py-2 text-xs ${STOCK_CLASS.need}`}>
      <span className="font-semibold">To buy ({wanted.length}):</span>{' '}
      <span dir="auto">{wanted.map((task) => task.title).join(', ')}</span>
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/*  A group                                                                   */
/* -------------------------------------------------------------------------- */

function GroupBlock({ occurrence, locked }: { occurrence: GroupOccurrence; locked: boolean }) {
  const { routine, group, tasks } = occurrence;
  const stock = routine.kind === 'stock';
  const dayLabel = describeDays(routine.cadence, group.days, WEEKDAY_LABELS);

  return (
    <div>
      {/* An unnamed group carrying no time of its own has nothing to say, so it
          renders as a plain list under the routine rather than an empty line. */}
      {(group.title || group.time || dayLabel) && (
        <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {group.title && (
            <span dir="auto" className="text-sm font-medium text-foreground/80">
              {group.title}
            </span>
          )}
          {group.time && (
            <span className={`inline-flex items-center gap-1 text-xs tabular-nums ${timeClass}`}>
              <Clock className="h-3 w-3" />
              {group.time}
            </span>
          )}
          {dayLabel && <span className="text-xs text-muted-foreground">{dayLabel}</span>}
        </div>
      )}

      {tasks.length === 0 ? (
        <p className="text-xs text-muted-foreground">No items yet.</p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((task) =>
            stock ? (
              <StockRow key={task.task.id} occurrence={task} />
            ) : (
              <TaskRow key={task.task.id} occurrence={task} locked={locked} />
            )
          )}
        </ul>
      )}
    </div>
  );
}

/**
 * One routine's groups for the day. The routine is named once above them, and a
 * stock list gets its shopping line once at the bottom rather than under every
 * group.
 */
function RoutineBlock({
  routine,
  groups,
  locked,
}: {
  routine: Routine;
  groups: GroupOccurrence[];
  locked: boolean;
}) {
  const stock = routine.kind === 'stock';
  const hasItems = groups.some((group) => group.tasks.length > 0);

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        {stock && <ShoppingBasket className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
        <span dir="auto" className="text-sm font-semibold text-foreground">
          {routine.title}
        </span>
      </div>

      <div className="space-y-3">
        {groups.map((occurrence) => (
          <GroupBlock key={occurrence.group.id} occurrence={occurrence} locked={locked} />
        ))}
      </div>

      {stock && hasItems && <ShoppingSummary routine={routine} />}
    </div>
  );
}

function DayView({
  groups,
  locked,
  emptyLabel,
}: {
  groups: GroupOccurrence[];
  locked: boolean;
  emptyLabel: string;
}) {
  // Groups arrive sorted by time; gathering them by routine keeps each routine
  // together, positioned where its earliest group falls.
  const blocks = useMemo(() => {
    const byRoutine = new Map<string, { routine: Routine; groups: GroupOccurrence[] }>();

    for (const occurrence of groups) {
      const block = byRoutine.get(occurrence.routine.id);
      if (block) block.groups.push(occurrence);
      else byRoutine.set(occurrence.routine.id, { routine: occurrence.routine, groups: [occurrence] });
    }

    return [...byRoutine.values()];
  }, [groups]);

  if (blocks.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-5">
      {blocks.map((block) => (
        <RoutineBlock key={block.routine.id} routine={block.routine} groups={block.groups} locked={locked} />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Setup                                                                     */
/* -------------------------------------------------------------------------- */

function ManageArea({
  cadence,
  routines,
  placeholder,
}: {
  cadence: RoutineCadence;
  routines: Routine[];
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-4 border-t border-black/[0.06] pt-4 dark:border-white/[0.08]">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
      >
        <Settings2 className="h-3.5 w-3.5" />
        {open ? 'Hide setup' : `Set up ${CADENCE_REGION_LABELS[cadence].toLowerCase()} routines`}
        {routines.length > 0 && ` (${routines.length})`}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <NewRoutineForm cadence={cadence} label={placeholder} />
          {routines.map((routine) => (
            <RoutineEditor key={routine.id} routine={routine} />
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Every day, split into morning, noon and evening                           */
/* -------------------------------------------------------------------------- */

const PART_ICONS: Record<DayPart, typeof Sun> = {
  morning: Sunrise,
  noon: Sun,
  evening: Moon,
};

/**
 * One stretch of the day: everything falling in it, read down the clock. Each
 * part is edited on its own — the pencil swaps the tick list for the tasks as
 * things to rename, re-time or remove, and a form that adds to this part.
 */
function PartBlock({
  part,
  tasks,
  locked,
  routines,
}: {
  part: DayPart;
  tasks: TaskOccurrence[];
  locked: boolean;
  /** The daily tick-off routines, which is what the editor adds to. */
  routines: Routine[];
}) {
  const [editing, setEditing] = useState(false);
  const Icon = PART_ICONS[part];
  const done = tasks.filter((task) => task.done).length;
  const label = DAY_PART_LABELS[part];
  const blocks = useMemo(() => gatherByGroup(tasks), [tasks]);

  return (
    <div className="rounded-xl border border-black/[0.06] p-3 dark:border-white/[0.08]">
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <Icon className="h-4 w-4 shrink-0 text-[#FF4D8E]" aria-hidden />
        <h4 className="text-sm font-semibold text-foreground">{DAY_PART_LABELS[part]}</h4>
        <span className="text-xs tabular-nums text-muted-foreground">{DAY_PART_HOURS[part]}</span>

        <span className="ml-auto flex shrink-0 items-center gap-1">
          {tasks.length > 0 && !editing && (
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ${progressClass(done, tasks.length, locked)}`}
            >
              {done}/{tasks.length}
            </span>
          )}
          <button
            type="button"
            onClick={() => setEditing((prev) => !prev)}
            aria-expanded={editing}
            title={editing ? `Done editing ${label}` : `Edit ${label}`}
            aria-label={editing ? `Done editing ${label}` : `Edit ${label}`}
            className={`rounded-full p-1.5 transition-colors hover:bg-black/5 dark:hover:bg-white/10 ${
              editing ? 'text-[#FF4D8E]' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {editing ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
          </button>
        </span>
      </div>

      {editing ? (
        <PartEditor part={part} tasks={tasks} routines={routines} />
      ) : tasks.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nothing here yet.</p>
      ) : (
        <div className="space-y-3">
          {blocks.map((block) => (
            <div key={`${block.routine.id}-${block.group.id}`}>
              {/* A named sitting is called out above its tasks; an unnamed group
                  is only there to hold them, so it renders as a plain list. */}
              {block.group.title && (
                <p dir="auto" className="mb-1 text-xs font-medium text-foreground/80">
                  {block.group.title}
                </p>
              )}
              <ul className="space-y-2">
                {block.tasks.map((task) => (
                  <TaskRow key={task.task.id} occurrence={task} locked={locked} showTime />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DayRegion({
  routines,
  selected,
  today,
  onSelect,
}: {
  routines: Routine[];
  selected: string;
  today: string;
  onSelect: (key: string) => void;
}) {
  const days = useMemo(() => weekDaysOf(selected), [selected]);

  // A stock list holds a standing state rather than something done at a time of
  // day, so it stays out of the three parts and keeps its own list below.
  const checklists = useMemo(() => routines.filter((routine) => routine.kind === 'checklist'), [routines]);
  const stocks = useMemo(() => routines.filter((routine) => routine.kind === 'stock'), [routines]);

  const parts = useMemo(
    () => splitByPart(occurrencesOn(checklists, 'daily', fromDateKey(selected))),
    [checklists, selected]
  );
  const stockGroups = useMemo(
    () => occurrencesOn(stocks, 'daily', fromDateKey(selected)),
    [stocks, selected]
  );

  // The whole week's tally, so the header answers "how is the week going".
  const week = useMemo(() => {
    let done = 0;
    let total = 0;
    for (const day of days) {
      const progress = progressOf(occurrencesOn(routines, 'daily', day));
      done += progress.done;
      total += progress.total;
    }
    return { done, total };
  }, [days, routines]);

  const day = useMemo(() => progressOf(occurrencesOn(routines, 'daily', fromDateKey(selected))), [routines, selected]);

  const locked = selected > today;
  const nothingYet = routines.length === 0;

  return (
    <section className={`${cardClass} mb-4`}>
      <RegionHeader
        icon={<Sun className="h-5 w-5 text-[#FF4D8E]" />}
        title="Every day, this week"
        subtitle={`${weekLabel(days[0])} – ${weekLabel(days[6])}`}
        done={week.done}
        total={week.total}
      />

      <div dir="ltr" className="mb-4 grid grid-cols-7 gap-1">
        {days.map((date) => (
          <DayCell
            key={toDateKey(date)}
            date={date}
            routines={routines}
            cadence="daily"
            today={today}
            selected={selected}
            onSelect={onSelect}
            showWeekday
          />
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h4 dir="auto" className="text-sm font-medium text-foreground">
          {formatDayTitle(selected)}
        </h4>
        {day.total > 0 && (
          <span
            className={`ml-auto rounded-full px-2.5 py-1 text-xs font-medium tabular-nums ${progressClass(day.done, day.total, locked)}`}
          >
            {day.done} of {day.total} done
          </span>
        )}
      </div>

      {nothingYet ? (
        <p className="text-sm text-muted-foreground">
          No daily routines yet — a medicine round, split into a morning and an evening group, would go here.
        </p>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            {DAY_PARTS.map((part) => (
              <PartBlock key={part} part={part} tasks={parts[part]} locked={locked} routines={checklists} />
            ))}
          </div>

          {/* Anything without a time of its own has nothing placing it on the
              clock, which is worth saying once rather than per task. */}
          <p className="mt-2 text-xs text-muted-foreground">
            Tasks are placed by their own time, or their group&apos;s. Anything untimed sits in the morning. The pencil
            on a part edits just that stretch of the day.
          </p>

          {stockGroups.length > 0 && (
            <div className="mt-4 space-y-5 border-t border-black/[0.06] pt-4 dark:border-white/[0.08]">
              <DayView groups={stockGroups} locked={locked} emptyLabel="No stock lists on this day." />
            </div>
          )}
        </>
      )}

      <ManageArea cadence="daily" routines={routines} placeholder="A routine for every day" />
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Every week, every month                                                   */
/* -------------------------------------------------------------------------- */

function WeekRegion({
  routines,
  selected,
  today,
  onSelect,
}: {
  routines: Routine[];
  selected: string;
  today: string;
  onSelect: (key: string) => void;
}) {
  const days = useMemo(() => weekDaysOf(selected), [selected]);
  const groups = useMemo(() => occurrencesOn(routines, 'weekly', fromDateKey(selected)), [routines, selected]);

  // The whole week's tally, so the header answers "how is the week going".
  const week = useMemo(() => {
    let done = 0;
    let total = 0;
    for (const day of days) {
      const progress = progressOf(occurrencesOn(routines, 'weekly', day));
      done += progress.done;
      total += progress.total;
    }
    return { done, total };
  }, [days, routines]);

  return (
    <section className={`${cardClass} mb-4`}>
      <RegionHeader
        icon={<CalendarRange className="h-5 w-5 text-[#FF4D8E]" />}
        title="Every week"
        subtitle={`${weekLabel(days[0])} – ${weekLabel(days[6])}`}
        done={week.done}
        total={week.total}
      />

      <div dir="ltr" className="mb-4 grid grid-cols-7 gap-1">
        {days.map((day) => (
          <DayCell
            key={toDateKey(day)}
            date={day}
            routines={routines}
            cadence="weekly"
            today={today}
            selected={selected}
            onSelect={onSelect}
            showWeekday
          />
        ))}
      </div>

      <DayView
        groups={groups}
        locked={selected > today}
        emptyLabel={
          routines.length === 0
            ? 'No weekly routines yet — a training week split into upper and lower body sessions would go here.'
            : 'Nothing falls on this day. Pick another, or change the days in the setup below.'
        }
      />

      <ManageArea cadence="weekly" routines={routines} placeholder="A routine for certain weekdays" />
    </section>
  );
}

function MonthRegion({
  routines,
  selected,
  today,
  onSelect,
}: {
  routines: Routine[];
  selected: string;
  today: string;
  onSelect: (key: string) => void;
}) {
  // Derived together from the one string, so the grid and its labels cannot
  // disagree about which month is on screen.
  const { days, year, month } = useMemo(() => {
    const date = fromDateKey(selected);
    const gridYear = date.getFullYear();
    const gridMonth = date.getMonth();
    return { days: monthGrid(gridYear, gridMonth), year: gridYear, month: gridMonth };
  }, [selected]);

  const groups = useMemo(() => occurrencesOn(routines, 'monthly', fromDateKey(selected)), [routines, selected]);

  const monthTotal = useMemo(() => {
    let done = 0;
    let total = 0;
    for (const day of days) {
      if (day.getMonth() !== month) continue;
      const progress = progressOf(occurrencesOn(routines, 'monthly', day));
      done += progress.done;
      total += progress.total;
    }
    return { done, total };
  }, [days, month, routines]);

  return (
    <section className={`${cardClass} mb-4`}>
      <RegionHeader
        icon={<CalendarDays className="h-5 w-5 text-[#FF4D8E]" />}
        title="Every month"
        subtitle={formatMonthTitle(year, month)}
        done={monthTotal.done}
        total={monthTotal.total}
      />

      <div dir="ltr" className="mb-1 grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="py-1 text-center text-[10px] font-medium uppercase text-muted-foreground md:text-xs">
            {label}
          </div>
        ))}
      </div>

      <div dir="ltr" className="mb-4 grid grid-cols-7 gap-1">
        {days.map((day) => (
          <DayCell
            key={toDateKey(day)}
            date={day}
            routines={routines}
            cadence="monthly"
            today={today}
            selected={selected}
            onSelect={onSelect}
            dimmed={day.getMonth() !== month}
          />
        ))}
      </div>

      <DayView
        groups={groups}
        locked={selected > today}
        emptyLabel={
          routines.length === 0
            ? 'No monthly routines yet — the transfer you make on the 10th would go here.'
            : 'Nothing falls on this day. Pick another, or change the days in the setup below.'
        }
      />

      <ManageArea cadence="monthly" routines={routines} placeholder="A routine for certain days of the month" />
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  The page body                                                             */
/* -------------------------------------------------------------------------- */

/** Kept out of the components so their memos depend only on the day key. */
function weekDaysOf(selected: string): Date[] {
  const date = fromDateKey(selected);
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay());
  return Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

function weekLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function RoutinesView({ selected, onSelect }: { selected: string; onSelect: (key: string) => void }) {
  const { byCadence, today, hydrated } = useRoutines();

  if (!hydrated) {
    return (
      <section className={`${cardClass} mb-10`}>
        <div className="h-6 w-32 animate-pulse rounded bg-foreground/10" aria-hidden />
        <div className="mt-4 h-24 animate-pulse rounded-xl bg-foreground/5" aria-hidden />
      </section>
    );
  }

  return (
    <div>
      <DayRegion routines={byCadence.daily} selected={selected} today={today} onSelect={onSelect} />
      <WeekRegion routines={byCadence.weekly} selected={selected} today={today} onSelect={onSelect} />
      <MonthRegion routines={byCadence.monthly} selected={selected} today={today} onSelect={onSelect} />
    </div>
  );
}
