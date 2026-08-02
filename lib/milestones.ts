/**
 * Milestones and how far along they are. Like the posts and the poll, these live
 * in localStorage only — this is one browser's copy, not shared with anyone.
 */

export interface Milestone {
  id: string;
  title: string;
  description: string;
  /** How much is done, always between 0 and `target`. */
  current: number;
  /** What counts as finished. At least 1. */
  target: number;
  /** What is being counted: "chapters", "km", "%". Optional. */
  unit: string;
  createdAt: string;
  updatedAt: string;
}

export const MILESTONES_KEY = 'dvir-milestones:items';

/** Fired on `window` after any write, so open views can refresh themselves. */
export const MILESTONES_EVENT = 'milestones-changed';

export const TITLE_MAX_LENGTH = 80;
export const DESCRIPTION_MAX_LENGTH = 240;
export const UNIT_MAX_LENGTH = 16;
export const MAX_TARGET = 1_000_000;

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

export function getMilestones(): Milestone[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(MILESTONES_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Creation order, so a milestone does not jump around as its progress moves.
    return parsed.filter(isMilestone).sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
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
    createdAt: now,
    updatedAt: now,
  };

  writeMilestones([...getMilestones(), milestone]);
  return milestone;
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

export function milestonePercent(milestone: Milestone): number {
  if (milestone.target <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((milestone.current / milestone.target) * 100)));
}

export function isComplete(milestone: Milestone): boolean {
  return milestone.current >= milestone.target;
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
