'use client';

import { useMemo, useState } from 'react';
import { CalendarDays, CalendarRange, Check, Clock, Repeat, Settings2, ShoppingBasket, Sun } from 'lucide-react';
import { WEEKDAY_LABELS, formatDayTitle, formatMonthTitle, fromDateKey, monthGrid, toDateKey } from '@/lib/calendar';
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
  bumpTask,
  describeDays,
  formatSince,
  occurrencesOn,
  progressOf,
  setStockState,
  shoppingList,
  stockStateOf,
} from '@/lib/routines';
import { useRoutines } from '@/lib/use-routines';
import { NewRoutineForm, RoutineEditor } from '@/components/calendar/routine-editor';
import { cardClass } from '@/components/calendar/shared';

/**
 * How a day's progress reads at a glance. Complete is green, unfinished is amber
 * once the day has arrived and neutral while it is still ahead — nothing is
 * behind if it has not come round yet. Each pair clears 4.5:1 on the card in
 * both themes, the bar the event chips on this page had to meet.
 */
function progressClass(done: number, total: number, future: boolean): string {
  if (total === 0) return 'text-muted-foreground';
  if (done === total) return 'bg-[rgba(16,185,129,0.16)] text-[#065F46] dark:bg-[rgba(52,211,153,0.2)] dark:text-[#6EE7B7]';
  if (future) return 'bg-black/[0.06] text-foreground/70 dark:bg-white/10';
  return 'bg-[rgba(245,158,11,0.2)] text-[#92400E] dark:bg-[rgba(251,191,36,0.2)] dark:text-[#FCD34D]';
}

/** Have is settled, low is a warning, buy is the one that needs acting on. */
const STOCK_CLASS: Record<StockState, string> = {
  have: 'bg-[rgba(16,185,129,0.16)] text-[#065F46] dark:bg-[rgba(52,211,153,0.2)] dark:text-[#6EE7B7]',
  low: 'bg-[rgba(245,158,11,0.2)] text-[#92400E] dark:bg-[rgba(251,191,36,0.2)] dark:text-[#FCD34D]',
  need: 'bg-[rgba(220,38,38,0.14)] text-[#B91C1C] dark:bg-[rgba(248,113,113,0.2)] dark:text-[#FCA5A5]',
};

const timeClass = 'text-[#4338CA] dark:text-[#A5B4FC]';

/* -------------------------------------------------------------------------- */
/*  A checklist task                                                          */
/* -------------------------------------------------------------------------- */

function TaskRow({ occurrence, locked }: { occurrence: TaskOccurrence; locked: boolean }) {
  const { routine, group, task, date, count, target, done, total } = occurrence;
  const repeated = target > 1;

  // The group heading already carries its time; a task only shows one of its own
  // when it departs from that, so a 08:00 group is not stamped on every line.
  const time = task.time && task.time !== group.time ? task.time : '';

  return (
    <li className="flex items-center gap-3 rounded-xl bg-black/[0.03] p-3 dark:bg-white/[0.04]">
      <button
        type="button"
        disabled={locked}
        onClick={() => bumpTask(routine.id, task.id, date)}
        aria-pressed={done}
        aria-label={
          repeated
            ? `${task.title}, ${count} of ${target} done${locked ? '' : done ? '. Clear' : '. Add one'}`
            : `${done ? 'Untick' : 'Tick off'} ${task.title}`
        }
        title={
          locked
            ? 'This day has not come round yet'
            : done
              ? `Clear ${task.title}`
              : repeated
                ? `Add one to ${task.title}`
                : `Tick off ${task.title}`
        }
        className={`inline-flex shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular-nums transition-colors ${
          repeated ? 'h-6 min-w-10 px-1.5' : 'h-6 w-6'
        } ${
          done
            // Emerald-700 rather than -600: a repeated task shows "3/3" as white
            // text in here, and the lighter green only reached 3.8:1 behind it.
            ? 'border-transparent bg-[#047857] text-white hover:bg-[#036B4B]'
            : count > 0
              ? 'border-transparent bg-[rgba(245,158,11,0.25)] text-[#92400E] dark:bg-[rgba(251,191,36,0.25)] dark:text-[#FCD34D]'
              : repeated
                // A repeated task reads "0/4" from the start, so the number needs
                // a colour of its own. Only the single-tick variant keeps its
                // check hidden until it is earned. The greys are literal because
                // `text-muted-foreground` resolves to nothing in this project.
                ? 'border-gray-300 text-[#4B5563] dark:border-white/20 dark:text-[#9CA3AF]'
                : 'border-gray-300 text-transparent dark:border-white/20'
        } ${locked ? 'cursor-not-allowed opacity-50' : !done && count === 0 ? 'hover:border-[#FF4D8E] hover:text-[#FF4D8E]' : ''}`}
      >
        {repeated ? `${count}/${target}` : <Check className="h-3.5 w-3.5" />}
      </button>

      {time && (
        <span className={`inline-flex shrink-0 items-center gap-1 text-xs tabular-nums ${timeClass}`}>
          <Clock className="h-3 w-3" />
          {time}
        </span>
      )}

      <span
        dir="auto"
        className={`min-w-0 flex-1 truncate text-sm ${done ? 'text-muted-foreground line-through' : 'font-medium text-foreground'}`}
      >
        {task.title}
      </span>

      {/* Everything this task has clocked up since it was added — the number
          that says a habit is actually holding, rather than just today. */}
      {total > 0 && (
        <span
          className="shrink-0 text-xs tabular-nums text-[#6B7280] dark:text-[#9CA3AF]"
          title={`Done ${total} time${total === 1 ? '' : 's'} since ${formatSince(task.createdAt)}`}
        >
          {total}
        </span>
      )}
    </li>
  );
}

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
/*  Calendar strips                                                           */
/* -------------------------------------------------------------------------- */

function DayCell({
  date,
  routines,
  cadence,
  today,
  selected,
  onSelect,
  showWeekday,
  dimmed,
}: {
  date: Date;
  routines: Routine[];
  cadence: RoutineCadence;
  today: string;
  selected: string;
  onSelect: (key: string) => void;
  showWeekday?: boolean;
  dimmed?: boolean;
}) {
  const key = toDateKey(date);
  const { total, done } = progressOf(occurrencesOn(routines, cadence, date));
  const isSelected = key === selected;
  const isToday = key === today;

  return (
    <button
      type="button"
      onClick={() => onSelect(key)}
      aria-pressed={isSelected}
      aria-label={`${formatDayTitle(key)}${total ? `, ${done} of ${total} done` : ', nothing scheduled'}`}
      className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-1.5 transition-colors ${
        dimmed ? 'text-muted-foreground/50' : 'text-foreground'
      } ${isSelected ? 'border-[#FF4D8E] bg-[#FF4D8E]/[0.08]' : 'border-transparent hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'}`}
    >
      {showWeekday && (
        <span className="text-[10px] font-medium uppercase text-muted-foreground md:text-xs">
          {WEEKDAY_LABELS[date.getDay()]}
        </span>
      )}
      <span
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${
          isToday ? 'font-semibold text-white' : 'font-medium'
        }`}
        style={isToday ? { backgroundColor: '#FF4D8E' } : undefined}
      >
        {date.getDate()}
      </span>
      <span
        className={`rounded-full px-1.5 text-[10px] font-medium leading-4 tabular-nums ${progressClass(done, total, key > today)}`}
      >
        {total === 0 ? '·' : `${done}/${total}`}
      </span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Regions                                                                   */
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

function RegionHeader({
  icon,
  title,
  subtitle,
  done,
  total,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  done: number;
  total: number;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="flex items-center gap-2">
        {icon}
        <h3 className="text-base font-semibold text-foreground md:text-lg">{title}</h3>
      </span>
      <span className="text-sm text-muted-foreground">{subtitle}</span>
      {total > 0 && (
        <span className={`ml-auto rounded-full px-2.5 py-1 text-xs font-medium tabular-nums ${progressClass(done, total, false)}`}>
          {done} of {total} done
        </span>
      )}
    </div>
  );
}

function DayRegion({ routines, selected, today }: { routines: Routine[]; selected: string; today: string }) {
  const groups = useMemo(() => occurrencesOn(routines, 'daily', fromDateKey(selected)), [routines, selected]);
  const { done, total } = progressOf(groups);

  return (
    <section className={`${cardClass} mb-4`}>
      <RegionHeader
        icon={<Sun className="h-5 w-5 text-[#FF4D8E]" />}
        title="Every day"
        subtitle={formatDayTitle(selected)}
        done={done}
        total={total}
      />

      <DayView
        groups={groups}
        locked={selected > today}
        emptyLabel={
          routines.length === 0
            ? 'No daily routines yet — a medicine round, split into a morning and an evening group, would go here.'
            : 'These routines have no items yet. Add some in the setup below.'
        }
      />

      <ManageArea cadence="daily" routines={routines} placeholder="A routine for every day" />
    </section>
  );
}

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

  const label = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <section className={`${cardClass} mb-4`}>
      <RegionHeader
        icon={<CalendarRange className="h-5 w-5 text-[#FF4D8E]" />}
        title="Every week"
        subtitle={`${label(days[0])} – ${label(days[6])}`}
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
/*  The section                                                               */
/* -------------------------------------------------------------------------- */

/** Kept out of the component so the memo above depends only on the day key. */
function weekDaysOf(selected: string): Date[] {
  const date = fromDateKey(selected);
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay());
  return Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

export function RoutinesSection({ selected, onSelect }: { selected: string; onSelect: (key: string) => void }) {
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
    <div className="mb-10">
      <div className="mb-4 flex items-center gap-2">
        <Repeat className="h-5 w-5 text-[#FF4D8E]" />
        <h2 className="text-lg font-semibold text-foreground md:text-xl">Routines</h2>
        <ShoppingBasket className="ml-1 h-4 w-4 text-muted-foreground" aria-hidden />
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        The things that come round again, kept apart by how often. A routine holds groups — a morning and an evening
        round, an upper and a lower body session — and each group can sit on its own days. Picking a day anywhere on
        this page moves all three regions.
      </p>

      <DayRegion routines={byCadence.daily} selected={selected} today={today} />
      <WeekRegion routines={byCadence.weekly} selected={selected} today={today} onSelect={onSelect} />
      <MonthRegion routines={byCadence.monthly} selected={selected} today={today} onSelect={onSelect} />
    </div>
  );
}
