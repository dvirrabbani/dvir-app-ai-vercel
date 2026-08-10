/**
 * What is on this week: the shows whose next episode lands on a weekday, at a
 * time if there is one worth knowing.
 *
 * A show is not a routine. A routine is work you do and tick off; a show comes
 * out whether or not you are there for it, which is why it holds a season and an
 * episode number rather than a done-or-not. Marking one watched moves it on to
 * the next episode, and the same weekday carries it into next week.
 *
 * Like the rest of the site it lives in localStorage only — one browser's copy,
 * shared with nobody.
 */

import { WEEKDAY_LABELS, toDateKey } from '@/lib/calendar';

export interface Show {
  id: string;
  title: string;
  /** Weekday 0-6, Sunday first, the way the calendar reads them. */
  day: number;
  /** HH:MM in 24h, or empty when only the day is known. */
  time: string;
  /** The episode still to come, which is what the page counts down to. */
  season: number;
  episode: number;
  /** Where it is on — a channel, a service, a note to self. */
  note: string;
  createdAt: string;
}

export const SHOWS_KEY = 'dvir-entertainment:shows';

/** Fired on `window` after any write, so open views can refresh themselves. */
export const SHOWS_EVENT = 'entertainment-changed';

export const SHOW_TITLE_MAX_LENGTH = 80;
export const SHOW_NOTE_MAX_LENGTH = 60;

export const MAX_SHOWS = 40;
export const MAX_SEASON = 99;
export const MAX_EPISODE = 999;

/* -------------------------------------------------------------------------- */
/*  When it is on                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The next day this show lands on, counting today as that day — an episode due
 * tonight is still to come, whatever the clock says. Times are not compared:
 * "today" is a truer thing to say at 23:00 than "in 7 days".
 */
export function nextAiring(show: Show, from: Date): Date {
  const away = (show.day - from.getDay() + 7) % 7;
  return new Date(from.getFullYear(), from.getMonth(), from.getDate() + away);
}

export function daysUntil(show: Show, from: Date): number {
  return (show.day - from.getDay() + 7) % 7;
}

export function airingLabel(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

/** "Thu 21:00", or just the weekday when no time was given. */
export function describeSlot(show: Show): string {
  const day = WEEKDAY_LABELS[show.day] ?? '?';
  return show.time ? `${day} ${show.time}` : day;
}

export function describeEpisode(show: Show): string {
  return `S${show.season} E${show.episode}`;
}

/** Soonest first, then by time of day, then by the order they were added. */
export function sortByNext(shows: Show[], from: Date): Show[] {
  return [...shows].sort((a, b) => {
    const away = daysUntil(a, from) - daysUntil(b, from);
    if (away !== 0) return away;
    if (a.time !== b.time) return (a.time || '').localeCompare(b.time || '');
    return a.createdAt.localeCompare(b.createdAt);
  });
}

/** The day key of the next episode, for lining a show up against a calendar. */
export function nextAiringKey(show: Show, from: Date): string {
  return toDateKey(nextAiring(show, from));
}

/* -------------------------------------------------------------------------- */
/*  Storage                                                                   */
/* -------------------------------------------------------------------------- */

function makeId(): string {
  return `show-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Empty unless it looks like HH:MM, so a stray value cannot break sorting. */
function normaliseTime(time: unknown): string {
  const trimmed = typeof time === 'string' ? time.trim() : '';
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(trimmed) ? trimmed : '';
}

function normaliseDay(day: unknown): number {
  if (typeof day !== 'number' || !Number.isInteger(day) || day < 0 || day > 6) return 0;
  return day;
}

function normaliseCount(value: unknown, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1;
  return Math.min(max, Math.max(1, Math.floor(value)));
}

function toShow(value: unknown): Show | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Partial<Show>;
  if (typeof raw.id !== 'string' || typeof raw.title !== 'string') return null;

  const title = raw.title.slice(0, SHOW_TITLE_MAX_LENGTH);
  if (!title.trim()) return null;

  return {
    id: raw.id,
    title,
    day: normaliseDay(raw.day),
    time: normaliseTime(raw.time),
    season: normaliseCount(raw.season, MAX_SEASON),
    episode: normaliseCount(raw.episode, MAX_EPISODE),
    note: typeof raw.note === 'string' ? raw.note.slice(0, SHOW_NOTE_MAX_LENGTH) : '',
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date(0).toISOString(),
  };
}

/** Creation order, so the list only moves when the schedule says it should. */
export function getShows(): Show[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(SHOWS_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(toShow)
      .filter((show): show is Show => show !== null)
      .slice(0, MAX_SHOWS)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } catch {
    return [];
  }
}

function writeShows(shows: Show[]) {
  try {
    window.localStorage.setItem(SHOWS_KEY, JSON.stringify(shows));
    window.dispatchEvent(new CustomEvent(SHOWS_EVENT));
  } catch {
    // Storage unavailable (private mode, quota) — the change just does not stick.
  }
}

export interface ShowInput {
  title: string;
  day: number;
  time?: string;
  season?: number;
  episode?: number;
  note?: string;
}

export function addShow(input: ShowInput): Show | null {
  const title = input.title.trim().slice(0, SHOW_TITLE_MAX_LENGTH);
  if (!title) return null;

  const shows = getShows();
  if (shows.length >= MAX_SHOWS) return null;

  const show: Show = {
    id: makeId(),
    title,
    day: normaliseDay(input.day),
    time: normaliseTime(input.time),
    season: normaliseCount(input.season ?? 1, MAX_SEASON),
    episode: normaliseCount(input.episode ?? 1, MAX_EPISODE),
    note: (input.note ?? '').trim().slice(0, SHOW_NOTE_MAX_LENGTH),
    createdAt: new Date().toISOString(),
  };

  writeShows([...shows, show]);
  return show;
}

/** Applies a change to one show, leaving the rest of the list alone. */
function editShow(id: string, change: (show: Show) => Show | null): boolean {
  const shows = getShows();
  const existing = shows.find((show) => show.id === id);
  if (!existing) return false;

  const updated = change(existing);
  if (!updated) return false;

  writeShows(shows.map((show) => (show.id === id ? updated : show)));
  return true;
}

export function updateShow(id: string, changes: Partial<ShowInput>): boolean {
  return editShow(id, (existing) => {
    const title = (changes.title ?? existing.title).trim().slice(0, SHOW_TITLE_MAX_LENGTH);
    if (!title) return null;

    return {
      ...existing,
      title,
      day: normaliseDay(changes.day ?? existing.day),
      time: normaliseTime(changes.time ?? existing.time),
      season: normaliseCount(changes.season ?? existing.season, MAX_SEASON),
      episode: normaliseCount(changes.episode ?? existing.episode, MAX_EPISODE),
      note: (changes.note ?? existing.note).trim().slice(0, SHOW_NOTE_MAX_LENGTH),
    };
  });
}

export function deleteShow(id: string) {
  writeShows(getShows().filter((show) => show.id !== id));
}

/**
 * Seen it: the show moves on to the next episode, and the weekday it is pinned
 * to carries that into next week on its own. The season is left alone — where
 * one ends is not something a count of episodes can know.
 */
export function markWatched(id: string): boolean {
  return editShow(id, (existing) => ({
    ...existing,
    episode: normaliseCount(existing.episode + 1, MAX_EPISODE),
  }));
}
