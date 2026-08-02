'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { CALENDAR_EVENT, CALENDAR_KEY, CalendarEvent, getEvents, groupByDate } from '@/lib/calendar';

function subscribe(onChange: () => void) {
  window.addEventListener(CALENDAR_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CALENDAR_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

// The raw string, so the snapshot only changes when the stored data does.
function getSnapshot(): string {
  try {
    return window.localStorage.getItem(CALENDAR_KEY) ?? '';
  } catch {
    return '';
  }
}

function getServerSnapshot(): null {
  return null;
}

interface CalendarState {
  events: CalendarEvent[];
  /** Events keyed by YYYY-MM-DD, for the month grid. */
  byDate: Map<string, CalendarEvent[]>;
  /** False on the server and during hydration, so callers can show a placeholder. */
  hydrated: boolean;
}

export function useCalendar(): CalendarState {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return useMemo(() => {
    if (raw === null) return { events: [], byDate: new Map(), hydrated: false };

    const events = getEvents();
    return { events, byDate: groupByDate(events), hydrated: true };
  }, [raw]);
}
