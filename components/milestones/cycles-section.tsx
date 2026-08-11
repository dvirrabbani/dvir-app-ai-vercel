'use client';

/**
 * The third section of the milestones page: the ones that run on a cycle.
 *
 * A date range plus a repeat — a week, a fortnight, a month — and a handful of
 * tasks pinned to particular days of it. The card shows one turn at a time so
 * the list stays the length of a week rather than the length of the whole range,
 * and the bar counts every occurrence between the two dates.
 */

import { useCallback, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, ChevronLeft, ChevronRight, Minus, Pencil, Plus, Repeat, Trash2 } from 'lucide-react';
import { toDateKey } from '@/lib/calendar';
import { normaliseRange } from '@/lib/milestones';
import {
  CYCLE_KINDS,
  CYCLE_LABELS,
  CYCLE_SHORT_LABELS,
  CycleKind,
  CycleTask,
  CycleTurn,
  DESCRIPTION_MAX_LENGTH,
  DayChoice,
  MAX_TASKS_PER_CYCLE,
  MAX_TIMES_PER_DAY,
  MilestoneCycle,
  TASK_TITLE_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  TURN_LABELS,
  addCycleTask,
  addMilestoneCycle,
  countFor,
  cycleProgress,
  cycleTurns,
  currentTurnIndex,
  dayChoices,
  dayLabel,
  deleteCycleTask,
  deleteMilestoneCycle,
  formatDayKey,
  isCycleComplete,
  isTaskDoneOn,
  planForTurn,
  renameCycleTask,
  setCycleDayDone,
  setCycleTaskTarget,
  stepCycleCount,
  toggleCycleDone,
  toggleCycleTaskDay,
  updateMilestoneCycle,
} from '@/lib/milestone-cycles';
import { useMilestoneCycles } from '@/lib/use-milestone-cycles';
import {
  DONE_COLOR,
  EmptyPanel,
  IconButton,
  PROGRESS_COLOR,
  RangeMeter,
  StepButton,
  cardClass,
  dateFieldClass,
  fieldClass,
} from '@/components/milestones/shared';

/** Filled rather than tinted: a picked day has to read as picked at a glance. */
const pickedDayClass = 'border-transparent bg-[#4F46E5] text-white hover:bg-[#4338CA]';
const unpickedDayClass =
  'border-gray-200 text-muted-foreground hover:border-[#4F46E5]/50 hover:text-foreground dark:border-white/10';

export function CyclesSection() {
  const { cycles, summary, hydrated } = useMilestoneCycles();

  return (
    <section className="mt-10 pb-16 md:mt-14 md:pb-24">
      <header className="mb-4 border-t border-black/[0.06] pt-8 dark:border-white/[0.08]">
        <h2 className="flex items-center gap-2 text-xl font-semibold text-foreground md:text-2xl">
          <Repeat className="h-5 w-5 text-[#FF4D8E]" />
          On a cycle
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Milestones that repeat: a stretch of days, a cycle of a week, two weeks or a month, and the tasks
          that come back on the same days of every turn.
          {hydrated && summary.total > 0 && (
            <>
              {' '}
              <span className="text-foreground">
                {summary.active} running
                {summary.dueToday > 0
                  ? `, ${summary.doneToday} of ${summary.dueToday} done today.`
                  : '. Nothing due today.'}
              </span>
            </>
          )}
        </p>
      </header>

      {/* The week that gathers all of these lives at the top of the page, not
          here — it is read daily, and this section is where they get set up. */}
      <CycleForm />

      <div className="space-y-4">
        {!hydrated ? (
          <div className="h-56 animate-pulse rounded-2xl bg-foreground/5" aria-hidden />
        ) : cycles.length === 0 ? (
          <EmptyPanel title="Nothing on a cycle yet">
            Add one above — say eight weeks of training, then a task on the Monday and Thursday of each week.
          </EmptyPanel>
        ) : (
          cycles.map((item, index) => <CycleCard key={item.id} item={item} index={index} />)
        )}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Creating                                                                  */
/* -------------------------------------------------------------------------- */

function CycleForm() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [cycle, setCycle] = useState<CycleKind>('week');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleAdd = useCallback(() => {
    if (!(start && end)) {
      setError('Pick both a start and an end date.');
      return;
    }

    // Checked before saving, so a typed-in day that is not real never becomes a
    // milestone whose dates were quietly dropped.
    const range = normaliseRange({ start, end });
    if (!range) {
      setError('Those dates did not look like real days.');
      return;
    }

    if (!addMilestoneCycle({ title, description, cycle, range })) {
      setError('Give it a name first.');
      return;
    }

    setTitle('');
    setDescription('');
    setStart('');
    setEnd('');
    setError(null);
  }, [cycle, description, end, start, title]);

  return (
    <section className={`${cardClass} mb-6`}>
      <div className="mb-4 flex items-center gap-2">
        <Repeat className="h-5 w-5 text-[#FF4D8E]" />
        <h2 className="text-lg font-semibold text-foreground md:text-xl">New milestone on a cycle</h2>
      </div>

      <div className="space-y-3">
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAdd();
            }
          }}
          dir="auto"
          maxLength={TITLE_MAX_LENGTH}
          placeholder="What are you keeping up?"
          aria-label="Name"
          className={fieldClass}
        />

        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          dir="auto"
          rows={3}
          maxLength={DESCRIPTION_MAX_LENGTH}
          placeholder="Notes, as long as you like — line breaks are kept (optional)"
          aria-label="Notes"
          className={`${fieldClass} block w-full resize-y`}
        />

        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-muted-foreground">
            Starts
            <input
              type="date"
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                if (error) setError(null);
              }}
              aria-label="Start date"
              className={`${dateFieldClass} mt-1 w-44`}
            />
          </label>

          <label className="text-xs text-muted-foreground">
            Ends
            <input
              type="date"
              value={end}
              // Stops the picker offering a day before the start; a pair typed
              // the wrong way round is still swapped when it is saved.
              min={start || undefined}
              onChange={(e) => {
                setEnd(e.target.value);
                if (error) setError(null);
              }}
              aria-label="End date"
              className={`${dateFieldClass} mt-1 w-44`}
            />
          </label>

          <label className="text-xs text-muted-foreground">
            Repeats
            <select
              value={cycle}
              onChange={(e) => setCycle(e.target.value as CycleKind)}
              aria-label="Cycle length"
              className={`${fieldClass} mt-1 w-44`}
            >
              {CYCLE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {CYCLE_LABELS[kind]}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={handleAdd}
            className="ms-auto inline-flex items-center justify-center gap-2 rounded-full bg-[#FF4D8E] px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-[#FF4D8E]/25 transition-colors hover:bg-[#FF4D8E]/90"
          >
            <Plus className="h-4 w-4" />
            Add milestone
          </button>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}
        <p className="text-xs text-muted-foreground">
          The days each task falls on are picked on the card once it exists — they depend on the cycle chosen
          here.
        </p>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  One milestone                                                             */
/* -------------------------------------------------------------------------- */

function CycleCard({ item, index }: { item: MilestoneCycle; index: number }) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(item.title);
  const [draftDescription, setDraftDescription] = useState(item.description);
  const [draftCycle, setDraftCycle] = useState<CycleKind>(item.cycle);
  const [draftStart, setDraftStart] = useState(item.range.start);
  const [draftEnd, setDraftEnd] = useState(item.range.end);
  const [editError, setEditError] = useState<string | null>(null);

  const turns = useMemo(() => cycleTurns(item), [item]);
  // Where the turn picker opens: whichever one today falls in. Held as state
  // from then on, so paging back and forth is not undone by the next write.
  const [turn, setTurn] = useState(() => currentTurnIndex(turns));
  const shown: CycleTurn | undefined = turns[Math.min(turn, turns.length - 1)];

  const overall = cycleProgress(item);
  const thisTurn = shown ? cycleProgress(item, shown) : overall;
  const done = isCycleComplete(item);
  const color = done ? DONE_COLOR : PROGRESS_COLOR;

  const startEditing = useCallback(() => {
    setDraftTitle(item.title);
    setDraftDescription(item.description);
    setDraftCycle(item.cycle);
    setDraftStart(item.range.start);
    setDraftEnd(item.range.end);
    setEditError(null);
    setEditing(true);
  }, [item]);

  const saveEdit = useCallback(() => {
    if (!(draftStart && draftEnd)) {
      setEditError('This one needs both dates — it has nothing to repeat over without them.');
      return;
    }

    const range = normaliseRange({ start: draftStart, end: draftEnd });
    if (!range) {
      setEditError('Those dates did not look like real days.');
      return;
    }

    const saved = updateMilestoneCycle(item.id, {
      title: draftTitle,
      description: draftDescription,
      cycle: draftCycle,
      range,
    });

    if (!saved) {
      setEditError('Give it a name first.');
      return;
    }

    // The turns have been recut underneath, so the old index means nothing.
    setTurn(0);
    setEditError(null);
    setEditing(false);
  }, [draftCycle, draftDescription, draftEnd, draftStart, draftTitle, item.id]);

  const handleDelete = useCallback(() => {
    if (!window.confirm(`Remove "${item.title}"?`)) return;
    deleteMilestoneCycle(item.id);
  }, [item.id, item.title]);

  if (editing) {
    return (
      <article className={cardClass}>
        <div className="space-y-3">
          <input
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            dir="auto"
            maxLength={TITLE_MAX_LENGTH}
            autoFocus
            aria-label={`Rename ${item.title}`}
            className={fieldClass}
          />
          <textarea
            value={draftDescription}
            onChange={(e) => setDraftDescription(e.target.value)}
            dir="auto"
            rows={3}
            maxLength={DESCRIPTION_MAX_LENGTH}
            aria-label={`Notes for ${item.title}`}
            className={`${fieldClass} block w-full resize-y`}
          />

          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-muted-foreground">
              Starts
              <input
                type="date"
                value={draftStart}
                onChange={(e) => {
                  setDraftStart(e.target.value);
                  if (editError) setEditError(null);
                }}
                aria-label={`Start date for ${item.title}`}
                className={`${dateFieldClass} mt-1 w-44`}
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Ends
              <input
                type="date"
                value={draftEnd}
                min={draftStart || undefined}
                onChange={(e) => {
                  setDraftEnd(e.target.value);
                  if (editError) setEditError(null);
                }}
                aria-label={`End date for ${item.title}`}
                className={`${dateFieldClass} mt-1 w-44`}
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Repeats
              <select
                value={draftCycle}
                onChange={(e) => setDraftCycle(e.target.value as CycleKind)}
                aria-label={`Cycle length for ${item.title}`}
                className={`${fieldClass} mt-1 w-44`}
              >
                {CYCLE_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {CYCLE_LABELS[kind]}
                  </option>
                ))}
              </select>
            </label>

            <span className="ms-auto flex gap-2">
              <button
                type="button"
                onClick={saveEdit}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#FF4D8E] px-4 py-2 text-xs font-medium text-white hover:bg-[#FF4D8E]/90"
              >
                <Check className="h-3.5 w-3.5" />
                Save
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10"
              >
                Cancel
              </button>
            </span>
          </div>

          {editError && <p className="text-xs text-destructive">{editError}</p>}
          {draftCycle !== item.cycle && (
            <p className="text-xs text-muted-foreground">
              Changing the cycle re-reads which days each task falls on. Days the new cycle does not have are
              dropped, so check the tasks afterwards.
            </p>
          )}
        </div>
      </article>
    );
  }

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index, 5) * 0.05 }}
      className={cardClass}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        {/* `flex-1` so the block fills the row rather than shrinking to its own
            text — otherwise a Hebrew title ends up on the left of the card. */}
        <div className="min-w-0 flex-1">
          <h3 dir="auto" className="text-base font-semibold text-foreground md:text-lg">
            {item.title}
            {done && (
              <span
                className="ms-2 rounded-full px-2 py-0.5 align-middle text-xs font-medium"
                style={{ backgroundColor: `${DONE_COLOR}1f`, color: DONE_COLOR }}
              >
                Done
              </span>
            )}
          </h3>
          {item.description && (
            // `whitespace-pre-line` keeps the line breaks the author typed.
            <p dir="auto" className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
              {item.description}
            </p>
          )}
        </div>

        <span className="flex shrink-0 gap-1">
          <IconButton title={`Edit ${item.title}`} onClick={startEditing}>
            <Pencil className="h-4 w-4" />
          </IconButton>
          <IconButton title={`Remove ${item.title}`} destructive onClick={handleDelete}>
            <Trash2 className="h-4 w-4" />
          </IconButton>
        </span>
      </div>

      <RangeMeter range={item.range} done={done} label={item.title} suffix={CYCLE_SHORT_LABELS[item.cycle]} />

      {/* Progress across the whole range, so one good week does not read as a
          finished milestone. */}
      <div className="mb-4">
        <div className="mb-1.5 flex items-center justify-between text-sm">
          <span className="font-medium" style={{ color }}>
            {overall.percent}%
          </span>
          <span className="text-muted-foreground">
            {overall.done} / {overall.total} {overall.total === 1 ? 'time' : 'times'}
          </span>
        </div>
        <div
          className="h-2.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10"
          role="progressbar"
          aria-valuenow={overall.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${item.title} progress`}
        >
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: color }}
            initial={{ width: 0 }}
            animate={{ width: `${overall.percent}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        </div>
      </div>

      {shown && (
        <TurnPlan
          item={item}
          turn={shown}
          count={turns.length}
          progress={thisTurn}
          onGo={(next) => setTurn(Math.min(Math.max(next, 0), turns.length - 1))}
        />
      )}

      <TaskEditor item={item} />
    </motion.article>
  );
}

/* -------------------------------------------------------------------------- */
/*  One turn of the cycle                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The days of one turn, each with what it asks for.
 *
 * Only one turn is on screen at a time — six months of a weekly cycle is
 * twenty-six of them, and a list that long is not something anyone reads. Today
 * is marked so the eye lands on it when the card opens.
 */
function TurnPlan({
  item,
  turn,
  count,
  progress,
  onGo,
}: {
  item: MilestoneCycle;
  turn: CycleTurn;
  count: number;
  progress: { done: number; total: number };
  onGo: (index: number) => void;
}) {
  const today = toDateKey(new Date());
  const days = useMemo(() => planForTurn(item, turn), [item, turn]);

  return (
    <div className="mb-4 rounded-xl border border-black/[0.06] bg-black/[0.02] p-3 dark:border-white/[0.08] dark:bg-white/[0.02]">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <IconButton title="Previous cycle" onClick={() => onGo(turn.index - 1)} disabled={turn.index === 0}>
          <ChevronLeft className="h-4 w-4" />
        </IconButton>

        <span className="min-w-0 flex-1 text-center text-sm">
          <span className="font-medium text-foreground">
            {TURN_LABELS[item.cycle]} {turn.index + 1} of {count}
          </span>
          <span className="ms-2 text-xs text-muted-foreground">
            {formatDayKey(turn.start)} – {formatDayKey(turn.end)}
          </span>
        </span>

        <IconButton title="Next cycle" onClick={() => onGo(turn.index + 1)} disabled={turn.index >= count - 1}>
          <ChevronRight className="h-4 w-4" />
        </IconButton>
      </div>

      {days.length === 0 ? (
        <p className="px-1 py-2 text-xs text-muted-foreground">
          Nothing falls in this one. Add a task below and pick the days it lands on.
        </p>
      ) : (
        <>
          <p className="mb-2 px-1 text-xs text-muted-foreground">
            {progress.done} of {progress.total} done this time round
          </p>
          <ul className="space-y-2">
            {days.map((day) => (
              <DayRow key={day.key} item={item} dayKey={day.key} tasks={day.tasks} today={today} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function DayRow({
  item,
  dayKey,
  tasks,
  today,
}: {
  item: MilestoneCycle;
  dayKey: string;
  tasks: CycleTask[];
  today: string;
}) {
  const allDone = tasks.every((task) => isTaskDoneOn(task, dayKey));
  const isToday = dayKey === today;

  return (
    <li className={`rounded-lg px-2 py-1.5 ${isToday ? 'bg-[#6366F1]/10 ring-1 ring-inset ring-[#6366F1]/30' : ''}`}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span
          className={`text-xs font-medium ${isToday ? 'text-[#312E81] dark:text-[#C7D2FE]' : 'text-muted-foreground'}`}
        >
          {formatDayKey(dayKey)}
          {isToday && ' · today'}
        </span>
        <button
          type="button"
          onClick={() => setCycleDayDone(item.id, dayKey, !allDone)}
          className="rounded-full px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
        >
          {allDone ? 'Clear day' : 'Tick day'}
        </button>
      </div>

      <ul className="space-y-1">
        {tasks.map((task) => {
          const count = countFor(task, dayKey);
          const ticked = isTaskDoneOn(task, dayKey);
          // A task needed once a day is said by the box alone; the counter only
          // appears where there is actually something to count.
          const repeats = task.target > 1;

          return (
            <li key={task.id} className="flex items-start gap-2">
              <button
                type="button"
                onClick={() => toggleCycleDone(item.id, task.id, dayKey)}
                aria-pressed={ticked}
                aria-label={`${ticked ? 'Untick' : 'Tick off'} ${task.title} on ${formatDayKey(dayKey)}${
                  repeats ? `, ${count} of ${task.target} done` : ''
                }`}
                title={`${ticked ? 'Untick' : 'Tick off'} ${task.title}`}
                className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                  ticked
                    ? 'border-transparent bg-[#047857] text-white hover:bg-[#036B4B]'
                    : count > 0
                      ? 'border-[#047857] text-transparent hover:border-[#036B4B]'
                      : 'border-gray-300 text-transparent hover:border-[#FF4D8E] dark:border-white/20'
                }`}
              >
                {/* Part-way through reads as a filled centre rather than a tick,
                    which would say finished. */}
                {ticked ? (
                  <Check className="h-3.5 w-3.5" />
                ) : count > 0 ? (
                  <span className="h-2 w-2 rounded-[2px] bg-[#047857]" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
              </button>

              <span
                dir="auto"
                className={`min-w-0 flex-1 break-words text-sm leading-5 ${
                  ticked ? 'text-muted-foreground line-through' : 'text-foreground'
                }`}
              >
                {task.title}
              </span>

              {repeats && (
                <span className="flex shrink-0 items-center gap-0.5">
                  <span
                    className={`me-0.5 text-xs tabular-nums ${
                      ticked ? 'text-[#047857] dark:text-[#6EE7B7]' : 'text-muted-foreground'
                    }`}
                  >
                    {count} / {task.target}
                  </span>
                  <StepButton
                    title={`One fewer ${task.title} on ${formatDayKey(dayKey)}`}
                    onClick={() => stepCycleCount(item.id, task.id, dayKey, -1)}
                    disabled={count <= 0}
                  >
                    <Minus className="h-3 w-3" />
                  </StepButton>
                  <StepButton
                    title={`One more ${task.title} on ${formatDayKey(dayKey)}`}
                    onClick={() => stepCycleCount(item.id, task.id, dayKey, 1)}
                    disabled={ticked}
                  >
                    <Plus className="h-3 w-3" />
                  </StepButton>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/*  Tasks and the days they fall on                                           */
/* -------------------------------------------------------------------------- */

/**
 * The tasks themselves, with the days each one repeats on.
 *
 * This is the definition; the turn above is the doing. Changing a chip here
 * changes every turn at once, which is why the two are kept apart.
 */
function TaskEditor({ item }: { item: MilestoneCycle }) {
  const [title, setTitle] = useState('');
  const [days, setDays] = useState<number[]>([]);
  const [target, setTarget] = useState('1');
  const [error, setError] = useState<string | null>(null);

  const choices = useMemo(() => dayChoices(item), [item]);
  const full = item.tasks.length >= MAX_TASKS_PER_CYCLE;

  const handleAdd = useCallback(() => {
    if (!title.trim()) {
      setError('Give the task a name first.');
      return;
    }
    if (days.length === 0) {
      setError('Pick at least one day for it to fall on.');
      return;
    }
    if (!addCycleTask(item.id, title, days, Number(target))) {
      setError(full ? 'That is as many tasks as one milestone holds.' : 'That task could not be added.');
      return;
    }

    setTitle('');
    setDays([]);
    setTarget('1');
    setError(null);
  }, [days, full, item.id, target, title]);

  return (
    <div className="border-t border-black/[0.06] pt-3 dark:border-white/[0.08]">
      {item.tasks.length > 0 && (
        <ul className="mb-3 space-y-3">
          {item.tasks.map((task) => (
            <TaskRow key={task.id} item={item} task={task} choices={choices} />
          ))}
        </ul>
      )}

      <div className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAdd();
              }
            }}
            dir="auto"
            maxLength={TASK_TITLE_MAX_LENGTH}
            placeholder="A task this keeps coming back to"
            aria-label={`New task for ${item.title}`}
            className={fieldClass}
          />

          <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="number"
              min={1}
              max={MAX_TIMES_PER_DAY}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              aria-label={`Times a day for the new task in ${item.title}`}
              className={`${fieldClass} w-16 px-2 text-center`}
            />
            × a day
          </label>

          <button
            type="button"
            onClick={handleAdd}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-[#FF4D8E]/40 dark:border-white/10"
          >
            <Plus className="h-4 w-4" />
            Task
          </button>
        </div>

        <DayPicker
          choices={choices}
          selected={days}
          legend={`Days for the new task in ${item.title}`}
          onToggle={(value) => {
            setDays((current) =>
              current.includes(value) ? current.filter((day) => day !== value) : [...current, value]
            );
            if (error) setError(null);
          }}
        />
      </div>

      {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
    </div>
  );
}

function TaskRow({ item, task, choices }: { item: MilestoneCycle; task: CycleTask; choices: DayChoice[] }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);

  // Closes either way: a blank name simply keeps the one it had.
  const save = useCallback(() => {
    renameCycleTask(item.id, task.id, draft);
    setEditing(false);
  }, [draft, item.id, task.id]);

  return (
    <li className="rounded-xl border border-black/[0.06] p-2.5 dark:border-white/[0.08]">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {editing ? (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                save();
              }
              if (e.key === 'Escape') setEditing(false);
            }}
            onBlur={save}
            dir="auto"
            autoFocus
            maxLength={TASK_TITLE_MAX_LENGTH}
            aria-label={`Rename ${task.title}`}
            className={fieldClass}
          />
        ) : (
          <>
            {/* Everything beside it in this row is `shrink-0`, so on a narrow
                screen the name would be left with whatever was over — a basis
                wide enough to be a name takes the whole line instead, the row
                wrapping the controls underneath it. */}
            <button
              type="button"
              onClick={() => {
                setDraft(task.title);
                setEditing(true);
              }}
              dir="auto"
              title={`Edit ${task.title}`}
              className="min-w-0 grow basis-48 break-words text-start text-sm font-medium text-foreground transition-colors hover:text-[#FF4D8E]"
            >
              {task.title}
            </button>
            <span className="shrink-0 text-xs text-muted-foreground">
              {task.days.map((day) => dayLabel(item, day)).join(', ')}
            </span>

            {/* Writes straight through on every keystroke, the same way the
                counter on a plain milestone does. */}
            <label className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
              <input
                type="number"
                min={1}
                max={MAX_TIMES_PER_DAY}
                value={task.target}
                onChange={(e) => setCycleTaskTarget(item.id, task.id, Number(e.target.value))}
                aria-label={`Times a day for ${task.title}`}
                className={`${fieldClass} w-14 px-2 py-1 text-center`}
              />
              × a day
            </label>

            <IconButton
              title={`Remove ${task.title}`}
              destructive
              onClick={() => deleteCycleTask(item.id, task.id)}
            >
              <Trash2 className="h-4 w-4" />
            </IconButton>
          </>
        )}
      </div>

      <DayPicker
        choices={choices}
        selected={task.days}
        legend={`Days ${task.title} falls on`}
        onToggle={(value) => toggleCycleTaskDay(item.id, task.id, value)}
      />
    </li>
  );
}

/**
 * The day chips. Weekly and fortnightly cycles get weekday names — the number
 * underneath is an offset from the first day, but that is not something worth
 * showing anyone. Monthly ones get the dates themselves.
 */
function DayPicker({
  choices,
  selected,
  legend,
  onToggle,
}: {
  choices: DayChoice[];
  selected: number[];
  legend: string;
  onToggle: (value: number) => void;
}) {
  // Kept in the order `dayChoices` returns, so the fortnight's two weeks stay in
  // order rather than being sorted into whatever a Map felt like.
  const groups = useMemo(() => {
    const byGroup = new Map<string, DayChoice[]>();
    for (const choice of choices) {
      const existing = byGroup.get(choice.group);
      if (existing) existing.push(choice);
      else byGroup.set(choice.group, [choice]);
    }
    return [...byGroup.entries()];
  }, [choices]);

  return (
    <fieldset>
      <legend className="sr-only">{legend}</legend>
      <div className="space-y-1.5">
        {groups.map(([group, items]) => (
          <div key={group} className="flex flex-wrap items-center gap-1">
            {group && <span className="me-1 w-14 shrink-0 text-xs text-muted-foreground">{group}</span>}
            {items.map((choice) => {
              const on = selected.includes(choice.value);
              return (
                <button
                  key={choice.value}
                  type="button"
                  onClick={() => onToggle(choice.value)}
                  aria-pressed={on}
                  className={`min-w-9 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    on ? pickedDayClass : unpickedDayClass
                  }`}
                >
                  {choice.label}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </fieldset>
  );
}
