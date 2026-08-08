'use client';

/**
 * The fourth section of the milestones page: goals with a day on them.
 *
 * Everything above this counts work. This counts time — one date each, and how
 * many months, weeks and days are left before it. Reaching one is a tick, so
 * there is no bar to fill and nothing to break into tasks.
 */

import { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Flag, Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  Countdown,
  Goal,
  NOTES_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  addGoal,
  countdownShort,
  countdownText,
  countdownTo,
  deleteGoal,
  formatGoalDate,
  toggleGoalDone,
  updateGoal,
} from '@/lib/goals';
import { useGoals } from '@/lib/use-goals';
import {
  EmptyPanel,
  IconButton,
  RangeTone,
  cardClass,
  dateFieldClass,
  fieldClass,
  rangeToneClass,
} from '@/components/milestones/shared';

/**
 * Which of the shared tones a countdown wears. The same five the dated
 * milestones use, so a deadline reads the same colour wherever it appears —
 * every one of them is a deeper shade than the brand hue for contrast's sake.
 */
function goalTone(countdown: Countdown, done: boolean): RangeTone {
  if (done) return 'done';
  if (countdown.state === 'past') return 'overdue';
  if (countdown.state === 'today' || countdown.totalDays <= 3) return 'soon';
  return countdown.months > 0 ? 'upcoming' : 'active';
}

export function GoalsSection() {
  const { goals, summary, hydrated } = useGoals();
  const [creating, setCreating] = useState(false);

  return (
    <section className="mt-10 md:mt-14">
      <header className="mb-4 border-t border-black/[0.06] pt-8 dark:border-white/[0.08]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-xl font-semibold text-foreground md:text-2xl">
            <Flag className="h-5 w-5 text-[#FF4D8E]" />
            Goals
          </h2>

          {hydrated && (
            <button
              type="button"
              onClick={() => setCreating((open) => !open)}
              aria-expanded={creating}
              className="inline-flex items-center gap-2 rounded-full bg-[#FF4D8E] px-4 py-2 text-sm font-medium text-white shadow-lg shadow-[#FF4D8E]/25 transition-colors hover:bg-[#FF4D8E]/90"
            >
              {creating ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {creating ? 'Close' : 'New goal'}
            </button>
          )}
        </div>

        <p className="mt-1.5 text-sm text-muted-foreground">
          One day to reach something by, and how long is left until it — months, weeks and days.
          {hydrated && summary.total > 0 && (
            <>
              {' '}
              <span className="text-foreground">
                {summary.total - summary.reached} to go, {summary.reached} reached
                {summary.passed > 0 && `, ${summary.passed} past the day`}.
              </span>
            </>
          )}
        </p>
      </header>

      {creating && <GoalForm onCreated={() => setCreating(false)} />}

      <div className="space-y-4">
        {!hydrated ? (
          <div className="h-32 animate-pulse rounded-2xl bg-foreground/5" aria-hidden />
        ) : goals.length === 0 ? (
          <EmptyPanel title="No goals yet">
            Add one with the New goal button above — a trip, an exam, a birthday. All it needs is a name and
            the day.
          </EmptyPanel>
        ) : (
          goals.map((goal, index) => <GoalCard key={goal.id} goal={goal} index={index} />)
        )}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Creating                                                                  */
/* -------------------------------------------------------------------------- */

function GoalForm({ onCreated }: { onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleAdd = useCallback(() => {
    if (!date) {
      setError('Pick the day this is for.');
      return;
    }

    // Checked here rather than after saving, so a typed-in day that is not real
    // never becomes a goal counting down to nothing.
    if (!addGoal({ title, notes, date })) {
      setError(title.trim() ? 'That did not look like a real day.' : 'Give the goal a name first.');
      return;
    }

    setTitle('');
    setNotes('');
    setDate('');
    setError(null);
    onCreated();
  }, [date, notes, onCreated, title]);

  return (
    <section className={`${cardClass} mb-6`}>
      <div className="mb-4 flex items-center gap-2">
        <Flag className="h-5 w-5 text-[#FF4D8E]" />
        <h3 className="text-lg font-semibold text-foreground md:text-xl">New goal</h3>
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
          autoFocus
          maxLength={TITLE_MAX_LENGTH}
          placeholder="What are you counting down to?"
          aria-label="Goal name"
          className={fieldClass}
        />

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          dir="auto"
          rows={3}
          maxLength={NOTES_MAX_LENGTH}
          placeholder="Notes, as long as you like — line breaks are kept (optional)"
          aria-label="Goal notes"
          className={`${fieldClass} block w-full resize-y`}
        />

        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-muted-foreground">
            The day
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                if (error) setError(null);
              }}
              aria-label="Goal date"
              className={`${dateFieldClass} mt-1 w-44`}
            />
          </label>

          <button
            type="button"
            onClick={handleAdd}
            className="ms-auto inline-flex items-center justify-center gap-2 rounded-full bg-[#FF4D8E] px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-[#FF4D8E]/25 transition-colors hover:bg-[#FF4D8E]/90"
          >
            <Plus className="h-4 w-4" />
            Add goal
          </button>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  One goal                                                                  */
/* -------------------------------------------------------------------------- */

function GoalCard({ goal, index }: { goal: Goal; index: number }) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(goal.title);
  const [draftNotes, setDraftNotes] = useState(goal.notes);
  const [draftDate, setDraftDate] = useState(goal.date);
  const [editError, setEditError] = useState<string | null>(null);

  const countdown = countdownTo(goal.date);
  const tone = goalTone(countdown, goal.done);

  const startEditing = useCallback(() => {
    setDraftTitle(goal.title);
    setDraftNotes(goal.notes);
    setDraftDate(goal.date);
    setEditError(null);
    setEditing(true);
  }, [goal]);

  const saveEdit = useCallback(() => {
    if (!draftDate) {
      setEditError('A goal needs a day — there is nothing to count down to without one.');
      return;
    }

    if (!updateGoal(goal.id, { title: draftTitle, notes: draftNotes, date: draftDate })) {
      setEditError(draftTitle.trim() ? 'That did not look like a real day.' : 'Give the goal a name first.');
      return;
    }

    setEditError(null);
    setEditing(false);
  }, [draftDate, draftNotes, draftTitle, goal.id]);

  const handleDelete = useCallback(() => {
    if (!window.confirm(`Remove "${goal.title}"?`)) return;
    deleteGoal(goal.id);
  }, [goal.id, goal.title]);

  if (editing) {
    return (
      <article className={cardClass}>
        <div className="space-y-3">
          <input
            value={draftTitle}
            onChange={(e) => {
              setDraftTitle(e.target.value);
              if (editError) setEditError(null);
            }}
            dir="auto"
            autoFocus
            maxLength={TITLE_MAX_LENGTH}
            aria-label={`Rename ${goal.title}`}
            className={fieldClass}
          />

          <textarea
            value={draftNotes}
            onChange={(e) => setDraftNotes(e.target.value)}
            dir="auto"
            rows={3}
            maxLength={NOTES_MAX_LENGTH}
            aria-label={`Notes for ${goal.title}`}
            className={`${fieldClass} block w-full resize-y`}
          />

          <label className="block text-xs text-muted-foreground">
            The day
            <input
              type="date"
              value={draftDate}
              onChange={(e) => {
                setDraftDate(e.target.value);
                if (editError) setEditError(null);
              }}
              aria-label={`Date for ${goal.title}`}
              className={`${dateFieldClass} mt-1 w-44`}
            />
          </label>

          {editError && <p className="text-xs text-destructive">{editError}</p>}

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveEdit}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#FF4D8E] px-4 py-2 text-xs font-medium text-white hover:bg-[#FF4D8E]/90"
            >
              <Check className="h-3.5 w-3.5" />
              Save
            </button>
          </div>
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
            {goal.title}
            {goal.done && (
              <span
                className={`ms-2 inline-block rounded-full border px-2 py-0.5 align-middle text-xs font-medium ${rangeToneClass.done}`}
              >
                Reached
              </span>
            )}
          </h3>
          {goal.notes && (
            // `whitespace-pre-line` keeps the line breaks the author typed.
            <p dir="auto" className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
              {goal.notes}
            </p>
          )}
        </div>

        <span className="flex shrink-0 gap-1">
          <IconButton title={`Edit ${goal.title}`} onClick={startEditing}>
            <Pencil className="h-4 w-4" />
          </IconButton>
          <IconButton title={`Remove ${goal.title}`} destructive onClick={handleDelete}>
            <Trash2 className="h-4 w-4" />
          </IconButton>
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{formatGoalDate(goal.date)}</p>

          {/* The answer the section exists for. A reached goal keeps its date but
              drops the countdown — how long was left stopped mattering. */}
          {goal.done ? (
            <p className="mt-1 text-sm text-muted-foreground">Reached, so nothing left to wait for.</p>
          ) : (
            <>
              <CountdownParts countdown={countdown} />
              {/* The sentence and the total are what the three numbers above do
                  not say on their own. On the day itself they would only repeat
                  it, so the day itself gets the heading and nothing else. */}
              {countdown.state !== 'today' && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {countdownText(countdown)}
                  {/* The total is only worth saying once there are months or
                      weeks hiding it — under a week it is the same number. */}
                  {(countdown.months > 0 || countdown.weeks > 0) && ` · ${countdown.totalDays} days in all`}
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${rangeToneClass[tone]}`}
          >
            {goal.done ? 'Reached' : countdownShort(countdown)}
          </span>

          <button
            type="button"
            onClick={() => toggleGoalDone(goal.id)}
            className="rounded-full border border-gray-200 px-4 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-[#FF4D8E]/40 dark:border-white/10"
          >
            {goal.done ? 'Not yet' : 'Mark reached'}
          </button>
        </div>
      </div>
    </motion.article>
  );
}

/**
 * The months, weeks and days as three numbers rather than a sentence.
 *
 * Leading empty parts are dropped — a fortnight off shows weeks and days, not a
 * nought for the months — but a zero between two filled parts stays, since
 * "1 month, 0 weeks, 4 days" is the honest reading of that gap.
 */
function CountdownParts({ countdown }: { countdown: Countdown }) {
  if (countdown.state === 'today') {
    return <p className="mt-1 text-xl font-semibold text-foreground">Today</p>;
  }

  const parts = [
    { value: countdown.months, label: countdown.months === 1 ? 'month' : 'months' },
    { value: countdown.weeks, label: countdown.weeks === 1 ? 'week' : 'weeks' },
    { value: countdown.days, label: countdown.days === 1 ? 'day' : 'days' },
  ];

  const first = parts.findIndex((part) => part.value > 0);
  const shown = first === -1 ? parts.slice(2) : parts.slice(first);

  return (
    <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      {shown.map((part) => (
        <span key={part.label} className="inline-flex items-baseline gap-1">
          <span className="text-xl font-semibold tabular-nums text-foreground">{part.value}</span>
          <span className="text-xs text-muted-foreground">{part.label}</span>
        </span>
      ))}
    </p>
  );
}
