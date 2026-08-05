/**
 * Routines: the things that come round again rather than happening once.
 *
 * A routine is pinned to a repeat — every day, certain weekdays, or certain days
 * of the month — and holds groups. A group is one sitting of the routine: the
 * morning half of a medicine round, or the upper-body session of a training
 * week. It can carry its own days and its own time, so one Exercise routine can
 * put upper body on Monday and lower body on Wednesday.
 *
 * Inside a group are tasks. A checklist task is ticked off against the day it
 * belongs to and can need doing more than once (a pill taken three times a day
 * has a target of 3). A stock routine works differently: its items are not
 * ticked off but carry a standing state — have, running low, need to buy —
 * which persists week to week rather than resetting.
 *
 * Like the events beside them, all of it lives in localStorage only — this is
 * one browser's copy, not shared with anyone.
 */

import { fromDateKey, isValidDateKey, toDateKey } from '@/lib/calendar';

export type RoutineCadence = 'daily' | 'weekly' | 'monthly';

/** A checklist is ticked off per day; a stock list holds a standing state. */
export type RoutineKind = 'checklist' | 'stock';

export type StockState = 'have' | 'low' | 'need';

export interface RoutineTask {
  id: string;
  title: string;
  /** HH:MM in 24h, or empty to take the group's time. */
  time: string;
  /** How many times a day it needs doing. At least 1. */
  target: number;
  /** When the task was added, which is what its running total counts from. */
  createdAt: string;
}

export interface RoutineGroup {
  id: string;
  title: string;
  /**
   * The days this group falls on, read the same way as the routine's own days.
   * Empty means every day the routine falls on, which is what a group that is
   * only there to organise the list wants.
   */
  days: number[];
  /** HH:MM for the whole sitting, or empty. */
  time: string;
  tasks: RoutineTask[];
}

export interface Routine {
  id: string;
  title: string;
  note: string;
  kind: RoutineKind;
  cadence: RoutineCadence;
  /** Weekday numbers 0-6 for weekly, day-of-month 1-31 for monthly. */
  days: number[];
  groups: RoutineGroup[];
  /** Checklist only: how many times `taskId|YYYY-MM-DD` was done that day. */
  progress: Record<string, number>;
  /**
   * Every tick ever recorded against a task, keyed by task id. Kept apart from
   * `progress` because that is trimmed to the last year — the running total is
   * meant to survive the day it was earned on being forgotten.
   */
  totals: Record<string, number>;
  /** Stock only: the standing state of each item, keyed by task id. */
  stock: Record<string, StockState>;
  createdAt: string;
}

export const ROUTINES_KEY = 'dvir-routines:items';

/** Fired on `window` after any write, so open views can refresh themselves. */
export const ROUTINES_EVENT = 'routines-changed';

export const ROUTINE_TITLE_MAX_LENGTH = 80;
export const ROUTINE_NOTE_MAX_LENGTH = 240;
export const GROUP_TITLE_MAX_LENGTH = 60;
export const TASK_TITLE_MAX_LENGTH = 80;

export const MAX_GROUPS_PER_ROUTINE = 20;
export const MAX_TASKS_PER_GROUP = 60;
export const MAX_TARGET = 20;

/** Progress older than this is dropped, so storage cannot grow without bound. */
const PROGRESS_HISTORY_DAYS = 370;

export const ROUTINE_CADENCES: RoutineCadence[] = ['daily', 'weekly', 'monthly'];

export const CADENCE_LABELS: Record<RoutineCadence, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

/** What each region of the page calls its stretch of time. */
export const CADENCE_REGION_LABELS: Record<RoutineCadence, string> = {
  daily: 'Every day',
  weekly: 'Every week',
  monthly: 'Every month',
};

export const STOCK_STATES: StockState[] = ['have', 'low', 'need'];

export const STOCK_LABELS: Record<StockState, string> = {
  have: 'Have',
  low: 'Low',
  need: 'Buy',
};

export const STOCK_FULL_LABELS: Record<StockState, string> = {
  have: 'Have it',
  low: 'Running low',
  need: 'Need to buy',
};

/* -------------------------------------------------------------------------- */
/*  Days                                                                      */
/* -------------------------------------------------------------------------- */

export function todayKey(): string {
  return toDateKey(new Date());
}

/** The seven days of the week holding `date`, Sunday first. */
export function weekDays(date: Date): Date[] {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay());
  return Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

export function lastDayOfMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

/**
 * Whether a set of day numbers covers this date.
 *
 * A monthly day pinned past the end of a short month lands on its last day
 * instead: the 31st is due on the 30th in June and the 28th in February, rather
 * than silently skipping the month.
 */
function daysCover(cadence: RoutineCadence, days: number[], date: Date): boolean {
  if (cadence === 'weekly') return days.includes(date.getDay());

  const dayOfMonth = date.getDate();
  const last = lastDayOfMonth(date);
  return days.some((day) => day === dayOfMonth || (day > last && dayOfMonth === last));
}

export function occursOn(routine: Routine, date: Date): boolean {
  if (routine.cadence === 'daily') return true;
  if (routine.days.length === 0) return false;
  return daysCover(routine.cadence, routine.days, date);
}

/** A group with no days of its own falls wherever its routine does. */
export function groupOccursOn(routine: Routine, group: RoutineGroup, date: Date): boolean {
  if (!occursOn(routine, date)) return false;
  if (routine.cadence === 'daily' || group.days.length === 0) return true;
  return daysCover(routine.cadence, group.days, date);
}

/** "1st", "2nd", "23rd" — 11th to 13th are the exceptions to the last-digit rule. */
export function ordinal(day: number): string {
  const suffix = day % 100 >= 11 && day % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][day % 10] ?? 'th';
  return `${day}${suffix}`;
}

/** How a set of day numbers reads in a sentence. */
export function describeDays(cadence: RoutineCadence, days: number[], weekdayLabels: string[]): string {
  if (days.length === 0) return '';
  if (cadence === 'weekly') return days.map((day) => weekdayLabels[day] ?? '?').join(', ');
  return days.map(ordinal).join(', ');
}

export function describeSchedule(routine: Routine, weekdayLabels: string[]): string {
  if (routine.cadence === 'daily') return 'Every day';
  if (routine.days.length === 0) return 'No days picked yet';
  return describeDays(routine.cadence, routine.days, weekdayLabels);
}

/* -------------------------------------------------------------------------- */
/*  Doing the work                                                            */
/* -------------------------------------------------------------------------- */

function progressKey(taskId: string, dateKey: string): string {
  return `${taskId}|${dateKey}`;
}

export function countFor(routine: Routine, taskId: string, dateKey: string): number {
  return routine.progress[progressKey(taskId, dateKey)] ?? 0;
}

/** Every tick this task has ever had, counting from the day it was added. */
export function totalFor(routine: Routine, taskId: string): number {
  return routine.totals[taskId] ?? 0;
}

/** Everything the routine has clocked up, across all of its tasks. */
export function routineTotal(routine: Routine): number {
  let sum = 0;
  for (const group of routine.groups) {
    for (const task of group.tasks) sum += totalFor(routine, task.id);
  }
  return sum;
}

export function formatSince(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

export interface TaskOccurrence {
  routine: Routine;
  group: RoutineGroup;
  task: RoutineTask;
  /** The day this occurrence belongs to, YYYY-MM-DD. */
  date: string;
  /** How many of the target are done. */
  count: number;
  target: number;
  done: boolean;
  /** The task's own time, falling back to the group's. */
  time: string;
  /** Every tick since the task was added, not just the ones still on record. */
  total: number;
}

export interface GroupOccurrence {
  routine: Routine;
  group: RoutineGroup;
  date: string;
  tasks: TaskOccurrence[];
}

/**
 * Untimed first, then by time — the same order the events list uses. Anything
 * sharing a time keeps the order it was written in; sorting on the id instead
 * would put task 10 before task 9.
 */
function byTimeThen<T extends { time: string; order: number }>(a: T, b: T): number {
  if (a.time !== b.time) return (a.time || '').localeCompare(b.time || '');
  return a.order - b.order;
}

/** Every group of the given cadence that falls on this day, with its tasks. */
export function occurrencesOn(routines: Routine[], cadence: RoutineCadence, date: Date): GroupOccurrence[] {
  const dateKey = toDateKey(date);
  const found: Array<GroupOccurrence & { time: string; order: number }> = [];

  // Routines come in creation order and groups in the order they were added, so
  // a running counter is exactly "the order these were written in".
  let order = 0;

  for (const routine of routines) {
    if (routine.cadence !== cadence) continue;

    for (const group of routine.groups) {
      if (!groupOccursOn(routine, group, date)) continue;

      const tasks = group.tasks
        .map((task, index) => {
          const count = countFor(routine, task.id, dateKey);
          return {
            routine,
            group,
            task,
            date: dateKey,
            count,
            target: task.target,
            done: count >= task.target,
            time: task.time || group.time,
            total: totalFor(routine, task.id),
            order: index,
          };
        })
        .sort(byTimeThen);

      found.push({ routine, group, date: dateKey, tasks, time: group.time, order: order++ });
    }
  }

  return found.sort(byTimeThen);
}

export interface DayProgress {
  total: number;
  done: number;
}

/** Counted in tasks rather than in ticks, so a cell reads as "2 of 3 things". */
export function progressOf(groups: GroupOccurrence[]): DayProgress {
  let total = 0;
  let done = 0;

  for (const group of groups) {
    for (const task of group.tasks) {
      // A stock item is "done" when it is in the cupboard, not when it is ticked.
      if (group.routine.kind === 'stock') {
        total++;
        if (stockStateOf(group.routine, task.task.id) === 'have') done++;
        continue;
      }

      total++;
      if (task.done) done++;
    }
  }

  return { total, done };
}

/* -------------------------------------------------------------------------- */
/*  Stock                                                                     */
/* -------------------------------------------------------------------------- */

export function stockStateOf(routine: Routine, taskId: string): StockState {
  return routine.stock[taskId] ?? 'have';
}

/** Everything not in the cupboard, which is what you take to the shop. */
export function shoppingList(routine: Routine): RoutineTask[] {
  const wanted: RoutineTask[] = [];

  for (const group of routine.groups) {
    for (const task of group.tasks) {
      if (stockStateOf(routine, task.id) !== 'have') wanted.push(task);
    }
  }

  return wanted;
}

/* -------------------------------------------------------------------------- */
/*  Storage                                                                   */
/* -------------------------------------------------------------------------- */

function isCadence(value: unknown): value is RoutineCadence {
  return value === 'daily' || value === 'weekly' || value === 'monthly';
}

function isStockState(value: unknown): value is StockState {
  return value === 'have' || value === 'low' || value === 'need';
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Empty unless it looks like HH:MM, so a stray value cannot break sorting. */
function normaliseTime(time: unknown): string {
  const trimmed = typeof time === 'string' ? time.trim() : '';
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(trimmed) ? trimmed : '';
}

function normaliseTarget(target: unknown): number {
  if (typeof target !== 'number' || !Number.isFinite(target)) return 1;
  return Math.min(MAX_TARGET, Math.max(1, Math.floor(target)));
}

/** Whole numbers inside the range the cadence allows, deduplicated and sorted. */
function normaliseDays(cadence: RoutineCadence, days: unknown): number[] {
  if (cadence === 'daily' || !Array.isArray(days)) return [];

  const [min, max] = cadence === 'weekly' ? [0, 6] : [1, 31];
  const kept = new Set<number>();

  for (const day of days) {
    if (typeof day !== 'number' || !Number.isInteger(day) || day < min || day > max) continue;
    kept.add(day);
  }

  return [...kept].sort((a, b) => a - b);
}

function normaliseTask(value: unknown, bornAt: string): RoutineTask | null {
  if (typeof value !== 'object' || value === null) return null;
  const task = value as Partial<RoutineTask>;
  if (typeof task.id !== 'string' || typeof task.title !== 'string') return null;

  return {
    id: task.id,
    title: task.title.slice(0, TASK_TITLE_MAX_LENGTH),
    time: normaliseTime(task.time),
    target: normaliseTarget(task.target),
    // A task written before totals existed takes its routine's birthday, which
    // is the earliest it could honestly claim.
    createdAt: typeof task.createdAt === 'string' ? task.createdAt : bornAt,
  };
}

function normaliseGroup(value: unknown, cadence: RoutineCadence, bornAt: string): RoutineGroup | null {
  if (typeof value !== 'object' || value === null) return null;
  const group = value as Partial<RoutineGroup>;
  if (typeof group.id !== 'string' || typeof group.title !== 'string') return null;

  const tasks: RoutineTask[] = [];
  for (const raw of Array.isArray(group.tasks) ? group.tasks : []) {
    const task = normaliseTask(raw, bornAt);
    if (task) tasks.push(task);
    if (tasks.length >= MAX_TASKS_PER_GROUP) break;
  }

  return {
    id: group.id,
    title: group.title.slice(0, GROUP_TITLE_MAX_LENGTH),
    days: normaliseDays(cadence, group.days),
    time: normaliseTime(group.time),
    tasks,
  };
}

/* ---- Older shapes ---------------------------------------------------------- */

/** The first shape: one title, a rolling start date and a completion history. */
function migrateFromV1(value: Record<string, unknown>): Record<string, unknown> | null {
  const { id, title, cadence, startDate } = value;
  if (
    typeof id !== 'string' ||
    typeof title !== 'string' ||
    !isCadence(cadence) ||
    typeof startDate !== 'string' ||
    !isValidDateKey(startDate)
  ) {
    return null;
  }

  const start = fromDateKey(startDate);
  const days = cadence === 'weekly' ? [start.getDay()] : cadence === 'monthly' ? [start.getDate()] : [];

  return {
    ...value,
    days,
    // The routine's own name becomes its single task, so nothing reads as empty.
    tasks: [{ id: makeId('task'), title, time: '', target: 1 }],
    done: [],
  };
}

/**
 * The second shape: tasks hung straight off the routine, and a flat list of
 * `taskId|date` strings for what was done. Tasks move into one unnamed group and
 * each tick becomes a count of one.
 */
function migrateFromV2(value: Record<string, unknown>): Record<string, unknown> {
  const tasks = Array.isArray(value.tasks) ? value.tasks : [];
  const progress: Record<string, number> = {};

  for (const entry of Array.isArray(value.done) ? value.done : []) {
    if (typeof entry === 'string') progress[entry] = 1;
  }

  return {
    ...value,
    kind: 'checklist',
    groups: tasks.length > 0 ? [{ id: makeId('group'), title: '', days: [], time: '', tasks }] : [],
    progress,
    stock: {},
  };
}

/* ---- Reading --------------------------------------------------------------- */

/** Drops progress past the history window or pointing at a task that is gone. */
function pruneProgress(progress: unknown, taskIds: Set<string>): Record<string, number> {
  if (typeof progress !== 'object' || progress === null) return {};

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - PROGRESS_HISTORY_DAYS);
  const cutoffKey = toDateKey(cutoff);

  const kept: Record<string, number> = {};
  for (const [entry, count] of Object.entries(progress as Record<string, unknown>)) {
    if (typeof count !== 'number' || !Number.isFinite(count) || count < 1) continue;

    const separator = entry.lastIndexOf('|');
    if (separator < 1) continue;

    const taskId = entry.slice(0, separator);
    const dateKey = entry.slice(separator + 1);
    if (!taskIds.has(taskId) || !isValidDateKey(dateKey) || dateKey < cutoffKey) continue;

    kept[entry] = Math.min(MAX_TARGET, Math.floor(count));
  }

  return kept;
}

/**
 * Running totals, keeping only the tasks that still exist. A routine written
 * before totals were kept has them rebuilt from whatever progress it still
 * holds — that undercounts anything already trimmed, but it is the most that
 * can honestly be recovered, and it only happens once.
 */
function resolveTotals(raw: unknown, progress: Record<string, number>, taskIds: Set<string>): Record<string, number> {
  const totals: Record<string, number> = {};

  if (typeof raw === 'object' && raw !== null) {
    for (const [taskId, total] of Object.entries(raw as Record<string, unknown>)) {
      if (!taskIds.has(taskId) || typeof total !== 'number' || !Number.isFinite(total) || total < 1) continue;
      totals[taskId] = Math.floor(total);
    }
    return totals;
  }

  for (const [entry, count] of Object.entries(progress)) {
    const taskId = entry.slice(0, entry.lastIndexOf('|'));
    totals[taskId] = (totals[taskId] ?? 0) + count;
  }

  return totals;
}

function pruneStock(stock: unknown, taskIds: Set<string>): Record<string, StockState> {
  if (typeof stock !== 'object' || stock === null) return {};

  const kept: Record<string, StockState> = {};
  for (const [taskId, state] of Object.entries(stock as Record<string, unknown>)) {
    if (taskIds.has(taskId) && isStockState(state)) kept[taskId] = state;
  }

  return kept;
}

function toRoutine(value: unknown): Routine | null {
  if (typeof value !== 'object' || value === null) return null;
  let raw = value as Record<string, unknown>;

  // Walk the shapes forward in order; each step leaves the next one's input.
  if (!Array.isArray(raw.tasks) && !Array.isArray(raw.groups)) {
    const migrated = migrateFromV1(raw);
    if (!migrated) return null;
    raw = migrated;
  }
  if (!Array.isArray(raw.groups)) raw = migrateFromV2(raw);

  const { id, title, cadence } = raw;
  if (typeof id !== 'string' || typeof title !== 'string' || !isCadence(cadence)) return null;

  const createdAt = typeof raw.createdAt === 'string' ? raw.createdAt : new Date(0).toISOString();

  const groups: RoutineGroup[] = [];
  for (const rawGroup of raw.groups as unknown[]) {
    const group = normaliseGroup(rawGroup, cadence, createdAt);
    if (group) groups.push(group);
    if (groups.length >= MAX_GROUPS_PER_ROUTINE) break;
  }

  const taskIds = new Set(groups.flatMap((group) => group.tasks.map((task) => task.id)));
  const progress = pruneProgress(raw.progress, taskIds);

  return {
    id,
    title: title.slice(0, ROUTINE_TITLE_MAX_LENGTH),
    note: typeof raw.note === 'string' ? raw.note.slice(0, ROUTINE_NOTE_MAX_LENGTH) : '',
    kind: raw.kind === 'stock' ? 'stock' : 'checklist',
    cadence,
    days: normaliseDays(cadence, raw.days),
    groups,
    progress,
    totals: resolveTotals(raw.totals, progress, taskIds),
    stock: pruneStock(raw.stock, taskIds),
    createdAt,
  };
}

/** Creation order, so a routine does not jump around as it is ticked off. */
export function getRoutines(): Routine[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(ROUTINES_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(toRoutine)
      .filter((routine): routine is Routine => routine !== null)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } catch {
    return [];
  }
}

function writeRoutines(routines: Routine[]) {
  try {
    window.localStorage.setItem(ROUTINES_KEY, JSON.stringify(routines));
    window.dispatchEvent(new CustomEvent(ROUTINES_EVENT));
  } catch {
    // Storage unavailable (private mode, quota) — the change just does not stick.
  }
}

/** Applies a change to one routine, leaving the rest of the list alone. */
function editRoutine(id: string, change: (routine: Routine) => Routine | null): boolean {
  const routines = getRoutines();
  const existing = routines.find((routine) => routine.id === id);
  if (!existing) return false;

  const updated = change(existing);
  if (!updated) return false;

  writeRoutines(routines.map((routine) => (routine.id === id ? updated : routine)));
  return true;
}

function editGroup(
  routineId: string,
  groupId: string,
  change: (group: RoutineGroup, routine: Routine) => RoutineGroup | null
): boolean {
  return editRoutine(routineId, (routine) => {
    const existing = routine.groups.find((group) => group.id === groupId);
    if (!existing) return null;

    const updated = change(existing, routine);
    if (!updated) return null;

    return { ...routine, groups: routine.groups.map((group) => (group.id === groupId ? updated : group)) };
  });
}

/* -------------------------------------------------------------------------- */
/*  Routines                                                                  */
/* -------------------------------------------------------------------------- */

export function addRoutine(input: {
  title: string;
  cadence: RoutineCadence;
  kind?: RoutineKind;
  days?: number[];
  note?: string;
}): Routine | null {
  const title = input.title.trim().slice(0, ROUTINE_TITLE_MAX_LENGTH);
  if (!title || !isCadence(input.cadence)) return null;

  const routine: Routine = {
    id: makeId('routine'),
    title,
    note: (input.note ?? '').trim().slice(0, ROUTINE_NOTE_MAX_LENGTH),
    kind: input.kind === 'stock' ? 'stock' : 'checklist',
    cadence: input.cadence,
    days: normaliseDays(input.cadence, input.days ?? []),
    // A routine always has somewhere to put a task, so adding one never needs
    // two steps. The unnamed group renders without a heading.
    groups: [{ id: makeId('group'), title: '', days: [], time: '', tasks: [] }],
    progress: {},
    totals: {},
    stock: {},
    createdAt: new Date().toISOString(),
  };

  writeRoutines([...getRoutines(), routine]);
  return routine;
}

export function updateRoutine(
  id: string,
  changes: Partial<Pick<Routine, 'title' | 'note' | 'cadence' | 'days'>>
): boolean {
  return editRoutine(id, (existing) => {
    const title = (changes.title ?? existing.title).trim().slice(0, ROUTINE_TITLE_MAX_LENGTH);
    const cadence = changes.cadence ?? existing.cadence;
    if (!title || !isCadence(cadence)) return null;

    // Switching cadence makes the old day numbers meaningless — weekday 6 is not
    // day-of-month 6 — so they are re-read against the new one, groups included.
    const sameCadence = cadence === existing.cadence;
    const days = normaliseDays(cadence, changes.days ?? (sameCadence ? existing.days : []));

    return {
      ...existing,
      title,
      cadence,
      days,
      note: (changes.note ?? existing.note).trim().slice(0, ROUTINE_NOTE_MAX_LENGTH),
      groups: sameCadence
        ? existing.groups
        : existing.groups.map((group) => ({ ...group, days: [] })),
    };
  });
}

export function deleteRoutine(id: string) {
  writeRoutines(getRoutines().filter((routine) => routine.id !== id));
}

/** Adds or removes one day from a weekly or monthly routine's schedule. */
export function toggleRoutineDay(id: string, day: number): boolean {
  return editRoutine(id, (existing) => {
    if (existing.cadence === 'daily') return null;

    const has = existing.days.includes(day);
    const days = has ? existing.days.filter((existingDay) => existingDay !== day) : [...existing.days, day];

    return {
      ...existing,
      days: normaliseDays(existing.cadence, days),
      // A group cannot sit on a day its routine no longer covers.
      groups: has
        ? existing.groups.map((group) => ({ ...group, days: group.days.filter((d) => d !== day) }))
        : existing.groups,
    };
  });
}

/* -------------------------------------------------------------------------- */
/*  Groups                                                                    */
/* -------------------------------------------------------------------------- */

export function addGroup(routineId: string, title: string): boolean {
  return editRoutine(routineId, (existing) => {
    if (existing.groups.length >= MAX_GROUPS_PER_ROUTINE) return null;

    const group: RoutineGroup = {
      id: makeId('group'),
      title: title.trim().slice(0, GROUP_TITLE_MAX_LENGTH),
      days: [],
      time: '',
      tasks: [],
    };

    return { ...existing, groups: [...existing.groups, group] };
  });
}

export function updateGroup(
  routineId: string,
  groupId: string,
  changes: Partial<Pick<RoutineGroup, 'title' | 'time'>>
): boolean {
  return editGroup(routineId, groupId, (group) => ({
    ...group,
    title: (changes.title ?? group.title).trim().slice(0, GROUP_TITLE_MAX_LENGTH),
    time: normaliseTime(changes.time ?? group.time),
  }));
}

/** Removes the group, its tasks, and everything recorded against them. */
export function deleteGroup(routineId: string, groupId: string): boolean {
  return editRoutine(routineId, (existing) => {
    const groups = existing.groups.filter((group) => group.id !== groupId);
    const taskIds = new Set(groups.flatMap((group) => group.tasks.map((task) => task.id)));

    return {
      ...existing,
      groups,
      progress: pruneProgress(existing.progress, taskIds),
      totals: resolveTotals(existing.totals, existing.progress, taskIds),
      stock: pruneStock(existing.stock, taskIds),
    };
  });
}

/** A group may only sit on days its routine already covers. */
export function toggleGroupDay(routineId: string, groupId: string, day: number): boolean {
  return editGroup(routineId, groupId, (group, routine) => {
    if (routine.cadence === 'daily' || !routine.days.includes(day)) return null;

    const days = group.days.includes(day) ? group.days.filter((d) => d !== day) : [...group.days, day];
    return { ...group, days: normaliseDays(routine.cadence, days) };
  });
}

/* -------------------------------------------------------------------------- */
/*  Tasks                                                                     */
/* -------------------------------------------------------------------------- */

export function addTask(
  routineId: string,
  groupId: string,
  input: { title: string; time?: string; target?: number }
): boolean {
  const title = input.title.trim().slice(0, TASK_TITLE_MAX_LENGTH);
  if (!title) return false;

  return editGroup(routineId, groupId, (group) => {
    if (group.tasks.length >= MAX_TASKS_PER_GROUP) return null;

    const task: RoutineTask = {
      id: makeId('task'),
      title,
      time: normaliseTime(input.time),
      target: normaliseTarget(input.target ?? 1),
      createdAt: new Date().toISOString(),
    };

    return { ...group, tasks: [...group.tasks, task] };
  });
}

export function updateTask(
  routineId: string,
  groupId: string,
  taskId: string,
  changes: Partial<Pick<RoutineTask, 'title' | 'time' | 'target'>>
): boolean {
  return editGroup(routineId, groupId, (group) => {
    const task = group.tasks.find((candidate) => candidate.id === taskId);
    if (!task) return null;

    const title = (changes.title ?? task.title).trim().slice(0, TASK_TITLE_MAX_LENGTH);
    if (!title) return null;

    const updated: RoutineTask = {
      ...task,
      title,
      time: normaliseTime(changes.time ?? task.time),
      target: normaliseTarget(changes.target ?? task.target),
    };

    return { ...group, tasks: group.tasks.map((t) => (t.id === taskId ? updated : t)) };
  });
}

/** Removes the task and everything recorded against it. */
export function deleteTask(routineId: string, groupId: string, taskId: string): boolean {
  return editRoutine(routineId, (existing) => {
    const groups = existing.groups.map((group) =>
      group.id === groupId ? { ...group, tasks: group.tasks.filter((task) => task.id !== taskId) } : group
    );
    const taskIds = new Set(groups.flatMap((group) => group.tasks.map((task) => task.id)));

    return {
      ...existing,
      groups,
      progress: pruneProgress(existing.progress, taskIds),
      totals: resolveTotals(existing.totals, existing.progress, taskIds),
      stock: pruneStock(existing.stock, taskIds),
    };
  });
}

/**
 * Adds one to what has been done today, wrapping back to nothing once the target
 * is met — so a target of 1 is a plain tick, and a target of 3 takes four taps to
 * come back round. A day in the future is refused: you cannot have done
 * Thursday's on Tuesday.
 */
export function bumpTask(routineId: string, taskId: string, dateKey: string): boolean {
  if (!isValidDateKey(dateKey) || dateKey > todayKey()) return false;

  return editRoutine(routineId, (existing) => {
    const task = existing.groups.flatMap((group) => group.tasks).find((candidate) => candidate.id === taskId);
    if (!task) return null;

    const key = progressKey(taskId, dateKey);
    const current = existing.progress[key] ?? 0;
    const next = current >= task.target ? 0 : current + 1;

    const progress = { ...existing.progress };
    // Zero is the absence of an entry rather than a stored 0, so cleared days
    // cost nothing.
    if (next === 0) delete progress[key];
    else progress[key] = next;

    // The running total moves with the day's count, so clearing a finished task
    // gives back everything it was credited rather than only the last tick.
    const totals = { ...existing.totals };
    const delta = next === 0 ? -current : 1;
    const total = (totals[taskId] ?? 0) + delta;
    if (total > 0) totals[taskId] = total;
    else delete totals[taskId];

    return { ...existing, progress, totals };
  });
}

export function setStockState(routineId: string, taskId: string, state: StockState): boolean {
  if (!isStockState(state)) return false;

  return editRoutine(routineId, (existing) => {
    if (!existing.groups.some((group) => group.tasks.some((task) => task.id === taskId))) return null;

    const stock = { ...existing.stock };
    // "Have" is the resting state, so it is stored as nothing at all.
    if (state === 'have') delete stock[taskId];
    else stock[taskId] = state;

    return { ...existing, stock };
  });
}
