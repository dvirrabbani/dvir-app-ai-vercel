/**
 * Milestones and how far along they are. Like the posts and the poll, these live
 * in localStorage only — this is one browser's copy, not shared with anyone.
 */

export interface MilestoneTask {
  id: string;
  title: string;
  done: boolean;
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
  changes: Partial<Pick<Milestone, 'title' | 'description' | 'unit' | 'target' | 'current'>>
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
export function sortByCompletion(milestones: Milestone[]): Milestone[] {
  return [...milestones].sort((a, b) => Number(isComplete(a)) - Number(isComplete(b)));
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
