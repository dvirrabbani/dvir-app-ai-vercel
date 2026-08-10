'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { toDateKey } from '@/lib/calendar';
import {
  DayLog,
  LIFESTYLE_EVENT,
  LIFESTYLE_KEY,
  RangeSummary,
  emptyLog,
  getLogs,
  summariseRange,
} from '@/lib/lifestyle';

function subscribe(onChange: () => void) {
  window.addEventListener(LIFESTYLE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(LIFESTYLE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

// The raw string, so the snapshot only changes when the stored data does.
function getSnapshot(): string {
  try {
    return window.localStorage.getItem(LIFESTYLE_KEY) ?? '';
  } catch {
    return '';
  }
}

function getServerSnapshot(): null {
  return null;
}

interface DayLogState {
  log: DayLog;
  /** Today as a day key, empty until hydrated so the server render matches. */
  today: string;
  /** False on the server and during hydration, so callers can show a placeholder. */
  hydrated: boolean;
}

/** One day's record, following whichever day the page has picked. */
export function useDayLog(date: string): DayLogState {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return useMemo(() => {
    if (raw === null) return { log: emptyLog(date), today: '', hydrated: false };

    return {
      log: getLogs()[date] ?? emptyLog(date),
      today: toDateKey(new Date()),
      hydrated: true,
    };
  }, [date, raw]);
}

interface RangeState {
  summary: RangeSummary;
  today: string;
  hydrated: boolean;
}

const EMPTY_SUMMARY: RangeSummary = {
  days: [],
  logged: 0,
  wokeAverage: '',
  sleptAverage: '',
  asleepAverage: null,
  meals: 0,
  visits: 0,
  mealsByPart: { morning: 0, noon: 0, evening: 0 },
  visitsByPart: { morning: 0, noon: 0, evening: 0 },
  mealsEaten: [],
  longestSleep: 0,
};

/** What a stretch of days adds up to, recomputed when either end moves. */
export function useLogRange(from: string, to: string): RangeState {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return useMemo(() => {
    if (raw === null) return { summary: EMPTY_SUMMARY, today: '', hydrated: false };

    return {
      summary: summariseRange(getLogs(), from, to),
      today: toDateKey(new Date()),
      hydrated: true,
    };
  }, [from, raw, to]);
}
