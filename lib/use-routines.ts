'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { ROUTINES_EVENT, ROUTINES_KEY, Routine, RoutineCadence, getRoutines, todayKey } from '@/lib/routines';

// The hook only splits routines by cadence; which days a group falls on is
// worked out by the region that renders it.

function subscribe(onChange: () => void) {
  window.addEventListener(ROUTINES_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(ROUTINES_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

// The raw string, so the snapshot only changes when the stored data does.
function getSnapshot(): string {
  try {
    return window.localStorage.getItem(ROUTINES_KEY) ?? '';
  } catch {
    return '';
  }
}

function getServerSnapshot(): null {
  return null;
}

interface RoutinesState {
  routines: Routine[];
  /** The routines of one cadence, in creation order. */
  byCadence: Record<RoutineCadence, Routine[]>;
  /** Today as a day key, empty until hydrated so the server render matches. */
  today: string;
  /** False on the server and during hydration, so callers can show a placeholder. */
  hydrated: boolean;
}

const EMPTY_BY_CADENCE: Record<RoutineCadence, Routine[]> = { daily: [], weekly: [], monthly: [] };

/**
 * Which day a routine falls on is worked out at render time rather than stored,
 * so it follows today rather than whatever the clock said when it was written.
 * The page is not re-rendered at midnight: a tab left open overnight keeps
 * yesterday's reckoning until something else moves it.
 */
export function useRoutines(): RoutinesState {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return useMemo(() => {
    if (raw === null) {
      return { routines: [], byCadence: EMPTY_BY_CADENCE, today: '', hydrated: false };
    }

    const routines = getRoutines();

    return {
      routines,
      byCadence: {
        daily: routines.filter((routine) => routine.cadence === 'daily'),
        weekly: routines.filter((routine) => routine.cadence === 'weekly'),
        monthly: routines.filter((routine) => routine.cadence === 'monthly'),
      },
      today: todayKey(),
      hydrated: true,
    };
  }, [raw]);
}
