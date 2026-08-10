'use client';

/**
 * The bits every part of the routines page draws with. They started out inside
 * the section that sat under the calendar; they live here so the day view, the
 * week strip and the editor cannot drift into looking like three pages.
 */

import { Check, Clock } from 'lucide-react';
import { WEEKDAY_LABELS, formatDayTitle, toDateKey } from '@/lib/calendar';
import {
  Routine,
  RoutineCadence,
  TaskOccurrence,
  bumpTask,
  formatSince,
  occurrencesOn,
  progressOf,
} from '@/lib/routines';

/**
 * The width is kept off the base so a field sitting in a row can be sized by the
 * row instead. `w-full` cannot simply be overridden with `w-auto` further down a
 * class list — Tailwind decides between them by where they land in the sheet,
 * not by the order they are written in.
 */
const FIELD_BASE =
  'rounded-xl border border-gray-200 bg-white/60 px-4 py-2.5 text-sm text-[#1C1C1E] outline-none transition-colors placeholder:text-gray-500 focus:border-[#FF4D8E]/50 focus:ring-2 focus:ring-[#FF4D8E]/20 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-gray-400';

export const fieldClass = `w-full ${FIELD_BASE}`;

/** The same field with no width of its own, for one sitting inside a line. */
export const inlineFieldClass = FIELD_BASE;

/**
 * A native time or date input paints its own glyph and picker from the colour
 * scheme, which stays light — and unreadable on the dark card — without this.
 * The same treatment the milestones page gives its date fields.
 */
export const timeFieldClass = `${FIELD_BASE} [color-scheme:light] dark:[color-scheme:dark]`;

export const cardClass =
  'rounded-2xl border border-white/30 bg-white/60 p-5 backdrop-blur-md dark:border-white/10 dark:bg-white/5 md:p-6';

/** Indigo rather than the brand pink: pink on a pale card came out at 2.3:1. */
export const timeClass = 'text-[#4338CA] dark:text-[#A5B4FC]';

/**
 * How a day's progress reads at a glance. Complete is green, unfinished is amber
 * once the day has arrived and neutral while it is still ahead — nothing is
 * behind if it has not come round yet. Each pair clears 4.5:1 on the card in
 * both themes, the bar the calendar's event chips had to meet.
 */
export function progressClass(done: number, total: number, future: boolean): string {
  if (total === 0) return 'text-muted-foreground';
  if (done === total) return 'bg-[rgba(16,185,129,0.16)] text-[#065F46] dark:bg-[rgba(52,211,153,0.2)] dark:text-[#6EE7B7]';
  if (future) return 'bg-black/[0.06] text-foreground/70 dark:bg-white/10';
  return 'bg-[rgba(245,158,11,0.2)] text-[#92400E] dark:bg-[rgba(251,191,36,0.2)] dark:text-[#FCD34D]';
}

export function IconButton({
  title,
  onClick,
  children,
  destructive,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`rounded-full p-2 text-muted-foreground transition-colors ${
        destructive
          ? 'hover:bg-destructive/10 hover:text-destructive'
          : 'hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10'
      }`}
    >
      {children}
    </button>
  );
}

/** The line at the top of each region: what it covers, and how it is going. */
export function RegionHeader({
  icon,
  title,
  subtitle,
  done = 0,
  total = 0,
  aside,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  done?: number;
  total?: number;
  /** Put at the end of the line instead of the tally, for a region not counting one. */
  aside?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="flex items-center gap-2">
        {icon}
        <h3 className="text-base font-semibold text-foreground md:text-lg">{title}</h3>
      </span>
      <span className="text-sm text-muted-foreground">{subtitle}</span>
      {aside ? (
        <span className="ml-auto flex flex-wrap items-center gap-1">{aside}</span>
      ) : (
        total > 0 && (
          <span className={`ml-auto rounded-full px-2.5 py-1 text-xs font-medium tabular-nums ${progressClass(done, total, false)}`}>
            {done} of {total} done
          </span>
        )
      )}
    </div>
  );
}

/** A small neutral chip: a fact about the region rather than a score. */
export const factClass =
  'rounded-full bg-black/[0.06] px-2.5 py-1 text-xs font-medium tabular-nums text-foreground/70 dark:bg-white/10';

/** The pencil-sized button beside a heading, smaller than `IconButton`. */
export function SmallButton({
  title,
  onClick,
  children,
  active,
  destructive,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`rounded-full p-1.5 transition-colors hover:bg-black/5 dark:hover:bg-white/10 ${
        destructive
          ? 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
          : active
            ? 'text-[#FF4D8E]'
            : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

/** One day in a week strip or a month grid, with how much of it is done. */
export function DayCell({
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
/*  A checklist task                                                          */
/* -------------------------------------------------------------------------- */

export function TaskRow({
  occurrence,
  locked,
  showTime,
}: {
  occurrence: TaskOccurrence;
  locked: boolean;
  /**
   * Whether to show the time the task falls at whatever it came from. Under a
   * group heading that already carries the time it would only repeat it; in a
   * list gathered from several groups it is the only thing placing the task.
   */
  showTime?: boolean;
}) {
  const { routine, group, task, date, count, target, done, total } = occurrence;
  const repeated = target > 1;

  // The group heading already carries its time; a task only shows one of its own
  // when it departs from that, so a 08:00 group is not stamped on every line.
  const time = showTime ? occurrence.time : task.time && task.time !== group.time ? task.time : '';

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
