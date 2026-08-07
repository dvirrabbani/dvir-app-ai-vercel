/**
 * Milestones and how far along they are. Like the posts and the poll, these live
 * in localStorage only — this is one browser's copy, not shared with anyone.
 */

// Day keys are the same YYYY-MM-DD local strings the calendar uses, so a date
// here means the same day it does there. Only the pure helpers are borrowed.
import { fromDateKey, isValidDateKey, toDateKey } from '@/lib/calendar';

export interface MilestoneTask {
  id: string;
  title: string;
  done: boolean;
}

/** The stretch of days a milestone is meant to run over, both ends included. */
export interface MilestoneRange {
  /** Local calendar day as YYYY-MM-DD. Never after `end`. */
  start: string;
  /** Local calendar day as YYYY-MM-DD. */
  end: string;
}

export interface Milestone {
  id: string;
  title: string;
  /** Free text, kept as written — blank lines and all. */
  description: string;
  /** How much is done, always between 0 and `target`. Ignored once there are tasks. */
  current: number;
  /** What counts as finished. At least 1. Ignored once there are tasks. */
  target: number;
  /** What is being counted: "chapters", "km", "%". Optional. */
  unit: string;
  /**
   * The pieces this milestone breaks into. While it holds any, they are what
   * says how far along it is and the counter above is left alone.
   */
  tasks: MilestoneTask[];
  /**
   * The days this one runs between, or `null` when it is not on a schedule.
   * Having a range is what puts a milestone in the dated section of the page —
   * nothing else about it changes.
   */
  range: MilestoneRange | null;
  createdAt: string;
  updatedAt: string;
}

export const MILESTONES_KEY = 'dvir-milestones:items';

/** Fired on `window` after any write, so open views can refresh themselves. */
export const MILESTONES_EVENT = 'milestones-changed';

export const TITLE_MAX_LENGTH = 80;
/** Long enough to hold a few paragraphs rather than a single line of detail. */
export const DESCRIPTION_MAX_LENGTH = 2_000;
export const UNIT_MAX_LENGTH = 16;
export const MAX_TARGET = 1_000_000;
export const TASK_TITLE_MAX_LENGTH = 120;
export const MAX_TASKS_PER_MILESTONE = 100;

function isMilestone(value: unknown): value is Milestone {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Partial<Milestone>;
  return (
    typeof item.id === 'string' &&
    typeof item.title === 'string' &&
    typeof item.current === 'number' &&
    typeof item.target === 'number'
  );
}

function isTask(value: unknown): value is MilestoneTask {
  if (typeof value !== 'object' || value === null) return false;
  const task = value as Partial<MilestoneTask>;
  return typeof task.id === 'string' && typeof task.title === 'string';
}

/**
 * A usable range or nothing. Both ends have to be real days; one typed backwards
 * is read as the two dates in the other order rather than thrown away.
 */
export function normaliseRange(value: unknown): MilestoneRange | null {
  if (typeof value !== 'object' || value === null) return null;

  const range = value as Partial<MilestoneRange>;
  if (typeof range.start !== 'string' || typeof range.end !== 'string') return null;
  if (!isValidDateKey(range.start) || !isValidDateKey(range.end)) return null;

  return range.start <= range.end
    ? { start: range.start, end: range.end }
    : { start: range.end, end: range.start };
}

/** Fills in what a type guard cannot cheaply check, including older entries with no tasks. */
function normalise(milestone: Milestone): Milestone {
  const tasks = (Array.isArray(milestone.tasks) ? milestone.tasks : [])
    .filter(isTask)
    .slice(0, MAX_TASKS_PER_MILESTONE)
    .map((task) => ({
      id: task.id,
      title: task.title.slice(0, TASK_TITLE_MAX_LENGTH),
      done: task.done === true,
    }));

  return {
    ...milestone,
    description: typeof milestone.description === 'string' ? milestone.description.slice(0, DESCRIPTION_MAX_LENGTH) : '',
    unit: typeof milestone.unit === 'string' ? milestone.unit : '',
    tasks,
    // Absent on every milestone saved before dates existed, so this is the
    // upgrade path as much as it is the guard.
    range: normaliseRange(milestone.range),
  };
}

export function getMilestones(): Milestone[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(MILESTONES_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Creation order, so a milestone does not jump around as its progress moves.
    return parsed
      .filter(isMilestone)
      .map(normalise)
      .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
  } catch {
    return [];
  }
}

function writeMilestones(milestones: Milestone[]) {
  try {
    window.localStorage.setItem(MILESTONES_KEY, JSON.stringify(milestones));
    window.dispatchEvent(new CustomEvent(MILESTONES_EVENT));
  } catch {
    // Storage unavailable (private mode, quota) — the change just does not stick.
  }
}

/** Keeps a target usable and a current value inside it. */
function normaliseTarget(target: number): number {
  if (!Number.isFinite(target)) return 1;
  return Math.min(Math.max(Math.round(target), 1), MAX_TARGET);
}

function clampCurrent(current: number, target: number): number {
  if (!Number.isFinite(current)) return 0;
  return Math.min(Math.max(Math.round(current), 0), target);
}

export function addMilestone(input: {
  title: string;
  description?: string;
  target: number;
  unit?: string;
  current?: number;
  /** Leave off for a milestone with no dates on it. */
  range?: MilestoneRange | null;
}): Milestone | null {
  const title = input.title.trim().slice(0, TITLE_MAX_LENGTH);
  if (!title) return null;

  const target = normaliseTarget(input.target);
  const now = new Date().toISOString();

  const milestone: Milestone = {
    id: `milestone-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    description: (input.description ?? '').trim().slice(0, DESCRIPTION_MAX_LENGTH),
    current: clampCurrent(input.current ?? 0, target),
    target,
    unit: (input.unit ?? '').trim().slice(0, UNIT_MAX_LENGTH),
    tasks: [],
    range: normaliseRange(input.range),
    createdAt: now,
    updatedAt: now,
  };

  writeMilestones([...getMilestones(), milestone]);
  return milestone;
}

/* -------------------------------------------------------------------------- */
/*  Tasks                                                                     */
/* -------------------------------------------------------------------------- */

/** Applies a change to one milestone, leaving the rest of the list alone. */
function editMilestone(id: string, change: (milestone: Milestone) => Milestone | null): boolean {
  const milestones = getMilestones();
  const existing = milestones.find((milestone) => milestone.id === id);
  if (!existing) return false;

  const updated = change(existing);
  if (!updated) return false;

  writeMilestones(
    milestones.map((milestone) =>
      milestone.id === id ? { ...updated, updatedAt: new Date().toISOString() } : milestone
    )
  );
  return true;
}

export function addMilestoneTask(milestoneId: string, title: string): boolean {
  const trimmed = title.trim().slice(0, TASK_TITLE_MAX_LENGTH);
  if (!trimmed) return false;

  return editMilestone(milestoneId, (milestone) => {
    if (milestone.tasks.length >= MAX_TASKS_PER_MILESTONE) return null;

    const task: MilestoneTask = {
      id: `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      title: trimmed,
      done: false,
    };

    return { ...milestone, tasks: [...milestone.tasks, task] };
  });
}

export function toggleMilestoneTask(milestoneId: string, taskId: string): boolean {
  return editMilestone(milestoneId, (milestone) => {
    if (!milestone.tasks.some((task) => task.id === taskId)) return null;

    return {
      ...milestone,
      tasks: milestone.tasks.map((task) => (task.id === taskId ? { ...task, done: !task.done } : task)),
    };
  });
}

export function renameMilestoneTask(milestoneId: string, taskId: string, title: string): boolean {
  const trimmed = title.trim().slice(0, TASK_TITLE_MAX_LENGTH);
  if (!trimmed) return false;

  return editMilestone(milestoneId, (milestone) => {
    if (!milestone.tasks.some((task) => task.id === taskId)) return null;

    return {
      ...milestone,
      tasks: milestone.tasks.map((task) => (task.id === taskId ? { ...task, title: trimmed } : task)),
    };
  });
}

/**
 * Removes a task. Taking the last one out hands the milestone back to its own
 * counter, so the progress it had before the tasks arrived is what shows again.
 */
export function deleteMilestoneTask(milestoneId: string, taskId: string): boolean {
  return editMilestone(milestoneId, (milestone) => ({
    ...milestone,
    tasks: milestone.tasks.filter((task) => task.id !== taskId),
  }));
}

/** Ticks or clears every task at once, for the complete and reopen buttons. */
export function setAllMilestoneTasks(milestoneId: string, done: boolean): boolean {
  return editMilestone(milestoneId, (milestone) => {
    if (milestone.tasks.length === 0) return null;
    return { ...milestone, tasks: milestone.tasks.map((task) => ({ ...task, done })) };
  });
}

export function updateMilestone(
  id: string,
  changes: Partial<Pick<Milestone, 'title' | 'description' | 'unit' | 'target' | 'current' | 'range'>>
): boolean {
  const milestones = getMilestones();
  const existing = milestones.find((milestone) => milestone.id === id);
  if (!existing) return false;

  const title = (changes.title ?? existing.title).trim().slice(0, TITLE_MAX_LENGTH);
  if (!title) return false;

  const target = normaliseTarget(changes.target ?? existing.target);

  const updated: Milestone = {
    ...existing,
    title,
    description: (changes.description ?? existing.description).trim().slice(0, DESCRIPTION_MAX_LENGTH),
    unit: (changes.unit ?? existing.unit).trim().slice(0, UNIT_MAX_LENGTH),
    target,
    // Lowering the target pulls the progress down with it.
    current: clampCurrent(changes.current ?? existing.current, target),
    // `in` rather than `??`, so passing `null` can actually clear the dates
    // instead of being read as "leave them alone".
    range: 'range' in changes ? normaliseRange(changes.range) : existing.range,
    updatedAt: new Date().toISOString(),
  };

  writeMilestones(milestones.map((milestone) => (milestone.id === id ? updated : milestone)));
  return true;
}

/** Moves progress to an absolute value, clamped to the milestone's own range. */
export function setProgress(id: string, current: number): boolean {
  return updateMilestone(id, { current });
}

/** Nudges progress by a step, which is what the plus and minus buttons use. */
export function stepProgress(id: string, delta: number): boolean {
  const milestone = getMilestones().find((item) => item.id === id);
  if (!milestone) return false;
  return updateMilestone(id, { current: milestone.current + delta });
}

export function deleteMilestone(id: string) {
  writeMilestones(getMilestones().filter((milestone) => milestone.id !== id));
}

export interface MilestoneProgress {
  current: number;
  target: number;
  /** True when the tasks are what decide it, rather than the counter. */
  byTasks: boolean;
}

/**
 * How far along a milestone is.
 *
 * Breaking one into tasks makes those the measure: counting both would leave two
 * numbers free to disagree about the same thing. A milestone with no tasks keeps
 * the counter it was created with.
 */
export function milestoneProgress(milestone: Milestone): MilestoneProgress {
  if (milestone.tasks.length > 0) {
    return {
      current: milestone.tasks.filter((task) => task.done).length,
      target: milestone.tasks.length,
      byTasks: true,
    };
  }

  return { current: milestone.current, target: milestone.target, byTasks: false };
}

export function milestonePercent(milestone: Milestone): number {
  const { current, target } = milestoneProgress(milestone);
  if (target <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((current / target) * 100)));
}

export function isComplete(milestone: Milestone): boolean {
  const { current, target } = milestoneProgress(milestone);
  return current >= target;
}

/**
 * Display order: the ones still going first, the finished ones after, each group
 * left in the creation order `getMilestones` returns (sort is stable). Only for
 * showing a list — what gets stored stays in creation order.
 */
export function sortByCompletion<T extends Milestone>(milestones: T[]): T[] {
  return [...milestones].sort((a, b) => Number(isComplete(a)) - Number(isComplete(b)));
}

/* -------------------------------------------------------------------------- */
/*  Dates                                                                     */
/* -------------------------------------------------------------------------- */

const DAY_MS = 86_400_000;

/** A milestone that has dates on it, narrowed so `range` is no longer nullable. */
export type DatedMilestone = Milestone & { range: MilestoneRange };

export function isDated(milestone: Milestone): milestone is DatedMilestone {
  return milestone.range !== null;
}

/**
 * Whole days from one day key to the next. Both are read as local midnight and
 * the result is rounded, so the hour a clock change adds or drops cannot turn a
 * whole number of days into a fraction.
 */
export function daysBetween(from: string, to: string): number {
  return Math.round((fromDateKey(to).getTime() - fromDateKey(from).getTime()) / DAY_MS);
}

export type RangeState = 'upcoming' | 'active' | 'ended';

export interface RangeStatus {
  state: RangeState;
  /** Days the range covers, counting both ends. At least 1. */
  totalDays: number;
  /** Days from today to the end. 0 on the last day, negative once it is past. */
  daysLeft: number;
  /** Days from today to the start. 0 once it has begun. */
  daysUntilStart: number;
  /** How much of the range has gone by, 0–100 — the clock, not the work. */
  timePercent: number;
}

/**
 * Where today sits inside a range.
 *
 * `today` is a parameter so callers can pass a fixed day; it defaults to the
 * real one, which means this must only be called from the browser — the page
 * renders it behind `hydrated`, so the server never sees a different answer.
 */
export function rangeStatus(range: MilestoneRange, today: string = toDateKey(new Date())): RangeStatus {
  const totalDays = daysBetween(range.start, range.end) + 1;
  const daysUntilStart = Math.max(daysBetween(today, range.start), 0);
  const daysLeft = daysBetween(today, range.end);

  // The day in progress counts as spent, so a one-day range reads 100% on the day.
  const elapsed = Math.min(Math.max(daysBetween(range.start, today) + 1, 0), totalDays);

  return {
    state: daysUntilStart > 0 ? 'upcoming' : daysLeft < 0 ? 'ended' : 'active',
    totalDays,
    daysLeft,
    daysUntilStart,
    timePercent: Math.round((elapsed / totalDays) * 100),
  };
}

/** True when the last day has gone by with work still left. */
export function isOverdue(milestone: Milestone, today?: string): boolean {
  if (!isDated(milestone) || isComplete(milestone)) return false;
  return rangeStatus(milestone.range, today).state === 'ended';
}

export function formatRange(range: MilestoneRange): string {
  const start = fromDateKey(range.start);
  const end = fromDateKey(range.end);

  // The year is said once when both ends share it, twice when they do not.
  const sameYear = start.getFullYear() === end.getFullYear();
  const startText = start.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
  const endText = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return `${startText} – ${endText}`;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** The short "12 days left" line that sits beside the dates. */
export function rangeCountdown(status: RangeStatus): string {
  if (status.state === 'upcoming') {
    return status.daysUntilStart === 1 ? 'Starts tomorrow' : `Starts in ${plural(status.daysUntilStart, 'day')}`;
  }

  if (status.state === 'ended') {
    const over = Math.abs(status.daysLeft);
    return over === 1 ? 'Ended yesterday' : `Ended ${plural(over, 'day')} ago`;
  }

  if (status.daysLeft === 0) return 'Ends today';
  return `${plural(status.daysLeft, 'day')} left`;
}

/** The dated ones and the rest, since the page shows them in separate sections. */
export function splitByRange(milestones: Milestone[]): { dated: DatedMilestone[]; undated: Milestone[] } {
  return {
    dated: milestones.filter(isDated),
    undated: milestones.filter((milestone) => !isDated(milestone)),
  };
}

/** Soonest deadline first, so what runs out next is what is read first. */
export function sortByDeadline(milestones: DatedMilestone[]): DatedMilestone[] {
  return [...milestones].sort(
    (a, b) => a.range.end.localeCompare(b.range.end) || a.range.start.localeCompare(b.range.start)
  );
}

export interface MilestoneSummary {
  total: number;
  completed: number;
  /** Mean of every milestone's own percentage, 0 when there are none. */
  averagePercent: number;
}

export function summarise(milestones: Milestone[]): MilestoneSummary {
  if (milestones.length === 0) return { total: 0, completed: 0, averagePercent: 0 };

  const completed = milestones.filter(isComplete).length;
  const totalPercent = milestones.reduce((sum, milestone) => sum + milestonePercent(milestone), 0);

  return {
    total: milestones.length,
    completed,
    averagePercent: Math.round(totalPercent / milestones.length),
  };
}
