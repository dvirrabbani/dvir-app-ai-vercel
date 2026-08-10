'use client';

import { useCallback, useState } from 'react';
import { Check, Clock, Layers, Plus, Repeat2, ShoppingBasket, Trash2 } from 'lucide-react';
import { WEEKDAY_LABELS } from '@/lib/calendar';
import {
  GROUP_TITLE_MAX_LENGTH,
  MAX_GROUPS_PER_ROUTINE,
  MAX_TARGET,
  MAX_TASKS_PER_GROUP,
  ROUTINE_TITLE_MAX_LENGTH,
  Routine,
  RoutineCadence,
  RoutineGroup,
  RoutineKind,
  RoutineTask,
  TASK_TITLE_MAX_LENGTH,
  addGroup,
  addRoutine,
  addTask,
  deleteGroup,
  deleteRoutine,
  deleteTask,
  describeSchedule,
  formatSince,
  ordinal,
  routineTotal,
  totalFor,
  toggleGroupDay,
  toggleRoutineDay,
  updateGroup,
  updateRoutine,
  updateTask,
} from '@/lib/routines';
import { IconButton, fieldClass, timeFieldClass } from '@/components/routines/shared';

const MONTH_DAYS = Array.from({ length: 31 }, (_, index) => index + 1);

const pillClass = (picked: boolean) =>
  `rounded-lg py-1.5 text-xs font-medium transition-colors ${
    picked ? 'bg-[#FF4D8E] text-white' : 'bg-black/[0.04] text-muted-foreground hover:text-foreground dark:bg-white/[0.06]'
  }`;

/**
 * The days a weekly or monthly routine falls on, laid out the way they read on a
 * calendar: a Sun-to-Sat row for a weekly one, a 1-to-31 grid for a monthly one.
 */
function RoutineDayPicker({ routine }: { routine: Routine }) {
  if (routine.cadence === 'daily') return null;

  const weekly = routine.cadence === 'weekly';
  const days = weekly
    ? WEEKDAY_LABELS.map((label, index) => ({ value: index, label }))
    : MONTH_DAYS.map((day) => ({ value: day, label: `${day}` }));

  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">
        {weekly ? 'Which days of the week' : 'Which days of the month'}
      </p>
      <div dir="ltr" className={`grid gap-1 ${weekly ? 'grid-cols-7' : 'grid-cols-7 sm:grid-cols-10'}`}>
        {days.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => toggleRoutineDay(routine.id, value)}
            aria-pressed={routine.days.includes(value)}
            aria-label={weekly ? label : ordinal(value)}
            className={pillClass(routine.days.includes(value))}
          >
            {label}
          </button>
        ))}
      </div>
      {routine.days.length === 0 && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Pick at least one day, or this routine will never come round.
        </p>
      )}
    </div>
  );
}

/**
 * Which of the routine's days this particular group sits on — the control that
 * puts upper body on Monday and lower body on Wednesday inside one routine.
 * Only days the routine already covers are offered.
 */
function GroupDayPicker({ routine, group }: { routine: Routine; group: RoutineGroup }) {
  if (routine.cadence === 'daily' || routine.days.length === 0) return null;

  const weekly = routine.cadence === 'weekly';

  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">
        Days for this group {group.days.length === 0 && <span className="font-normal">(all of them)</span>}
      </p>
      <div dir="ltr" className="flex flex-wrap gap-1">
        {routine.days.map((day) => (
          <button
            key={day}
            type="button"
            onClick={() => toggleGroupDay(routine.id, group.id, day)}
            aria-pressed={group.days.includes(day)}
            aria-label={`${group.title || 'Group'} on ${weekly ? WEEKDAY_LABELS[day] : ordinal(day)}`}
            className={`${pillClass(group.days.includes(day))} px-3`}
          >
            {weekly ? WEEKDAY_LABELS[day] : ordinal(day)}
          </button>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Tasks                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A task as something to change rather than to tick off: click the title to
 * rename it, set when it falls and how many times a day, or remove it. The
 * routines page draws this both under a group and under a part of the day.
 */
export function EditableTaskRow({
  routine,
  group,
  task,
  inheritedTime,
}: {
  routine: Routine;
  group: RoutineGroup;
  task: RoutineTask;
  /**
   * The time the task ends up at when it has none of its own — its group's.
   * Shown greyed, so a row placed by its group does not look unplaced.
   */
  inheritedTime?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(task.title);
  const [draftTime, setDraftTime] = useState(task.time);
  const [draftTarget, setDraftTarget] = useState(String(task.target));

  const stock = routine.kind === 'stock';
  const total = totalFor(routine, task.id);

  const startEditing = useCallback(() => {
    setDraftTitle(task.title);
    setDraftTime(task.time);
    setDraftTarget(String(task.target));
    setEditing(true);
  }, [task]);

  const save = useCallback(() => {
    const target = Number(draftTarget);
    const changed = updateTask(routine.id, group.id, task.id, {
      title: draftTitle,
      time: draftTime,
      target: Number.isFinite(target) ? target : 1,
    });
    if (changed) setEditing(false);
  }, [draftTarget, draftTime, draftTitle, group.id, routine.id, task.id]);

  if (editing) {
    return (
      <li className="rounded-lg bg-black/[0.03] p-2 dark:bg-white/[0.04]">
        <input
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              save();
            }
          }}
          dir="auto"
          autoFocus
          maxLength={TASK_TITLE_MAX_LENGTH}
          aria-label={`Rename ${task.title}`}
          className={fieldClass}
        />
        {!stock && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Time
              <input
                type="time"
                value={draftTime}
                onChange={(e) => setDraftTime(e.target.value)}
                aria-label={`Time for ${task.title}`}
                className={timeFieldClass}
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Times a day
              <input
                type="number"
                min={1}
                max={MAX_TARGET}
                value={draftTarget}
                onChange={(e) => setDraftTarget(e.target.value)}
                aria-label={`How many times a day for ${task.title}`}
                className={`${fieldClass} w-20`}
              />
            </label>
          </div>
        )}
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={save}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#FF4D8E] px-4 py-1.5 text-xs font-medium text-white hover:bg-[#FF4D8E]/90"
          >
            <Check className="h-3.5 w-3.5" />
            Save
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10"
          >
            Cancel
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-2 rounded-lg bg-black/[0.03] px-3 py-2 dark:bg-white/[0.04]">
      {task.time ? (
        <span className="inline-flex shrink-0 items-center gap-1 text-xs tabular-nums text-[#4338CA] dark:text-[#A5B4FC]">
          <Clock className="h-3 w-3" />
          {task.time}
        </span>
      ) : inheritedTime ? (
        <span
          className="inline-flex shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground"
          title={`From ${group.title || 'its group'}`}
        >
          <Clock className="h-3 w-3" />
          {inheritedTime}
        </span>
      ) : null}
      {task.target > 1 && (
        <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-black/[0.06] px-1.5 text-[10px] font-medium tabular-nums text-foreground/70 dark:bg-white/10">
          <Repeat2 className="h-3 w-3" />
          {task.target}×
        </span>
      )}
      <button
        type="button"
        onClick={startEditing}
        dir="auto"
        className="min-w-0 flex-1 truncate text-left text-sm text-foreground hover:text-[#FF4D8E]"
        title={`Edit ${task.title}`}
      >
        {task.title}
      </button>
      {!stock && total > 0 && (
        <span
          className="shrink-0 text-xs tabular-nums text-[#6B7280] dark:text-[#9CA3AF]"
          title={`Done ${total} time${total === 1 ? '' : 's'} since ${formatSince(task.createdAt)}`}
        >
          {total} done
        </span>
      )}
      <IconButton title={`Remove ${task.title}`} destructive onClick={() => deleteTask(routine.id, group.id, task.id)}>
        <Trash2 className="h-4 w-4" />
      </IconButton>
    </li>
  );
}

function NewTaskForm({ routine, group }: { routine: Routine; group: RoutineGroup }) {
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('');
  const [target, setTarget] = useState('1');
  const [error, setError] = useState<string | null>(null);

  const stock = routine.kind === 'stock';

  const handleAdd = useCallback(() => {
    const parsed = Number(target);
    const added = addTask(routine.id, group.id, {
      title,
      time,
      target: Number.isFinite(parsed) ? parsed : 1,
    });

    if (!added) {
      setError(
        group.tasks.length >= MAX_TASKS_PER_GROUP
          ? 'That is as many items as one group holds.'
          : `Give the ${stock ? 'item' : 'task'} a name first.`
      );
      return;
    }

    setTitle('');
    setTime('');
    setTarget('1');
    setError(null);
  }, [group.id, group.tasks.length, routine.id, stock, target, time, title]);

  return (
    <div className="mt-2">
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
          placeholder={stock ? 'Add an item' : 'Add a task'}
          aria-label={`New ${stock ? 'item' : 'task'} for ${group.title || routine.title}`}
          className={fieldClass}
        />
        {!stock && (
          <>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              aria-label={`Time for the new task in ${group.title || routine.title}`}
              className={`${timeFieldClass} w-full sm:w-32`}
            />
            <input
              type="number"
              min={1}
              max={MAX_TARGET}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              title="How many times a day"
              aria-label={`How many times a day for the new task in ${group.title || routine.title}`}
              className={`${fieldClass} sm:w-20`}
            />
          </>
        )}
        <button
          type="button"
          onClick={handleAdd}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#FF4D8E] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#FF4D8E]/90"
        >
          <Plus className="h-4 w-4" />
          Add
        </button>
      </div>
      {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Groups                                                                    */
/* -------------------------------------------------------------------------- */

function GroupEditor({ routine, group, only }: { routine: Routine; group: RoutineGroup; only: boolean }) {
  const [title, setTitle] = useState(group.title);

  const saveTitle = useCallback(() => {
    if (title !== group.title) updateGroup(routine.id, group.id, { title });
  }, [group.id, group.title, routine.id, title]);

  const handleDelete = useCallback(() => {
    const name = group.title || 'this group';
    if (!window.confirm(`Remove ${name} and everything in it?`)) return;
    deleteGroup(routine.id, group.id);
  }, [group.id, group.title, routine.id]);

  return (
    <div className="rounded-lg border border-black/[0.06] p-2.5 dark:border-white/[0.08]">
      <div className="flex items-center gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          dir="auto"
          maxLength={GROUP_TITLE_MAX_LENGTH}
          placeholder="Group name (optional)"
          aria-label={`Name for this group in ${routine.title}`}
          className={fieldClass}
        />
        {routine.kind === 'checklist' && (
          <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            <span className="sr-only sm:not-sr-only">At</span>
            <input
              type="time"
              value={group.time}
              onChange={(e) => updateGroup(routine.id, group.id, { time: e.target.value })}
              aria-label={`Time for ${group.title || 'this group'}`}
              className={timeFieldClass}
            />
          </label>
        )}
        {/* The last group is what holds the routine's items, so it stays. */}
        {!only && (
          <IconButton title={`Remove ${group.title || 'this group'}`} destructive onClick={handleDelete}>
            <Trash2 className="h-4 w-4" />
          </IconButton>
        )}
      </div>

      <div className="mt-2 space-y-2">
        <GroupDayPicker routine={routine} group={group} />

        {group.tasks.length > 0 && (
          <ul className="space-y-1.5">
            {group.tasks.map((task) => (
              <EditableTaskRow key={task.id} routine={routine} group={group} task={task} />
            ))}
          </ul>
        )}

        <NewTaskForm routine={routine} group={group} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  One routine                                                               */
/* -------------------------------------------------------------------------- */

export function RoutineEditor({ routine }: { routine: Routine }) {
  const [title, setTitle] = useState(routine.title);
  const [groupName, setGroupName] = useState('');

  const saveTitle = useCallback(() => {
    if (title.trim() && title !== routine.title) updateRoutine(routine.id, { title });
  }, [routine.id, routine.title, title]);

  const handleDelete = useCallback(() => {
    if (!window.confirm(`Remove "${routine.title}" and everything in it?`)) return;
    deleteRoutine(routine.id);
  }, [routine.id, routine.title]);

  const handleAddGroup = useCallback(() => {
    if (addGroup(routine.id, groupName)) setGroupName('');
  }, [groupName, routine.id]);

  const itemCount = routine.groups.reduce((sum, group) => sum + group.tasks.length, 0);
  const total = routineTotal(routine);
  const full = routine.groups.length >= MAX_GROUPS_PER_ROUTINE;

  return (
    <div className="space-y-3 rounded-xl bg-black/[0.02] p-3 dark:bg-white/[0.03]">
      <div className="flex items-center gap-2">
        {routine.kind === 'stock' && <ShoppingBasket className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          dir="auto"
          maxLength={ROUTINE_TITLE_MAX_LENGTH}
          aria-label={`Rename ${routine.title}`}
          className={fieldClass}
        />
        <IconButton title={`Remove ${routine.title}`} destructive onClick={handleDelete}>
          <Trash2 className="h-4 w-4" />
        </IconButton>
      </div>

      <p className="text-xs text-muted-foreground">
        {routine.kind === 'stock' ? 'Stock list · ' : ''}
        {describeSchedule(routine, WEEKDAY_LABELS)}
        {itemCount > 0 && ` · ${itemCount} item${itemCount === 1 ? '' : 's'}`}
        {routine.groups.length > 1 && ` in ${routine.groups.length} groups`}
        {routine.kind === 'checklist' && total > 0 && (
          <span title={`Every tick across this routine since ${formatSince(routine.createdAt)}`}>
            {' '}
            · <span className="font-medium text-foreground/70 tabular-nums">{total}</span> done all told
          </span>
        )}
      </p>

      <RoutineDayPicker routine={routine} />

      <div className="space-y-2">
        {routine.groups.map((group) => (
          <GroupEditor key={group.id} routine={routine} group={group} only={routine.groups.length === 1} />
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAddGroup();
            }
          }}
          dir="auto"
          maxLength={GROUP_TITLE_MAX_LENGTH}
          placeholder={routine.cadence === 'weekly' ? 'Add a group, e.g. Upper body' : 'Add a group, e.g. Morning'}
          aria-label={`New group for ${routine.title}`}
          disabled={full}
          className={fieldClass}
        />
        <button
          type="button"
          onClick={handleAddGroup}
          disabled={full}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-[#FF4D8E]/40 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10"
        >
          <Layers className="h-4 w-4" />
          Group
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Adding a routine                                                          */
/* -------------------------------------------------------------------------- */

/** Adds a routine already set to the cadence of the region it sits in. */
export function NewRoutineForm({ cadence, label }: { cadence: RoutineCadence; label: string }) {
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<RoutineKind>('checklist');
  const [error, setError] = useState<string | null>(null);

  const handleAdd = useCallback(() => {
    if (!addRoutine({ title, cadence, kind })) {
      setError('Give the routine a name first.');
      return;
    }

    setTitle('');
    setError(null);
  }, [cadence, kind, title]);

  return (
    <div>
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
          maxLength={ROUTINE_TITLE_MAX_LENGTH}
          placeholder={label}
          aria-label={label}
          className={fieldClass}
        />
        <button
          type="button"
          onClick={handleAdd}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#FF4D8E] px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-[#FF4D8E]/25 transition-colors hover:bg-[#FF4D8E]/90"
        >
          <Plus className="h-4 w-4" />
          Add
        </button>
      </div>

      {/* A stock list tracks what is in the cupboard rather than what got done,
          so the kind is chosen up front. */}
      <div role="group" aria-label="What kind of routine" className="mt-2 inline-flex rounded-full border border-gray-200 p-0.5 dark:border-white/10">
        {(['checklist', 'stock'] as RoutineKind[]).map((candidate) => (
          <button
            key={candidate}
            type="button"
            onClick={() => setKind(candidate)}
            aria-pressed={kind === candidate}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              kind === candidate ? 'bg-[#FF4D8E] text-white' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {candidate === 'checklist' ? 'Tick off' : 'Stock list'}
          </button>
        ))}
      </div>

      {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
    </div>
  );
}
