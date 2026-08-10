'use client';

/**
 * Editing one part of the day — the morning, the noon, the evening — rather than
 * the routines behind it. Everything falling in that stretch is listed together
 * whichever routine it came from, and anything added lands there because it is
 * stamped with one of that part's own hours.
 */

import { useCallback, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { DAY_PART_DEFAULT_TIME, DAY_PART_LABELS, DayPart } from '@/lib/day-parts';
import {
  MAX_TARGET,
  MAX_TASKS_PER_GROUP,
  Routine,
  TASK_TITLE_MAX_LENGTH,
  TaskOccurrence,
  addTask,
  groupForPart,
} from '@/lib/routines';
import { EditableTaskRow } from '@/components/routines/routine-editor';
import { fieldClass, timeFieldClass } from '@/components/routines/shared';

function NewPartTaskForm({ part, routines }: { part: DayPart; routines: Routine[] }) {
  const [routineId, setRoutineId] = useState(routines[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [time, setTime] = useState(DAY_PART_DEFAULT_TIME[part]);
  const [target, setTarget] = useState('1');
  const [error, setError] = useState<string | null>(null);

  const label = DAY_PART_LABELS[part];

  // The routine picked may have been removed from the setup below while this
  // form sat open, so it falls back to the first one still there.
  const routine = routines.find((candidate) => candidate.id === routineId) ?? routines[0];

  const handleAdd = useCallback(() => {
    const group = routine ? groupForPart(routine, part) : null;
    if (!routine || !group) {
      setError('This routine has nowhere to put a task. Add a group to it in the setup below.');
      return;
    }

    const parsed = Number(target);
    // An empty time would fall back to the group's, which may sit in another
    // part of the day — a task added to the morning has to land in the morning.
    const added = addTask(routine.id, group.id, {
      title,
      time: time || DAY_PART_DEFAULT_TIME[part],
      target: Number.isFinite(parsed) ? parsed : 1,
    });

    if (!added) {
      setError(
        group.tasks.length >= MAX_TASKS_PER_GROUP
          ? 'That is as many items as one group holds.'
          : 'Give the task a name first.'
      );
      return;
    }

    setTitle('');
    setTime(DAY_PART_DEFAULT_TIME[part]);
    setTarget('1');
    setError(null);
  }, [part, routine, target, time, title]);

  return (
    <div className="space-y-2">
      {/* Which routine it belongs to only needs asking when there is a choice. */}
      {routines.length > 1 && (
        <select
          value={routine?.id ?? ''}
          onChange={(e) => setRoutineId(e.target.value)}
          aria-label={`Which routine the new ${label} task belongs to`}
          dir="auto"
          className={fieldClass}
        >
          {routines.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.title}
            </option>
          ))}
        </select>
      )}

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
        placeholder={`Add to ${label}`}
        aria-label={`New task for ${label}`}
        className={fieldClass}
      />

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          title="When it falls"
          aria-label={`Time for the new ${label} task`}
          className={`${timeFieldClass} min-w-0 flex-1`}
        />
        <input
          type="number"
          min={1}
          max={MAX_TARGET}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          title="How many times a day"
          aria-label={`How many times a day for the new ${label} task`}
          className={`${fieldClass} w-16`}
        />
        <button
          type="button"
          onClick={handleAdd}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-[#FF4D8E] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#FF4D8E]/90"
        >
          <Plus className="h-4 w-4" />
          Add
        </button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function PartEditor({
  part,
  tasks,
  routines,
}: {
  part: DayPart;
  tasks: TaskOccurrence[];
  /** The daily tick-off routines a task can be added to. */
  routines: Routine[];
}) {
  // Gathered by routine rather than by group: the groups name the sittings on the
  // card, and repeating them here would only get between the rows being edited.
  const blocks = useMemo(() => {
    const byRoutine = new Map<string, { routine: Routine; tasks: TaskOccurrence[] }>();

    for (const occurrence of tasks) {
      const block = byRoutine.get(occurrence.routine.id);
      if (block) block.tasks.push(occurrence);
      else byRoutine.set(occurrence.routine.id, { routine: occurrence.routine, tasks: [occurrence] });
    }

    return [...byRoutine.values()];
  }, [tasks]);

  if (routines.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Add a tick-off routine in the setup below, and its tasks can be split across the day.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {blocks.map((block) => (
        <div key={block.routine.id}>
          {/* Which routine a task came from only matters once there is more than
              one to have come from. */}
          {routines.length > 1 && (
            <p dir="auto" className="mb-1 text-xs font-medium text-muted-foreground">
              {block.routine.title}
            </p>
          )}
          <ul className="space-y-1.5">
            {block.tasks.map((occurrence) => (
              <EditableTaskRow
                key={occurrence.task.id}
                routine={occurrence.routine}
                group={occurrence.group}
                task={occurrence.task}
                inheritedTime={occurrence.time}
              />
            ))}
          </ul>
        </div>
      ))}

      <NewPartTaskForm part={part} routines={routines} />

      <p className="text-xs text-muted-foreground">
        A task moves to another part of the day by changing its time.
      </p>
    </div>
  );
}
