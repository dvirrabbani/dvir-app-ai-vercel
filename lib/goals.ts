/**
 * Goals: one day to reach something by, and how long is left until it.
 *
 * The fourth kind on the milestones page, and the simplest. A milestone counts
 * work — a target, a progress bar, tasks. A goal counts *time*: it has a single
 * date and the only question it answers is how many months, weeks and days are
 * left before that day arrives. Reaching it is a tick, not a percentage.
 *
 * Not to be confused with the dated milestones in `milestones.ts`, which run
 * between two days and measure the work done against the time spent, or with
 * `milestone-cycles.ts`, which repeats. This one is a countdown to a deadline.
 *
 * Like everything else here it lives in localStorage only — one browser's copy,
 * shared with nobody.
 */

// The same YYYY-MM-DD local day keys the calendar and the milestones use, so a
// date here means the same day it does there.
import { fromDateKey, isValidDateKey, toDateKey } from '@/lib/calendar';
// Borrowed rather than written again — whole days between two keys, rounded so
// the hour a clock change adds cannot turn a whole day into a fraction.
import { daysBetween } from '@/lib/milestones';

export interface Goal {
  id: string;
  title: string;
  /** Free text, kept as written — blank lines and all. */
  notes: string;
  /** The day it is meant to be reached by, as a local YYYY-MM-DD key. */
  date: string;
  /**
   * Ticked off by hand. A goal has nothing to count, so this is the only thing
   * that says it happened — the date passing does not decide it either way.
   */
  done: boolean;
  createdAt: string;
  updatedAt: string;
}

export const GOALS_KEY = 'dvir-goals:items';

/** Fired on `window` after any write, so open views can refresh themselves. */
export const GOALS_EVENT = 'goals-changed';

export const TITLE_MAX_LENGTH = 80;
export const NOTES_MAX_LENGTH = 2_000;

function isGoal(value: unknown): value is Goal {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Partial<Goal>;
  return typeof item.id === 'string' && typeof item.title === 'string' && typeof item.date === 'string';
}

/** Fills in what a type guard cannot cheaply check. */
function normalise(goal: Goal): Goal {
  return {
    ...goal,
    title: goal.title.slice(0, TITLE_MAX_LENGTH),
    notes: typeof goal.notes === 'string' ? goal.notes.slice(0, NOTES_MAX_LENGTH) : '',
    done: goal.done === true,
  };
}

export function getGoals(): Goal[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(GOALS_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return (
      parsed
        .filter(isGoal)
        // A goal whose date is not a real day has nothing to count down to, so
        // it is dropped rather than shown with a broken countdown.
        .filter((goal) => isValidDateKey(goal.date))
        .map(normalise)
        // Soonest first: the whole point of the section is what is coming up.
        .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
    );
  } catch {
    return [];
  }
}

function writeGoals(goals: Goal[]) {
  try {
    window.localStorage.setItem(GOALS_KEY, JSON.stringify(goals));
    window.dispatchEvent(new CustomEvent(GOALS_EVENT));
  } catch {
    // Storage unavailable (private mode, quota) — the change just does not stick.
  }
}

export function addGoal(input: { title: string; date: string; notes?: string }): Goal | null {
  const title = input.title.trim().slice(0, TITLE_MAX_LENGTH);
  if (!title) return null;
  if (!isValidDateKey(input.date)) return null;

  const now = new Date().toISOString();

  const goal: Goal = {
    id: `goal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    notes: (input.notes ?? '').trim().slice(0, NOTES_MAX_LENGTH),
    date: input.date,
    done: false,
    createdAt: now,
    updatedAt: now,
  };

  writeGoals([...getGoals(), goal]);
  return goal;
}

export function updateGoal(
  id: string,
  changes: Partial<Pick<Goal, 'title' | 'notes' | 'date' | 'done'>>
): boolean {
  const goals = getGoals();
  const existing = goals.find((goal) => goal.id === id);
  if (!existing) return false;

  const title = (changes.title ?? existing.title).trim().slice(0, TITLE_MAX_LENGTH);
  if (!title) return false;

  const date = changes.date ?? existing.date;
  if (!isValidDateKey(date)) return false;

  const updated: Goal = {
    ...existing,
    title,
    notes: (changes.notes ?? existing.notes).trim().slice(0, NOTES_MAX_LENGTH),
    date,
    done: changes.done ?? existing.done,
    updatedAt: new Date().toISOString(),
  };

  writeGoals(goals.map((goal) => (goal.id === id ? updated : goal)));
  return true;
}

export function toggleGoalDone(id: string): boolean {
  const goal = getGoals().find((item) => item.id === id);
  if (!goal) return false;
  return updateGoal(id, { done: !goal.done });
}

export function deleteGoal(id: string) {
  writeGoals(getGoals().filter((goal) => goal.id !== id));
}

/* -------------------------------------------------------------------------- */
/*  How long is left                                                          */
/* -------------------------------------------------------------------------- */

export type CountdownState = 'ahead' | 'today' | 'past';

export interface Countdown {
  state: CountdownState;
  /** Whole calendar months left, then whole weeks of what is over, then days. */
  months: number;
  weeks: number;
  days: number;
  /** The same stretch as one number, which is what "96 days" reads off. */
  totalDays: number;
}

/**
 * The same day of a later month, clamped to the end of it.
 *
 * `setMonth` overflows — the 31st of January plus one month lands in March —
 * which would make a month "left" that is not. The 28th of February is the
 * honest answer, so short months keep their last day.
 */
function addMonths(key: string, count: number): string {
  const date = fromDateKey(key);
  const shifted = new Date(date.getFullYear(), date.getMonth() + count, 1);
  const lastDay = new Date(shifted.getFullYear(), shifted.getMonth() + 1, 0).getDate();
  shifted.setDate(Math.min(date.getDate(), lastDay));
  return toDateKey(shifted);
}

/**
 * How far off a day is, split into months, weeks and days.
 *
 * The months are calendar months rather than thirties: from the 10th of March,
 * one month is the 10th of April however many days that took. What is left over
 * is cut into whole weeks and then days, so nothing is ever counted twice.
 *
 * Reads today's date by default, so it must only be called from the browser —
 * the section renders behind `hydrated`, which is what keeps the server from
 * printing a countdown the browser then disagrees with.
 */
export function countdownTo(date: string, today: string = toDateKey(new Date())): Countdown {
  const totalDays = daysBetween(today, date);
  if (totalDays === 0) return { state: 'today', months: 0, weeks: 0, days: 0, totalDays: 0 };

  // A day gone by is counted the same way as a day to come, just labelled as
  // past — so "3 weeks ago" and "3 weeks left" are worked out identically.
  const ahead = totalDays > 0;
  const from = ahead ? today : date;
  const to = ahead ? date : today;

  let months = 0;
  while (addMonths(from, months + 1) <= to) months += 1;

  const rest = daysBetween(addMonths(from, months), to);

  return {
    state: ahead ? 'ahead' : 'past',
    months,
    weeks: Math.floor(rest / 7),
    days: rest % 7,
    totalDays: Math.abs(totalDays),
  };
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * The countdown as a sentence: "2 months, 1 week and 3 days left".
 *
 * Empty parts are left out — a fortnight away says weeks and days, not "0
 * months" — and the last one is joined with "and" rather than a comma.
 */
export function countdownText(countdown: Countdown): string {
  if (countdown.state === 'today') return 'Today';

  const parts: string[] = [];
  if (countdown.months > 0) parts.push(plural(countdown.months, 'month'));
  if (countdown.weeks > 0) parts.push(plural(countdown.weeks, 'week'));
  if (countdown.days > 0) parts.push(plural(countdown.days, 'day'));

  const spelled =
    parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];

  return countdown.state === 'ahead' ? `${spelled} left` : `${spelled} ago`;
}

/** The short version for a chip: the largest part only. */
export function countdownShort(countdown: Countdown): string {
  if (countdown.state === 'today') return 'Today';

  const largest =
    countdown.months > 0
      ? plural(countdown.months, 'month')
      : countdown.weeks > 0
        ? plural(countdown.weeks, 'week')
        : plural(countdown.days, 'day');

  // "1 month left" reads as a round month when it may be a month and a fortnight,
  // so anything with more behind it says "over".
  const more =
    (countdown.months > 0 && (countdown.weeks > 0 || countdown.days > 0)) ||
    (countdown.months === 0 && countdown.weeks > 0 && countdown.days > 0);

  return countdown.state === 'ahead'
    ? `${more ? 'over ' : ''}${largest} left`
    : `${more ? 'over ' : ''}${largest} ago`;
}

/** "Sat, 12 Sep 2026" — the day itself, spelled out beside the countdown. */
export function formatGoalDate(date: string): string {
  return fromDateKey(date).toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export interface GoalSummary {
  total: number;
  reached: number;
  /** Still open with the day already gone by. */
  passed: number;
  /** Days to the nearest open goal, or null when there is none left. */
  nextInDays: number | null;
}

export function summariseGoals(goals: Goal[], today: string = toDateKey(new Date())): GoalSummary {
  const open = goals.filter((goal) => !goal.done);
  const ahead = open.filter((goal) => goal.date >= today);

  return {
    total: goals.length,
    reached: goals.length - open.length,
    passed: open.length - ahead.length,
    // The list is already soonest first, so the first one still to come is it.
    nextInDays: ahead.length > 0 ? daysBetween(today, ahead[0].date) : null,
  };
}

/**
 * Display order: the ones still to reach first, in date order, and the ones
 * already reached after them. Only for showing a list — what gets stored keeps
 * whatever order it was written in.
 */
export function sortGoalsForDisplay(goals: Goal[]): Goal[] {
  return [...goals].sort((a, b) => Number(a.done) - Number(b.done));
}
