/**
 * Milestones that run on a cycle.
 *
 * The third kind on the milestones page. Like a dated milestone it runs between
 * two days, but instead of a counter it holds tasks pinned to particular days
 * of a repeat — a week, a fortnight, a month — that comes round again for as
 * long as the range lasts. Ticking one off is recorded against the day it was
 * done on, so the same task can be open on Wednesday and done on Monday.
 *
 * Not to be confused with `routines.ts`, which is the calendar's open-ended
 * habits — those have no end date and never finish. This one is a bounded
 * stretch of work: eight weeks of training, a month of revision.
 *
 * Like everything else here it lives in localStorage only — one browser's copy,
 * shared with nobody.
 */

import { fromDateKey, isValidDateKey, toDateKey, WEEKDAY_LABELS } from '@/lib/calendar';
import { MilestoneRange, daysBetween, normaliseRange } from '@/lib/milestones';
// Borrowed rather than written again — the same "1st, 2nd, 23rd" the calendar's
// routines already say.
import { ordinal } from '@/lib/routines';

/** How often the same set of days comes round again. */
export type CycleKind = 'week' | 'fortnight' | 'month';

export interface CycleTask {
  id: string;
  title: string;
  /**
   * Which days of each turn of the cycle this falls on.
   *
   * For a week or a fortnight these are offsets from the day a turn starts (0–6
   * and 0–13), which means each one always lands on the same weekday. For a
   * month they are days of the month, 1–31 — so "the 15th" means the 15th, and
   * a month without a 31st simply has no occurrence that turn.
   */
  days: number[];
  /**
   * How many times it needs doing on each of those days. At least 1 — pills
   * three times a day are one task with a target of 3, not three tasks.
   */
  target: number;
  /**
   * How many times it has actually been done, keyed by day. A day is absent
   * until something is done on it, and no count is ever above `target`.
   */
  counts: Record<string, number>;
}

export interface MilestoneCycle {
  id: string;
  title: string;
  /** Free text, kept as written — blank lines and all. */
  description: string;
  cycle: CycleKind;
  /** Required: something with no dates has nothing to repeat over. */
  range: MilestoneRange;
  tasks: CycleTask[];
  createdAt: string;
  updatedAt: string;
}

export const CYCLES_KEY = 'dvir-milestones:cycles';

/** Fired on `window` after any write, so open views can refresh themselves. */
export const CYCLES_EVENT = 'milestone-cycles-changed';

export const TITLE_MAX_LENGTH = 80;
export const DESCRIPTION_MAX_LENGTH = 2_000;
export const TASK_TITLE_MAX_LENGTH = 120;
export const MAX_TASKS_PER_CYCLE = 50;
/** The same ceiling the calendar's routines put on a task's daily target. */
export const MAX_TIMES_PER_DAY = 20;

/**
 * Ceilings on how far the day-by-day helpers below will walk. Storage is
 * hand-editable, so a range of a thousand years must not become a loop that
 * never returns; these are far past anything a real milestone needs.
 */
const MAX_ENUMERATED_DAYS = 2_000;
const MAX_TURNS = 400;

export const CYCLE_KINDS: CycleKind[] = ['week', 'fortnight', 'month'];

export const CYCLE_LABELS: Record<CycleKind, string> = {
  week: 'Every week',
  fortnight: 'Every two weeks',
  month: 'Every month',
};

export const CYCLE_SHORT_LABELS: Record<CycleKind, string> = {
  week: 'Weekly',
  fortnight: 'Fortnightly',
  month: 'Monthly',
};

/** What one turn of each cycle is called, for "Week 3 of 8". */
export const TURN_LABELS: Record<CycleKind, string> = {
  week: 'Week',
  fortnight: 'Fortnight',
  month: 'Month',
};

/** How many days one turn covers, or `null` for a month — those vary. */
export function cycleDays(cycle: CycleKind): number | null {
  if (cycle === 'week') return 7;
  if (cycle === 'fortnight') return 14;
  return null;
}

function isCycleKind(value: unknown): value is CycleKind {
  return value === 'week' || value === 'fortnight' || value === 'month';
}

/* -------------------------------------------------------------------------- */
/*  Days                                                                      */
/* -------------------------------------------------------------------------- */

/** Every day key from one to the other, both ends included. */
export function eachDayKey(start: string, end: string): string[] {
  if (!isValidDateKey(start) || !isValidDateKey(end) || start > end) return [];

  const keys: string[] = [];
  const cursor = fromDateKey(start);
  const last = fromDateKey(end);

  while (cursor.getTime() <= last.getTime() && keys.length < MAX_ENUMERATED_DAYS) {
    keys.push(toDateKey(cursor));
    // `setDate` past the end of a month rolls over on its own, and reading the
    // parts back out means a clock change cannot shift which day this is.
    cursor.setDate(cursor.getDate() + 1);
  }

  return keys;
}

/** Which day of its turn a date is, or `null` when it falls outside the range. */
export function cycleDayOf(item: MilestoneCycle, key: string): number | null {
  if (key < item.range.start || key > item.range.end) return null;

  const length = cycleDays(item.cycle);
  if (length === null) return fromDateKey(key).getDate();

  const offset = daysBetween(item.range.start, key);
  return offset < 0 ? null : offset % length;
}

/** True when this task is meant to be done on that day. */
export function occursOn(item: MilestoneCycle, task: CycleTask, key: string): boolean {
  const day = cycleDayOf(item, key);
  return day !== null && task.days.includes(day);
}

/* -------------------------------------------------------------------------- */
/*  Storage                                                                   */
/* -------------------------------------------------------------------------- */

function isMilestoneCycle(value: unknown): value is MilestoneCycle {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Partial<MilestoneCycle>;
  return typeof item.id === 'string' && typeof item.title === 'string';
}

function isCycleTask(value: unknown): value is CycleTask {
  if (typeof value !== 'object' || value === null) return false;
  const task = value as Partial<CycleTask>;
  return typeof task.id === 'string' && typeof task.title === 'string';
}

/** Whole numbers the given cycle actually has, in order and without repeats. */
export function normaliseDays(cycle: CycleKind, days: unknown): number[] {
  if (!Array.isArray(days)) return [];

  const length = cycleDays(cycle);
  const lowest = length === null ? 1 : 0;
  const highest = length === null ? 31 : length - 1;

  const kept = new Set<number>();
  for (const day of days) {
    if (typeof day !== 'number' || !Number.isFinite(day)) continue;
    const rounded = Math.round(day);
    if (rounded < lowest || rounded > highest) continue;
    kept.add(rounded);
  }

  return [...kept].sort((a, b) => a - b);
}

/** A usable number of times a day: whole, at least one, not absurd. */
function normaliseTarget(target: unknown): number {
  if (typeof target !== 'number' || !Number.isFinite(target)) return 1;
  return Math.min(Math.max(Math.round(target), 1), MAX_TIMES_PER_DAY);
}

/**
 * What has been done, keyed by day: real days inside the range, counts inside
 * the target. Lowering a target pulls the counts down with it, since this runs
 * on every read.
 */
function normaliseCounts(counts: unknown, range: MilestoneRange, target: number): Record<string, number> {
  const kept: Record<string, number> = {};

  // The shape before a task could need doing more than once a day: a plain list
  // of the days it was done on, each of which was a single go.
  if (Array.isArray(counts)) {
    for (const key of counts) {
      if (typeof key !== 'string' || !isValidDateKey(key)) continue;
      if (key < range.start || key > range.end) continue;
      kept[key] = 1;
    }
    return kept;
  }

  if (typeof counts !== 'object' || counts === null) return {};

  let size = 0;
  for (const [key, count] of Object.entries(counts)) {
    if (size >= MAX_ENUMERATED_DAYS) break;
    if (!isValidDateKey(key) || key < range.start || key > range.end) continue;
    if (typeof count !== 'number' || !Number.isFinite(count)) continue;

    const clamped = Math.min(Math.round(count), target);
    // Nothing done is said by the day being absent, not by a zero.
    if (clamped <= 0) continue;

    kept[key] = clamped;
    size += 1;
  }

  return kept;
}

/**
 * Fills in what a type guard cannot cheaply check. Days the cycle does not have
 * and ticks outside the range are dropped here, which is also what shortening a
 * range or switching a cycle relies on to leave nothing dangling behind.
 */
function normalise(item: MilestoneCycle, range: MilestoneRange): MilestoneCycle {
  const cycle = isCycleKind(item.cycle) ? item.cycle : 'week';

  const tasks = (Array.isArray(item.tasks) ? item.tasks : [])
    .filter(isCycleTask)
    .slice(0, MAX_TASKS_PER_CYCLE)
    .map((task) => {
      const target = normaliseTarget(task.target);
      return {
        id: task.id,
        title: task.title.slice(0, TASK_TITLE_MAX_LENGTH),
        days: normaliseDays(cycle, task.days),
        target,
        // `counts ?? done` is the upgrade path from before targets existed, when
        // this was a list of the days the task was ticked on.
        counts: normaliseCounts(task.counts ?? (task as { done?: unknown }).done, range, target),
      };
    });

  return {
    ...item,
    description: typeof item.description === 'string' ? item.description.slice(0, DESCRIPTION_MAX_LENGTH) : '',
    cycle,
    range,
    tasks,
  };
}

export function getMilestoneCycles(): MilestoneCycle[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(CYCLES_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(isMilestoneCycle)
      .map((item) => {
        // Without usable dates there is nothing to repeat over, so it is dropped
        // rather than shown as an empty shell.
        const range = normaliseRange(item.range);
        return range ? normalise(item, range) : null;
      })
      .filter((item): item is MilestoneCycle => item !== null)
      .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
  } catch {
    return [];
  }
}

function writeCycles(items: MilestoneCycle[]) {
  try {
    window.localStorage.setItem(CYCLES_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent(CYCLES_EVENT));
  } catch {
    // Storage unavailable (private mode, quota) — the change just does not stick.
  }
}

export function addMilestoneCycle(input: {
  title: string;
  description?: string;
  cycle: CycleKind;
  range: MilestoneRange;
}): MilestoneCycle | null {
  const title = input.title.trim().slice(0, TITLE_MAX_LENGTH);
  if (!title) return null;

  const range = normaliseRange(input.range);
  if (!range) return null;

  const now = new Date().toISOString();

  const item: MilestoneCycle = {
    id: `cycle-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    description: (input.description ?? '').trim().slice(0, DESCRIPTION_MAX_LENGTH),
    cycle: isCycleKind(input.cycle) ? input.cycle : 'week',
    range,
    tasks: [],
    createdAt: now,
    updatedAt: now,
  };

  writeCycles([...getMilestoneCycles(), item]);
  return item;
}

/** Applies a change to one of them, leaving the rest of the list alone. */
function edit(id: string, change: (item: MilestoneCycle) => MilestoneCycle | null): boolean {
  const items = getMilestoneCycles();
  const existing = items.find((item) => item.id === id);
  if (!existing) return false;

  const updated = change(existing);
  if (!updated) return false;

  const range = normaliseRange(updated.range);
  if (!range) return false;

  writeCycles(
    items.map((item) =>
      item.id === id ? { ...normalise(updated, range), updatedAt: new Date().toISOString() } : item
    )
  );
  return true;
}

export function updateMilestoneCycle(
  id: string,
  changes: Partial<Pick<MilestoneCycle, 'title' | 'description' | 'cycle' | 'range'>>
): boolean {
  return edit(id, (item) => {
    const title = (changes.title ?? item.title).trim().slice(0, TITLE_MAX_LENGTH);
    if (!title) return null;

    // Moving to a different cycle changes what a day number means, so
    // `normalise` re-reads every task's days against the new one — a Thursday
    // picked on a weekly cycle is not the same offset on a monthly one.
    return {
      ...item,
      title,
      description: (changes.description ?? item.description).trim().slice(0, DESCRIPTION_MAX_LENGTH),
      cycle: isCycleKind(changes.cycle) ? changes.cycle : item.cycle,
      range: changes.range ?? item.range,
    };
  });
}

export function deleteMilestoneCycle(id: string) {
  writeCycles(getMilestoneCycles().filter((item) => item.id !== id));
}

/* -------------------------------------------------------------------------- */
/*  Tasks                                                                     */
/* -------------------------------------------------------------------------- */

export function addCycleTask(cycleId: string, title: string, days: number[], target = 1): boolean {
  const trimmed = title.trim().slice(0, TASK_TITLE_MAX_LENGTH);
  if (!trimmed) return false;

  return edit(cycleId, (item) => {
    if (item.tasks.length >= MAX_TASKS_PER_CYCLE) return null;

    const chosen = normaliseDays(item.cycle, days);
    // A task on no days would never come up, so it is not a task yet.
    if (chosen.length === 0) return null;

    const task: CycleTask = {
      id: `cycle-task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      title: trimmed,
      days: chosen,
      target: normaliseTarget(target),
      counts: {},
    };

    return { ...item, tasks: [...item.tasks, task] };
  });
}

/**
 * Changes how many times a day a task needs doing. Lowering it trims whatever
 * was already counted above the new figure — `normalise` does that on the way
 * out, so a target raised again does not bring the old surplus back.
 */
export function setCycleTaskTarget(cycleId: string, taskId: string, target: number): boolean {
  return edit(cycleId, (item) => {
    if (!item.tasks.some((task) => task.id === taskId)) return null;

    return {
      ...item,
      tasks: item.tasks.map((task) =>
        task.id === taskId ? { ...task, target: normaliseTarget(target) } : task
      ),
    };
  });
}

export function renameCycleTask(cycleId: string, taskId: string, title: string): boolean {
  const trimmed = title.trim().slice(0, TASK_TITLE_MAX_LENGTH);
  if (!trimmed) return false;

  return edit(cycleId, (item) => {
    if (!item.tasks.some((task) => task.id === taskId)) return null;

    return {
      ...item,
      tasks: item.tasks.map((task) => (task.id === taskId ? { ...task, title: trimmed } : task)),
    };
  });
}

/**
 * Adds or removes one of the days a task falls on. Taking the last day away is
 * refused — a task on no day can never come up, and deleting it is what that
 * means.
 */
export function toggleCycleTaskDay(cycleId: string, taskId: string, day: number): boolean {
  return edit(cycleId, (item) => {
    const task = item.tasks.find((candidate) => candidate.id === taskId);
    if (!task) return null;

    const on = task.days.includes(day);
    if (on && task.days.length === 1) return null;

    const days = normaliseDays(item.cycle, on ? task.days.filter((value) => value !== day) : [...task.days, day]);
    if (days.length === 0) return null;

    return {
      ...item,
      tasks: item.tasks.map((candidate) => (candidate.id === taskId ? { ...candidate, days } : candidate)),
    };
  });
}

export function deleteCycleTask(cycleId: string, taskId: string): boolean {
  return edit(cycleId, (item) => ({
    ...item,
    tasks: item.tasks.filter((task) => task.id !== taskId),
  }));
}

/** How many times a task has been done on one day, never above its target. */
export function countFor(task: CycleTask, key: string): number {
  return Math.min(task.counts[key] ?? 0, task.target);
}

/** True once a day's count has reached the target — every go accounted for. */
export function isTaskDoneOn(task: CycleTask, key: string): boolean {
  return countFor(task, key) >= task.target;
}

/** Puts a count on one day, clamped to 0–target. Zero drops the day entirely. */
function withCount(task: CycleTask, key: string, count: number): CycleTask {
  const counts = { ...task.counts };
  const clamped = Math.min(Math.max(Math.round(count), 0), task.target);

  if (clamped <= 0) delete counts[key];
  else counts[key] = clamped;

  return { ...task, counts };
}

/**
 * Applies a change to one task's count on one day. The day has to be one the
 * task actually falls on, so a count can never be recorded against a day
 * nothing was asked for.
 */
function editCount(
  cycleId: string,
  taskId: string,
  key: string,
  next: (task: CycleTask) => number
): boolean {
  return edit(cycleId, (item) => {
    const task = item.tasks.find((candidate) => candidate.id === taskId);
    if (!task || !occursOn(item, task, key)) return null;

    return {
      ...item,
      tasks: item.tasks.map((candidate) =>
        candidate.id === taskId ? withCount(candidate, key, next(candidate)) : candidate
      ),
    };
  });
}

/** All the way done, or all the way back to nothing — what the checkbox does. */
export function toggleCycleDone(cycleId: string, taskId: string, key: string): boolean {
  return editCount(cycleId, taskId, key, (task) => (isTaskDoneOn(task, key) ? 0 : task.target));
}

/** One go up or down, which is what the plus and minus buttons use. */
export function stepCycleCount(cycleId: string, taskId: string, key: string, delta: number): boolean {
  return editCount(cycleId, taskId, key, (task) => countFor(task, key) + delta);
}

export function setCycleCount(cycleId: string, taskId: string, key: string, count: number): boolean {
  return editCount(cycleId, taskId, key, () => count);
}

/** Finishes or clears everything due on one day, for the per-day button. */
export function setCycleDayDone(cycleId: string, key: string, done: boolean): boolean {
  return edit(cycleId, (item) => {
    const due = new Set(item.tasks.filter((task) => occursOn(item, task, key)).map((task) => task.id));
    if (due.size === 0) return null;

    return {
      ...item,
      tasks: item.tasks.map((task) =>
        due.has(task.id) ? withCount(task, key, done ? task.target : 0) : task
      ),
    };
  });
}

/* -------------------------------------------------------------------------- */
/*  Turns of the cycle                                                        */
/* -------------------------------------------------------------------------- */

/** One turn of the cycle, already clipped to the milestone's own range. */
export interface CycleTurn {
  index: number;
  start: string;
  end: string;
}

/**
 * Every turn the cycle takes between the two dates.
 *
 * Weeks and fortnights are counted off from the first day, so one that starts on
 * a Wednesday has turns running Wednesday to Tuesday. Months are calendar months
 * instead — that is the only way "the 15th" can keep meaning the 15th — which
 * leaves the first and last ones short whenever the range begins or ends
 * mid-month.
 */
export function cycleTurns(item: MilestoneCycle): CycleTurn[] {
  const turns: CycleTurn[] = [];
  const last = fromDateKey(item.range.end);
  const cursor = fromDateKey(item.range.start);
  const length = cycleDays(item.cycle);

  while (cursor.getTime() <= last.getTime() && turns.length < MAX_TURNS) {
    const turnEnd =
      length === null
        ? // Day 0 of the next month is the last day of this one.
          new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
        : new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + length - 1);

    turns.push({
      index: turns.length,
      start: toDateKey(cursor),
      end: toDateKey(turnEnd.getTime() < last.getTime() ? turnEnd : last),
    });

    if (length === null) cursor.setMonth(cursor.getMonth() + 1, 1);
    else cursor.setDate(cursor.getDate() + length);
  }

  return turns;
}

/**
 * The turn today falls in, or the nearest one when it has not started or has
 * already ended. Reads the real date, so browser only — every caller renders
 * behind `hydrated`.
 */
export function currentTurnIndex(turns: CycleTurn[], today: string = toDateKey(new Date())): number {
  if (turns.length === 0) return 0;

  const found = turns.findIndex((turn) => today >= turn.start && today <= turn.end);
  if (found !== -1) return found;

  return today < turns[0].start ? 0 : turns.length - 1;
}

/** The days of one turn that have anything on them, each with its tasks. */
export interface CycleDay {
  key: string;
  tasks: CycleTask[];
}

export function planForTurn(item: MilestoneCycle, turn: CycleTurn): CycleDay[] {
  return eachDayKey(turn.start, turn.end)
    .map((key) => ({ key, tasks: item.tasks.filter((task) => occursOn(item, task, key)) }))
    .filter((day) => day.tasks.length > 0);
}

/** What is due on one day, which is what the section's "today" line reads from. */
export function dueOn(item: MilestoneCycle, key: string): CycleTask[] {
  return item.tasks.filter((task) => occursOn(item, task, key));
}

/* -------------------------------------------------------------------------- */
/*  Progress                                                                  */
/* -------------------------------------------------------------------------- */

export interface CycleProgress {
  done: number;
  /** Every go a task asks for over the span being counted. */
  total: number;
  percent: number;
}

/**
 * How much has been done, over the whole range or over one turn.
 *
 * Counted in goes rather than occurrences, so a task needed three times a day
 * is worth three: two tasks on four days each, one of them three times a day,
 * is 4 + 12 = 16, and one press of the plus button moves the bar a sixteenth.
 */
export function cycleProgress(item: MilestoneCycle, within?: { start: string; end: string }): CycleProgress {
  const start = within && within.start > item.range.start ? within.start : item.range.start;
  const end = within && within.end < item.range.end ? within.end : item.range.end;
  const days = eachDayKey(start, end);

  let total = 0;
  let done = 0;

  for (const task of item.tasks) {
    for (const key of days) {
      if (!occursOn(item, task, key)) continue;
      total += task.target;
      done += countFor(task, key);
    }
  }

  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

export function isCycleComplete(item: MilestoneCycle): boolean {
  const { done, total } = cycleProgress(item);
  return total > 0 && done === total;
}

/* -------------------------------------------------------------------------- */
/*  Labels                                                                    */
/* -------------------------------------------------------------------------- */

/** One button in the day picker: the number stored, and what to call it. */
export interface DayChoice {
  value: number;
  label: string;
  /** Which row it belongs to, for the fortnight's two weeks. Empty otherwise. */
  group: string;
}

/**
 * The days a task can be put on, in the order they should be shown.
 *
 * Weekly and fortnightly cycles store offsets from the first day, but an offset
 * is not something anyone thinks in — since a week's offset always lands on the
 * same weekday, these come back labelled as weekdays and laid out Sunday first,
 * whichever day the range happens to begin on.
 */
export function dayChoices(item: Pick<MilestoneCycle, 'cycle' | 'range'>): DayChoice[] {
  if (item.cycle === 'month') {
    return Array.from({ length: 31 }, (_, index) => ({ value: index + 1, label: String(index + 1), group: '' }));
  }

  const startWeekday = fromDateKey(item.range.start).getDay();
  const weeks = item.cycle === 'fortnight' ? 2 : 1;

  return Array.from({ length: weeks }, (_, week) =>
    WEEKDAY_LABELS.map((label, weekday) => ({
      value: week * 7 + ((weekday - startWeekday + 7) % 7),
      label,
      group: weeks === 1 ? '' : `Week ${week + 1}`,
    }))
  ).flat();
}

/** What to call one stored day number — the same text the picker shows. */
export function dayLabel(item: Pick<MilestoneCycle, 'cycle' | 'range'>, day: number): string {
  if (item.cycle === 'month') return `The ${ordinal(day)}`;

  const startWeekday = fromDateKey(item.range.start).getDay();
  const weekday = WEEKDAY_LABELS[(startWeekday + day) % 7];

  return item.cycle === 'fortnight' && day >= 7 ? `${weekday} (wk 2)` : weekday;
}

export function formatDayKey(key: string): string {
  return fromDateKey(key).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
