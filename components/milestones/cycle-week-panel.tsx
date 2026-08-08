'use client';

/**
 * Sunday to Saturday of the week we are in, gathering what every milestone on a
 * cycle asks for rather than one card's worth.
 *
 * Each card further down the page is one milestone's own reckoning, which is the
 * wrong shape for the question actually asked most days — what is there to do on
 * Tuesday. This sits at the top of the page for that reason. Within a day the
 * tasks stay grouped under the milestone they came from, so "two runs and a
 * pill" does not read as one undifferentiated list.
 *
 * Ticking here writes where the cards write, so the two never disagree.
 */

import { useMemo } from 'react';
import { CalendarDays, Check, Minus, Plus } from 'lucide-react';
import { formatRange } from '@/lib/milestones';
import {
  CycleTask,
  MilestoneCycle,
  WeekDay,
  countFor,
  formatDayKey,
  formatShortRange,
  isTaskDoneOn,
  stepCycleCount,
  toggleCycleDone,
  weekPlan,
} from '@/lib/milestone-cycles';
import { useMilestoneCycles } from '@/lib/use-milestone-cycles';
import { StepButton, cardClass } from '@/components/milestones/shared';

/**
 * Reads its own data, so the page can drop it in without wiring anything.
 *
 * Nothing is rendered before hydration or when no milestone runs on a cycle at
 * all. A skeleton would be worse than nothing here: this panel is allowed not
 * to exist, so holding space for it would leave a gap on most visits.
 */
export function CycleWeekPanel() {
  const { cycles, today, hydrated } = useMilestoneCycles();

  if (!hydrated || cycles.length === 0) return null;
  return <WeekPanel cycles={cycles} today={today} />;
}

function WeekPanel({ cycles, today }: { cycles: MilestoneCycle[]; today: string }) {
  const days = useMemo(() => weekPlan(cycles, today), [cycles, today]);
  if (days.length === 0) return null;

  const done = days.reduce((sum, day) => sum + day.done, 0);
  const total = days.reduce((sum, day) => sum + day.total, 0);

  return (
    <section className={`${cardClass} mb-6`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground md:text-lg">
          <CalendarDays className="h-4 w-4 text-[#FF4D8E]" />
          This week
        </h2>
        <span className="text-xs text-muted-foreground">
          {formatRange({ start: days[0].key, end: days[days.length - 1].key })}
          {total > 0 && ` · ${done} of ${total} done`}
        </span>
      </div>

      {total === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing falls in this week. The milestones on a cycle further down either have not started, have
          finished, or put their tasks on other days.
        </p>
      ) : (
        <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {days.map((day) => (
            <WeekColumn key={day.key} day={day} />
          ))}
        </ol>
      )}
    </section>
  );
}

function WeekColumn({ day }: { day: WeekDay }) {
  const complete = day.total > 0 && day.done >= day.total;

  return (
    <li
      className={`rounded-xl border p-2 ${
        day.isToday
          ? 'border-[#6366F1]/40 bg-[#6366F1]/10'
          : 'border-black/[0.06] bg-black/[0.02] dark:border-white/[0.08] dark:bg-white/[0.02]'
      }`}
    >
      <div className="mb-1.5 flex items-baseline justify-between gap-1">
        <span
          className={`text-xs font-medium ${
            day.isToday ? 'text-[#312E81] dark:text-[#C7D2FE]' : 'text-muted-foreground'
          }`}
        >
          {day.weekday} {day.dayOfMonth}
        </span>
        {day.total > 0 && (
          <span
            className={`text-[10px] tabular-nums ${
              complete ? 'text-[#047857] dark:text-[#6EE7B7]' : 'text-muted-foreground'
            }`}
          >
            {day.done}/{day.total}
          </span>
        )}
      </div>

      {day.groups.length === 0 ? (
        <p className="text-xs text-muted-foreground/70">—</p>
      ) : (
        <div className="space-y-2">
          {day.groups.map((group) => (
            <div key={group.cycle.id}>
              {/* Which milestone these belong to. Truncated rather than wrapped:
                  the name is context, and the task under it is the point. */}
              <p
                dir="auto"
                title={group.cycle.title}
                className="truncate text-[10px] uppercase tracking-wide text-muted-foreground"
              >
                {group.cycle.title}
              </p>
              {/* How long that milestone runs, which the week alone cannot say.
                  The full dates are on hover, since d/m is not read the same way
                  everywhere. */}
              <p
                title={`${group.cycle.title}: ${formatRange(group.cycle.range)}`}
                className="mb-0.5 text-[10px] tabular-nums text-muted-foreground/70"
              >
                {formatShortRange(group.cycle.range)}
              </p>
              <ul className="space-y-1">
                {group.tasks.map((task) => (
                  <WeekTask key={task.id} cycle={group.cycle} task={task} dayKey={day.key} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

function WeekTask({ cycle, task, dayKey }: { cycle: MilestoneCycle; task: CycleTask; dayKey: string }) {
  const count = countFor(task, dayKey);
  const ticked = isTaskDoneOn(task, dayKey);
  const repeats = task.target > 1;

  return (
    <li>
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          onClick={() => toggleCycleDone(cycle.id, task.id, dayKey)}
          aria-pressed={ticked}
          aria-label={`${ticked ? 'Untick' : 'Tick off'} ${task.title} in ${cycle.title} on ${formatDayKey(
            dayKey
          )}${repeats ? `, ${count} of ${task.target} done` : ''}`}
          title={`${ticked ? 'Untick' : 'Tick off'} ${task.title}`}
          className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
            ticked
              ? 'border-transparent bg-[#047857] text-white hover:bg-[#036B4B]'
              : count > 0
                ? 'border-[#047857] text-transparent hover:border-[#036B4B]'
                : 'border-gray-300 text-transparent hover:border-[#FF4D8E] dark:border-white/20'
          }`}
        >
          {ticked ? (
            <Check className="h-3 w-3" />
          ) : count > 0 ? (
            <span className="h-1.5 w-1.5 rounded-[1px] bg-[#047857]" />
          ) : (
            <Check className="h-3 w-3" />
          )}
        </button>

        <span
          dir="auto"
          title={task.title}
          className={`min-w-0 flex-1 break-words text-xs leading-snug ${
            ticked ? 'text-muted-foreground line-through' : 'text-foreground'
          }`}
        >
          {task.title}
        </span>
      </div>

      {/* On its own line rather than beside the name — a seven-column week has
          no width to spare for a stepper next to the text. */}
      {repeats && (
        <div className="ms-5 mt-0.5 flex items-center gap-0.5">
          <span
            className={`me-0.5 text-[10px] tabular-nums ${
              ticked ? 'text-[#047857] dark:text-[#6EE7B7]' : 'text-muted-foreground'
            }`}
          >
            {count} / {task.target}
          </span>
          <StepButton
            title={`One fewer ${task.title} on ${formatDayKey(dayKey)}`}
            onClick={() => stepCycleCount(cycle.id, task.id, dayKey, -1)}
            disabled={count <= 0}
          >
            <Minus className="h-2.5 w-2.5" />
          </StepButton>
          <StepButton
            title={`One more ${task.title} on ${formatDayKey(dayKey)}`}
            onClick={() => stepCycleCount(cycle.id, task.id, dayKey, 1)}
            disabled={ticked}
          >
            <Plus className="h-2.5 w-2.5" />
          </StepButton>
        </div>
      )}
    </li>
  );
}
