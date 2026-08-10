'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { SHOWS_EVENT, SHOWS_KEY, Show, getShows, sortByNext } from '@/lib/entertainment';

function subscribe(onChange: () => void) {
  window.addEventListener(SHOWS_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(SHOWS_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

// The raw string, so the snapshot only changes when the stored data does.
function getSnapshot(): string {
  try {
    return window.localStorage.getItem(SHOWS_KEY) ?? '';
  } catch {
    return '';
  }
}

function getServerSnapshot(): null {
  return null;
}

interface ShowsState {
  /** Soonest first, which is what the page reads down. */
  shows: Show[];
  /** False on the server and during hydration, so callers can show a placeholder. */
  hydrated: boolean;
}

/**
 * Which show is on next is worked out at render time rather than stored, so it
 * follows today. A tab left open overnight keeps yesterday's reckoning until
 * something else moves it — the same as the routines beside it.
 */
export function useShows(): ShowsState {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return useMemo(() => {
    if (raw === null) return { shows: [], hydrated: false };
    return { shows: sortByNext(getShows(), new Date()), hydrated: true };
  }, [raw]);
}
