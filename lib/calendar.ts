/**
 * Calendar events. Like the posts, the poll and the milestones, these live in
 * localStorage only — this is one browser's copy, not shared with anyone.
 */

export interface CalendarEvent {
  id: string;
  /** Local calendar day as YYYY-MM-DD. Not a timestamp, so it never shifts zone. */
  date: string;
  /** HH:MM in 24h, or empty for an all-day event. */
  time: string;
  title: string;
  note: string;
  createdAt: string;
}

export const CALENDAR_KEY = 'dvir-calendar:events';

/** Fired on `window` after any write, so open views can refresh themselves. */
export const CALENDAR_EVENT = 'calendar-changed';

export const TITLE_MAX_LENGTH = 80;
export const NOTE_MAX_LENGTH = 240;

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/* -------------------------------------------------------------------------- */
/*  Dates                                                                     */
/* -------------------------------------------------------------------------- */

/** A day key built from local parts, so it matches what the user sees. */
export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function fromDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

export function isValidDateKey(key: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const date = fromDateKey(key);
  return !Number.isNaN(date.getTime()) && toDateKey(date) === key;
}

/** The six-week grid a month view needs, always starting on a Sunday. */
export function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());

  return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
}

export function formatMonthTitle(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function formatDayTitle(key: string): string {
  return fromDateKey(key).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/* -------------------------------------------------------------------------- */
/*  Storage                                                                   */
/* -------------------------------------------------------------------------- */

function isEvent(value: unknown): value is CalendarEvent {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Partial<CalendarEvent>;
  return typeof item.id === 'string' && typeof item.title === 'string' && typeof item.date === 'string';
}

/** Sorted by day, then by time, with all-day events first within a day. */
function byWhen(a: CalendarEvent, b: CalendarEvent): number {
  if (a.date !== b.date) return a.date.localeCompare(b.date);
  if (a.time !== b.time) return (a.time || '').localeCompare(b.time || '');
  return (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
}

export function getEvents(): CalendarEvent[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(CALENDAR_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(isEvent).filter((event) => isValidDateKey(event.date)).sort(byWhen);
  } catch {
    return [];
  }
}

function writeEvents(events: CalendarEvent[]) {
  try {
    window.localStorage.setItem(CALENDAR_KEY, JSON.stringify(events));
    window.dispatchEvent(new CustomEvent(CALENDAR_EVENT));
  } catch {
    // Storage unavailable (private mode, quota) — the change just does not stick.
  }
}

/** Empty unless it looks like HH:MM, so a stray value cannot break sorting. */
function normaliseTime(time: string): string {
  const trimmed = time.trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(trimmed) ? trimmed : '';
}

export function addEvent(input: { date: string; title: string; time?: string; note?: string }): CalendarEvent | null {
  const title = input.title.trim().slice(0, TITLE_MAX_LENGTH);
  if (!title || !isValidDateKey(input.date)) return null;

  const event: CalendarEvent = {
    id: `event-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    date: input.date,
    time: normaliseTime(input.time ?? ''),
    title,
    note: (input.note ?? '').trim().slice(0, NOTE_MAX_LENGTH),
    createdAt: new Date().toISOString(),
  };

  writeEvents([...getEvents(), event]);
  return event;
}

export function updateEvent(
  id: string,
  changes: Partial<Pick<CalendarEvent, 'title' | 'time' | 'note' | 'date'>>
): boolean {
  const events = getEvents();
  const existing = events.find((event) => event.id === id);
  if (!existing) return false;

  const title = (changes.title ?? existing.title).trim().slice(0, TITLE_MAX_LENGTH);
  const date = changes.date ?? existing.date;
  if (!title || !isValidDateKey(date)) return false;

  const updated: CalendarEvent = {
    ...existing,
    title,
    date,
    time: normaliseTime(changes.time ?? existing.time),
    note: (changes.note ?? existing.note).trim().slice(0, NOTE_MAX_LENGTH),
  };

  writeEvents(events.map((event) => (event.id === id ? updated : event)));
  return true;
}

export function deleteEvent(id: string) {
  writeEvents(getEvents().filter((event) => event.id !== id));
}

/** Events keyed by day, which is what a month grid needs to render quickly. */
export function groupByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const grouped = new Map<string, CalendarEvent[]>();

  for (const event of events) {
    const forDay = grouped.get(event.date);
    if (forDay) forDay.push(event);
    else grouped.set(event.date, [event]);
  }

  return grouped;
}
