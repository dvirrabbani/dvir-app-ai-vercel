/**
 * The day itself, rather than the work planned into it: what time you got up,
 * what you ate, every trip to the bathroom, and what time you went to sleep.
 *
 * A routine is something you meant to do; this is a record of what the day
 * actually was. One entry is a time and, for a meal, what it was — the time is
 * also the only thing placing it in the morning, the noon or the evening, the
 * same rule the routines beside it follow.
 *
 * Like everything else here it lives in localStorage only — this is one
 * browser's copy, and health notes especially are not sent anywhere.
 */

import { fromDateKey, isValidDateKey, toDateKey } from '@/lib/calendar';
import { DAY_PARTS, DayPart, partOfDay } from '@/lib/day-parts';

export interface LifestyleEntry {
  id: string;
  /** HH:MM. The only thing placing the entry in a part of the day. */
  time: string;
  /** What it was. A bathroom visit usually has nothing to say, and need not. */
  what: string;
}

export interface DayLog {
  /** Local calendar day as YYYY-MM-DD, the same key the calendar uses. */
  date: string;
  /** HH:MM, or empty while it has not been written down. */
  wokeAt: string;
  sleptAt: string;
  meals: LifestyleEntry[];
  bathroom: LifestyleEntry[];
}

export const LIFESTYLE_KEY = 'dvir-lifestyle:days';

/** Fired on `window` after any write, so open views can refresh themselves. */
export const LIFESTYLE_EVENT = 'lifestyle-changed';

export const ENTRY_MAX_LENGTH = 120;
export const MAX_ENTRIES_PER_DAY = 40;

/** Days older than this are dropped, so storage cannot grow without bound. */
const HISTORY_DAYS = 370;

export function emptyLog(date: string): DayLog {
  return { date, wokeAt: '', sleptAt: '', meals: [], bathroom: [] };
}

/* -------------------------------------------------------------------------- */
/*  Reading                                                                   */
/* -------------------------------------------------------------------------- */

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Empty unless it looks like HH:MM, so a stray value cannot break sorting. */
function normaliseTime(time: unknown): string {
  const trimmed = typeof time === 'string' ? time.trim() : '';
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(trimmed) ? trimmed : '';
}

function toEntry(value: unknown): LifestyleEntry | null {
  if (typeof value !== 'object' || value === null) return null;
  const entry = value as Partial<LifestyleEntry>;
  if (typeof entry.id !== 'string') return null;

  const time = normaliseTime(entry.time);
  if (!time) return null;

  return {
    id: entry.id,
    time,
    what: typeof entry.what === 'string' ? entry.what.slice(0, ENTRY_MAX_LENGTH) : '',
  };
}

/** Read down the clock, which is the only order a day makes sense in. */
function toEntries(value: unknown): LifestyleEntry[] {
  const entries: LifestyleEntry[] = [];

  for (const raw of Array.isArray(value) ? value : []) {
    const entry = toEntry(raw);
    if (entry) entries.push(entry);
    if (entries.length >= MAX_ENTRIES_PER_DAY) break;
  }

  return entries.sort((a, b) => a.time.localeCompare(b.time));
}

function toLog(date: string, value: unknown): DayLog | null {
  if (!isValidDateKey(date) || typeof value !== 'object' || value === null) return null;
  const raw = value as Partial<DayLog>;

  return {
    date,
    wokeAt: normaliseTime(raw.wokeAt),
    sleptAt: normaliseTime(raw.sleptAt),
    meals: toEntries(raw.meals),
    bathroom: toEntries(raw.bathroom),
  };
}

/** Nothing written down at all, which is not worth keeping a record for. */
export function logIsEmpty(log: DayLog): boolean {
  return !log.wokeAt && !log.sleptAt && log.meals.length === 0 && log.bathroom.length === 0;
}

/** Every day on record, keyed by day. Empty and long-past days are dropped. */
export function getLogs(): Record<string, DayLog> {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(LIFESTYLE_KEY);
    if (!raw) return {};

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - HISTORY_DAYS);
    const cutoffKey = toDateKey(cutoff);

    const logs: Record<string, DayLog> = {};
    for (const [date, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (date < cutoffKey) continue;

      const log = toLog(date, value);
      if (log && !logIsEmpty(log)) logs[date] = log;
    }

    return logs;
  } catch {
    return {};
  }
}

export function getDayLog(date: string): DayLog {
  return getLogs()[date] ?? emptyLog(date);
}

/* -------------------------------------------------------------------------- */
/*  Writing                                                                   */
/* -------------------------------------------------------------------------- */

function writeLogs(logs: Record<string, DayLog>) {
  try {
    window.localStorage.setItem(LIFESTYLE_KEY, JSON.stringify(logs));
    window.dispatchEvent(new CustomEvent(LIFESTYLE_EVENT));
  } catch {
    // Storage unavailable (private mode, quota) — the change just does not stick.
  }
}

/** Applies a change to one day, leaving every other day alone. */
function editLog(date: string, change: (log: DayLog) => DayLog | null): boolean {
  if (!isValidDateKey(date)) return false;

  const logs = getLogs();
  const updated = change(logs[date] ?? emptyLog(date));
  if (!updated) return false;

  // A day emptied back out is removed rather than stored as a husk, so clearing
  // everything leaves no trace of the day at all.
  if (logIsEmpty(updated)) delete logs[date];
  else logs[date] = updated;

  writeLogs(logs);
  return true;
}

export function setWokeAt(date: string, time: string): boolean {
  return editLog(date, (log) => ({ ...log, wokeAt: normaliseTime(time) }));
}

export function setSleptAt(date: string, time: string): boolean {
  return editLog(date, (log) => ({ ...log, sleptAt: normaliseTime(time) }));
}

function byTime(a: LifestyleEntry, b: LifestyleEntry): number {
  return a.time.localeCompare(b.time);
}

function addEntry(
  date: string,
  field: 'meals' | 'bathroom',
  input: { time: string; what?: string }
): boolean {
  const time = normaliseTime(input.time);
  if (!time) return false;

  return editLog(date, (log) => {
    if (log[field].length >= MAX_ENTRIES_PER_DAY) return null;

    const entry: LifestyleEntry = {
      id: makeId(field === 'meals' ? 'meal' : 'visit'),
      time,
      what: (input.what ?? '').trim().slice(0, ENTRY_MAX_LENGTH),
    };

    return { ...log, [field]: [...log[field], entry].sort(byTime) };
  });
}

/** A meal needs saying what it was; a time on its own records nothing. */
export function addMeal(date: string, input: { time: string; what: string }): boolean {
  if (!input.what.trim()) return false;
  return addEntry(date, 'meals', input);
}

/** A bathroom visit is only ever a time — that is the whole of what is tracked. */
export function addVisit(date: string, time: string): boolean {
  return addEntry(date, 'bathroom', { time });
}

/**
 * Changing something already written down. Re-timing is the interesting part:
 * an entry moved past noon leaves the morning and turns up under noon, since the
 * time is the only thing placing it.
 */
function editEntry(
  date: string,
  field: 'meals' | 'bathroom',
  id: string,
  changes: { time?: string; what?: string }
): boolean {
  return editLog(date, (log) => {
    const existing = log[field].find((entry) => entry.id === id);
    if (!existing) return null;

    // An entry with no readable time has nothing placing it in the day, so a
    // cleared or malformed one leaves the old time standing.
    const time = changes.time === undefined ? existing.time : normaliseTime(changes.time) || existing.time;
    const what = changes.what === undefined ? existing.what : changes.what.trim().slice(0, ENTRY_MAX_LENGTH);

    return {
      ...log,
      [field]: log[field].map((entry) => (entry.id === id ? { ...entry, time, what } : entry)).sort(byTime),
    };
  });
}

/** As with adding one, a meal emptied of what it was is refused rather than kept. */
export function updateMeal(date: string, id: string, changes: { time?: string; what?: string }): boolean {
  if (changes.what !== undefined && !changes.what.trim()) return false;
  return editEntry(date, 'meals', id, changes);
}

export function updateVisit(date: string, id: string, time: string): boolean {
  return editEntry(date, 'bathroom', id, { time });
}

function deleteEntry(date: string, field: 'meals' | 'bathroom', id: string): boolean {
  return editLog(date, (log) => ({ ...log, [field]: log[field].filter((entry) => entry.id !== id) }));
}

export function deleteMeal(date: string, id: string): boolean {
  return deleteEntry(date, 'meals', id);
}

export function deleteVisit(date: string, id: string): boolean {
  return deleteEntry(date, 'bathroom', id);
}

/* -------------------------------------------------------------------------- */
/*  Reading a day back                                                        */
/* -------------------------------------------------------------------------- */

export function entriesInPart(entries: LifestyleEntry[], part: DayPart): LifestyleEntry[] {
  return entries.filter((entry) => partOfDay(entry.time) === part);
}

/**
 * How long the night was, in whole minutes, when both ends of it are known.
 * Sleeping at 23:40 and getting up at 07:10 is 7h 30m rather than a negative
 * number: a bedtime later than the wake-up is taken as the night before.
 */
export function sleepMinutes(log: DayLog): number | null {
  if (!log.wokeAt || !log.sleptAt) return null;

  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  const woke = minutes(log.wokeAt);
  const slept = minutes(log.sleptAt);

  return slept > woke ? 24 * 60 - slept + woke : woke - slept;
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/* -------------------------------------------------------------------------- */
/*  A stretch of days                                                         */
/* -------------------------------------------------------------------------- */

/** As far back as a range can reach — nothing older than this is kept anyway. */
export const MAX_RANGE_DAYS = HISTORY_DAYS;

/** Every day from one date to another, inclusive. A backwards range is read forwards. */
export function daysBetween(from: string, to: string): string[] {
  if (!isValidDateKey(from) || !isValidDateKey(to)) return [];

  const [start, end] = from <= to ? [from, to] : [to, from];
  const cursor = fromDateKey(start);
  const last = fromDateKey(end);

  const days: string[] = [];
  while (cursor <= last && days.length < MAX_RANGE_DAYS) {
    days.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

/** The day `count` days before a day, which is what the range presets step by. */
export function shiftDay(date: string, count: number): string {
  const shifted = fromDateKey(date);
  shifted.setDate(shifted.getDate() + count);
  return toDateKey(shifted);
}

function minutesOf(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

function formatMinutes(total: number): string {
  const minutes = ((total % 1440) + 1440) % 1440;
  return `${Math.floor(minutes / 60)}`.padStart(2, '0') + ':' + `${minutes % 60}`.padStart(2, '0');
}

/**
 * The average of a set of clock times. Bedtimes straddle midnight — 23:40 and
 * 00:30 average to 00:05, not to noon — so anything earlier than `wrapBefore` is
 * read as belonging to the night before and counted past 24:00.
 */
function averageTime(times: string[], wrapBefore = 0): string {
  if (times.length === 0) return '';

  let total = 0;
  for (const time of times) {
    const minutes = minutesOf(time);
    total += minutes < wrapBefore ? minutes + 1440 : minutes;
  }

  return formatMinutes(Math.round(total / times.length));
}

export interface DaySummary {
  date: string;
  wokeAt: string;
  sleptAt: string;
  /** Minutes asleep, when both ends of the night are known. */
  asleep: number | null;
  meals: number;
  visits: number;
  /** Whether anything at all was written down that day. */
  logged: boolean;
}

export interface RangeSummary {
  /** Every day in the range, logged or not, so the gaps show. */
  days: DaySummary[];
  logged: number;
  /** Empty until at least one day has that end of the night written down. */
  wokeAverage: string;
  sleptAverage: string;
  asleepAverage: number | null;
  meals: number;
  visits: number;
  mealsByPart: Record<DayPart, number>;
  visitsByPart: Record<DayPart, number>;
  /** The longest night in the range, which the bars are drawn against. */
  longestSleep: number;
}

const NOON_MINUTES = 12 * 60;

/**
 * What a stretch of days adds up to. Averages are taken over the days that have
 * the thing written down rather than over the whole range — three logged days
 * out of thirty should read as "usually up at 07:10", not as a month of lie-ins
 * dragged down by twenty-seven blanks.
 */
export function summariseRange(logs: Record<string, DayLog>, from: string, to: string): RangeSummary {
  const days: DaySummary[] = [];
  const wokeTimes: string[] = [];
  const sleptTimes: string[] = [];
  const nights: number[] = [];

  const mealsByPart: Record<DayPart, number> = { morning: 0, noon: 0, evening: 0 };
  const visitsByPart: Record<DayPart, number> = { morning: 0, noon: 0, evening: 0 };

  let meals = 0;
  let visits = 0;
  let logged = 0;
  let longestSleep = 0;

  for (const date of daysBetween(from, to)) {
    const log = logs[date];

    if (!log) {
      days.push({ date, wokeAt: '', sleptAt: '', asleep: null, meals: 0, visits: 0, logged: false });
      continue;
    }

    logged++;
    if (log.wokeAt) wokeTimes.push(log.wokeAt);
    if (log.sleptAt) sleptTimes.push(log.sleptAt);

    const asleep = sleepMinutes(log);
    if (asleep !== null) {
      nights.push(asleep);
      longestSleep = Math.max(longestSleep, asleep);
    }

    meals += log.meals.length;
    visits += log.bathroom.length;

    for (const part of DAY_PARTS) {
      mealsByPart[part] += entriesInPart(log.meals, part).length;
      visitsByPart[part] += entriesInPart(log.bathroom, part).length;
    }

    days.push({
      date,
      wokeAt: log.wokeAt,
      sleptAt: log.sleptAt,
      asleep,
      meals: log.meals.length,
      visits: log.bathroom.length,
      logged: true,
    });
  }

  return {
    days,
    logged,
    wokeAverage: averageTime(wokeTimes),
    sleptAverage: averageTime(sleptTimes, NOON_MINUTES),
    asleepAverage: nights.length > 0 ? Math.round(nights.reduce((sum, night) => sum + night, 0) / nights.length) : null,
    meals,
    visits,
    mealsByPart,
    visitsByPart,
    longestSleep,
  };
}
