'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, Plus, Minus, Trash2, Pencil, Check, Flag, ListFilter, Target } from 'lucide-react';
import {
  DESCRIPTION_MAX_LENGTH,
  MAX_TARGET,
  MAX_TASKS_PER_MILESTONE,
  Milestone,
  MilestoneTask,
  TASK_TITLE_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  UNIT_MAX_LENGTH,
  addMilestone,
  addMilestoneTask,
  deleteMilestone,
  deleteMilestoneTask,
  isComplete,
  milestonePercent,
  milestoneProgress,
  renameMilestoneTask,
  setAllMilestoneTasks,
  setProgress,
  stepProgress,
  toggleMilestoneTask,
  updateMilestone,
} from '@/lib/milestones';
import { useMilestones } from '@/lib/use-milestones';

const fieldClass =
  'w-full rounded-xl border border-gray-200 bg-white/60 px-4 py-2.5 text-sm text-[#1C1C1E] outline-none transition-colors placeholder:text-gray-500 focus:border-[#FF4D8E]/50 focus:ring-2 focus:ring-[#FF4D8E]/20 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-gray-400';

const cardClass =
  'rounded-2xl border border-white/30 bg-white/60 p-5 backdrop-blur-md dark:border-white/10 dark:bg-white/5 md:p-6';

const DONE_COLOR = '#10B981';
const PROGRESS_COLOR = '#FF4D8E';

/** Which half of the list is on screen. Open first — that is the work left. */
type StatusFilter = 'open' | 'done';

export default function MilestonesPage() {
  const { milestones, summary, hydrated } = useMilestones();
  const [filter, setFilter] = useState<StatusFilter>('open');

  const visible = useMemo(
    () => milestones.filter((milestone) => (filter === 'done' ? isComplete(milestone) : !isComplete(milestone))),
    [filter, milestones]
  );

  const openCount = summary.total - summary.completed;

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#FFF5F8] via-background to-background dark:from-[#1C1C1E] dark:via-[#1C1C1E] dark:to-[#1C1C1E]">
      <div className="container mx-auto max-w-6xl px-4 pt-24 md:px-6 md:pt-28">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground md:mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>

        <motion.header
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-6 md:mb-8"
        >
          <h1 className="mb-3 text-3xl font-bold text-foreground md:text-4xl lg:text-5xl">Milestones</h1>
          <p className="max-w-2xl text-base text-muted-foreground md:text-lg">
            Set what you are working towards, then move each one along as you go.
          </p>
        </motion.header>

        {/* Summary */}
        {hydrated && summary.total > 0 && (
          <section className={`${cardClass} mb-6`}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <Stat label="Milestones" value={String(summary.total)} />
              <Stat label="Completed" value={`${summary.completed} of ${summary.total}`} />
              <Stat label="Average progress" value={`${summary.averagePercent}%`} />
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: summary.averagePercent === 100 ? DONE_COLOR : PROGRESS_COLOR }}
                initial={{ width: 0 }}
                animate={{ width: `${summary.averagePercent}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            </div>
          </section>
        )}

        <NewMilestoneForm />

        {/* Filter */}
        {hydrated && summary.total > 0 && (
          <section className={`${cardClass} mb-6 flex flex-wrap items-center gap-x-4 gap-y-3 py-4`}>
            <h2 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <ListFilter className="h-3.5 w-3.5" />
              Show
            </h2>
            <div className="flex flex-wrap gap-2">
              <StatusChip
                label="Open"
                count={openCount}
                active={filter === 'open'}
                onClick={() => setFilter('open')}
              />
              <StatusChip
                label="Done"
                count={summary.completed}
                tone="done"
                active={filter === 'done'}
                onClick={() => setFilter('done')}
              />
            </div>
          </section>
        )}

        {/* List */}
        <section className="space-y-4 pb-16 md:pb-24">
          {!hydrated ? (
            <div className="space-y-4" aria-hidden>
              {Array.from({ length: 2 }).map((_, index) => (
                <div key={index} className="h-40 animate-pulse rounded-2xl bg-foreground/5" />
              ))}
            </div>
          ) : milestones.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-10 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#FF4D8E]/10">
                <Flag className="h-6 w-6 text-[#FF4D8E]" />
              </div>
              <h2 className="mb-2 text-lg font-semibold text-foreground md:text-xl">No milestones yet</h2>
              <p className="mx-auto max-w-md text-sm text-muted-foreground">
                Add the first one above — a target of 1 works for something you either did or did not do.
              </p>
            </div>
          ) : visible.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-10 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#FF4D8E]/10">
                <Flag className="h-6 w-6 text-[#FF4D8E]" />
              </div>
              <h2 className="mb-2 text-lg font-semibold text-foreground md:text-xl">
                {filter === 'open' ? 'Nothing open' : 'Nothing done yet'}
              </h2>
              <p className="mx-auto mb-6 max-w-md text-sm text-muted-foreground">
                {filter === 'open'
                  ? 'Every milestone here is finished. Add another above, or look back at what you got through.'
                  : 'Finish one and it will move over here.'}
              </p>
              <button
                type="button"
                onClick={() => setFilter(filter === 'open' ? 'done' : 'open')}
                className="inline-flex items-center gap-2 rounded-full bg-[#FF4D8E] px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-[#FF4D8E]/25 transition-colors hover:bg-[#FF4D8E]/90"
              >
                {filter === 'open' ? `Show the ${summary.completed} done` : `Show the ${openCount} open`}
              </button>
            </div>
          ) : (
            visible.map((milestone, index) => (
              <MilestoneCard key={milestone.id} milestone={milestone} index={index} />
            ))
          )}
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold text-foreground md:text-xl">{value}</p>
    </div>
  );
}

/**
 * One side of the open/done switch.
 *
 * The active label is a deeper shade of its own hue rather than the brand pink
 * or `DONE_COLOR` themselves — those sit at about 2.3:1 on their own 10% tint,
 * under the 4.5:1 small text needs. The tint and border still carry the colour.
 */
function StatusChip({
  label,
  count,
  tone = 'open',
  active,
  onClick,
}: {
  label: string;
  count: number;
  tone?: 'open' | 'done';
  active: boolean;
  onClick: () => void;
}) {
  const activeClass =
    tone === 'done'
      ? 'border-[#10B981]/60 bg-[#10B981]/10 text-[#065F46] dark:text-[#6EE7B7]'
      : 'border-[#FF4D8E]/60 bg-[#FF4D8E]/10 text-[#A3123F] dark:text-[#FFB3CD]';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
        active
          ? activeClass
          : 'border-gray-200 text-muted-foreground hover:border-[#FF4D8E]/40 hover:text-foreground dark:border-white/10'
      }`}
    >
      {label}
      <span className={active ? 'text-xs' : 'text-xs text-muted-foreground'}>{count}</span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Creating                                                                  */
/* -------------------------------------------------------------------------- */

function NewMilestoneForm() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [target, setTarget] = useState('10');
  const [unit, setUnit] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleAdd = useCallback(() => {
    const created = addMilestone({ title, description, target: Number(target), unit });
    if (!created) {
      setError('Give the milestone a name first.');
      return;
    }

    setTitle('');
    setDescription('');
    setTarget('10');
    setUnit('');
    setError(null);
  }, [description, target, title, unit]);

  return (
    <section className={`${cardClass} mb-6`}>
      <div className="mb-4 flex items-center gap-2">
        <Target className="h-5 w-5 text-[#FF4D8E]" />
        <h2 className="text-lg font-semibold text-foreground md:text-xl">New milestone</h2>
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
          placeholder="What are you working towards?"
          aria-label="Milestone name"
          className={fieldClass}
        />

        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          dir="auto"
          rows={5}
          maxLength={DESCRIPTION_MAX_LENGTH}
          placeholder="Notes, as long as you like — line breaks are kept (optional)"
          aria-label="Milestone notes"
          className={`${fieldClass} block w-full resize-y`}
        />

        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-muted-foreground">
            Target
            <input
              type="number"
              min={1}
              max={MAX_TARGET}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              aria-label="Target amount"
              className={`${fieldClass} mt-1 w-28`}
            />
          </label>

          <label className="text-xs text-muted-foreground">
            Unit <span className="text-muted-foreground/70">(optional)</span>
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              dir="auto"
              maxLength={UNIT_MAX_LENGTH}
              placeholder="chapters, km, %"
              aria-label="Unit"
              className={`${fieldClass} mt-1 w-40`}
            />
          </label>

          <button
            type="button"
            onClick={handleAdd}
            className="ml-auto inline-flex items-center justify-center gap-2 rounded-full bg-[#FF4D8E] px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-[#FF4D8E]/25 transition-colors hover:bg-[#FF4D8E]/90"
          >
            <Plus className="h-4 w-4" />
            Add milestone
          </button>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  One milestone                                                             */
/* -------------------------------------------------------------------------- */

function MilestoneCard({ milestone, index }: { milestone: Milestone; index: number }) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(milestone.title);
  const [draftDescription, setDraftDescription] = useState(milestone.description);
  const [draftTarget, setDraftTarget] = useState(String(milestone.target));
  const [draftUnit, setDraftUnit] = useState(milestone.unit);

  const percent = milestonePercent(milestone);
  const done = isComplete(milestone);
  const color = done ? DONE_COLOR : PROGRESS_COLOR;
  const progress = milestoneProgress(milestone);

  const startEditing = useCallback(() => {
    setDraftTitle(milestone.title);
    setDraftDescription(milestone.description);
    setDraftTarget(String(milestone.target));
    setDraftUnit(milestone.unit);
    setEditing(true);
  }, [milestone]);

  const saveEdit = useCallback(() => {
    const saved = updateMilestone(milestone.id, {
      title: draftTitle,
      description: draftDescription,
      unit: draftUnit,
      target: Number(draftTarget),
    });
    if (saved) setEditing(false);
  }, [draftDescription, draftTarget, draftTitle, draftUnit, milestone.id]);

  const handleDelete = useCallback(() => {
    if (!window.confirm(`Remove "${milestone.title}"?`)) return;
    deleteMilestone(milestone.id);
  }, [milestone.id, milestone.title]);

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index, 5) * 0.05 }}
      className={cardClass}
    >
      {editing ? (
        <div className="space-y-3">
          <input
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            dir="auto"
            maxLength={TITLE_MAX_LENGTH}
            autoFocus
            aria-label={`Rename ${milestone.title}`}
            className={fieldClass}
          />
          <textarea
            value={draftDescription}
            onChange={(e) => setDraftDescription(e.target.value)}
            dir="auto"
            rows={5}
            maxLength={DESCRIPTION_MAX_LENGTH}
            aria-label={`Notes for ${milestone.title}`}
            className={`${fieldClass} block w-full resize-y`}
          />
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-muted-foreground">
              Target
              <input
                type="number"
                min={1}
                max={MAX_TARGET}
                value={draftTarget}
                onChange={(e) => setDraftTarget(e.target.value)}
                aria-label={`Target for ${milestone.title}`}
                className={`${fieldClass} mt-1 w-28`}
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Unit
              <input
                value={draftUnit}
                onChange={(e) => setDraftUnit(e.target.value)}
                dir="auto"
                maxLength={UNIT_MAX_LENGTH}
                aria-label={`Unit for ${milestone.title}`}
                className={`${fieldClass} mt-1 w-40`}
              />
            </label>
            <span className="ml-auto flex gap-2">
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
        </div>
      ) : (
        <>
          <div className="mb-3 flex items-start justify-between gap-3">
            {/* `flex-1` so the block fills the row rather than shrinking to its
                own text. Without it a Hebrew title is right-aligned inside a box
                only as wide as the words, which lands it on the left of the card
                anyway. */}
            <div className="min-w-0 flex-1">
              <h3 dir="auto" className="text-base font-semibold text-foreground md:text-lg">
                {milestone.title}
                {done && (
                  <span
                    className="ms-2 rounded-full px-2 py-0.5 align-middle text-xs font-medium"
                    style={{ backgroundColor: `${DONE_COLOR}1f`, color: DONE_COLOR }}
                  >
                    Done
                  </span>
                )}
              </h3>
              {milestone.description && (
                // `whitespace-pre-line` keeps the line breaks the author typed;
                // without it the whole thing collapses onto one line.
                <p dir="auto" className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                  {milestone.description}
                </p>
              )}
            </div>

            <span className="flex shrink-0 gap-1">
              <IconButton title={`Edit ${milestone.title}`} onClick={startEditing}>
                <Pencil className="h-4 w-4" />
              </IconButton>
              <IconButton title={`Remove ${milestone.title}`} destructive onClick={handleDelete}>
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </span>
          </div>

          {/* Progress */}
          <div className="mb-3">
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="font-medium" style={{ color }}>
                {percent}%
              </span>
              <span dir="auto" className="text-muted-foreground">
                {progress.current} / {progress.target}
                {progress.byTasks ? (progress.target === 1 ? ' task' : ' tasks') : milestone.unit && ` ${milestone.unit}`}
              </span>
            </div>
            <div
              className="h-2.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10"
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${milestone.title} progress`}
            >
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: color }}
                initial={{ width: 0 }}
                animate={{ width: `${percent}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              />
            </div>
          </div>

          <TaskList milestone={milestone} />

          {/* Controls */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {/* The counter only appears while the tasks are not the ones saying
                how far along this is. */}
            {!progress.byTasks && (
              <>
                <IconButton
                  title={`Decrease ${milestone.title}`}
                  onClick={() => stepProgress(milestone.id, -1)}
                  disabled={milestone.current <= 0}
                >
                  <Minus className="h-4 w-4" />
                </IconButton>

                <input
                  type="number"
                  min={0}
                  max={milestone.target}
                  value={milestone.current}
                  onChange={(e) => setProgress(milestone.id, Number(e.target.value))}
                  aria-label={`Progress for ${milestone.title}`}
                  className={`${fieldClass} w-24 text-center`}
                />

                <IconButton
                  title={`Increase ${milestone.title}`}
                  onClick={() => stepProgress(milestone.id, 1)}
                  disabled={done}
                >
                  <Plus className="h-4 w-4" />
                </IconButton>
              </>
            )}

            <button
              type="button"
              onClick={() => {
                if (progress.byTasks) setAllMilestoneTasks(milestone.id, !done);
                else setProgress(milestone.id, done ? 0 : milestone.target);
              }}
              className="ms-auto rounded-full border border-gray-200 px-4 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-[#FF4D8E]/40 dark:border-white/10"
            >
              {done ? 'Reopen' : 'Mark complete'}
            </button>
          </div>
        </>
      )}
    </motion.article>
  );
}

/* -------------------------------------------------------------------------- */
/*  Tasks                                                                     */
/* -------------------------------------------------------------------------- */

function TaskRow({ milestone, task }: { milestone: Milestone; task: MilestoneTask }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);

  const save = useCallback(() => {
    if (renameMilestoneTask(milestone.id, task.id, draft)) setEditing(false);
  }, [draft, milestone.id, task.id]);

  if (editing) {
    return (
      <li className="flex items-center gap-2">
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
      </li>
    );
  }

  return (
    <li className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => toggleMilestoneTask(milestone.id, task.id)}
        aria-pressed={task.done}
        aria-label={`${task.done ? 'Untick' : 'Tick off'} ${task.title}`}
        title={`${task.done ? 'Untick' : 'Tick off'} ${task.title}`}
        className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
          task.done
            ? 'border-transparent bg-[#047857] text-white hover:bg-[#036B4B]'
            : 'border-gray-300 text-transparent hover:border-[#FF4D8E] dark:border-white/20'
        }`}
      >
        <Check className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        onClick={() => setEditing(true)}
        dir="auto"
        title={`Edit ${task.title}`}
        className={`min-w-0 flex-1 truncate text-start text-sm transition-colors hover:text-[#FF4D8E] ${
          task.done ? 'text-muted-foreground line-through' : 'text-foreground'
        }`}
      >
        {task.title}
      </button>

      <IconButton
        title={`Remove ${task.title}`}
        destructive
        onClick={() => deleteMilestoneTask(milestone.id, task.id)}
      >
        <Trash2 className="h-4 w-4" />
      </IconButton>
    </li>
  );
}

/**
 * The pieces a milestone breaks into. While there are any, they are what the
 * progress bar counts — the note under the field says so, since the counter
 * above disappears when the first one is added.
 */
function TaskList({ milestone }: { milestone: Milestone }) {
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  const full = milestone.tasks.length >= MAX_TASKS_PER_MILESTONE;

  const handleAdd = useCallback(() => {
    if (!addMilestoneTask(milestone.id, title)) {
      setError(full ? 'That is as many tasks as one milestone holds.' : 'Give the task a name first.');
      return;
    }
    setTitle('');
    setError(null);
  }, [full, milestone.id, title]);

  return (
    <div className="mt-4 border-t border-black/[0.06] pt-3 dark:border-white/[0.08]">
      {milestone.tasks.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {milestone.tasks.map((task) => (
            <TaskRow key={task.id} milestone={milestone} task={task} />
          ))}
        </ul>
      )}

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
          placeholder="Break this into a task"
          aria-label={`New task for ${milestone.title}`}
          className={fieldClass}
        />
        <button
          type="button"
          onClick={handleAdd}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-[#FF4D8E]/40 dark:border-white/10"
        >
          <Plus className="h-4 w-4" />
          Task
        </button>
      </div>

      {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
      {milestone.tasks.length === 0 && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Adding tasks hands the progress over to them, in place of the count above.
        </p>
      )}
    </div>
  );
}

function IconButton({
  title,
  onClick,
  children,
  destructive,
  disabled,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full p-2 text-muted-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        destructive
          ? 'hover:bg-destructive/10 hover:text-destructive'
          : 'hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10'
      }`}
    >
      {children}
    </button>
  );
}
