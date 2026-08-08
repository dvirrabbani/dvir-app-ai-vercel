'use client';

import { useMemo, useSyncExternalStore } from 'react';
import {
  GOALS_EVENT,
  GOALS_KEY,
  Goal,
  GoalSummary,
  getGoals,
  sortGoalsForDisplay,
  summariseGoals,
} from '@/lib/goals';

function subscribe(onChange: () => void) {
  window.addEventListener(GOALS_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(GOALS_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

// The raw string, so the snapshot only changes when the stored data does.
function getSnapshot(): string {
  try {
    return window.localStorage.getItem(GOALS_KEY) ?? '';
  } catch {
    return '';
  }
}

function getServerSnapshot(): null {
  return null;
}

interface GoalsState {
  /** Still to reach first in date order, the reached ones after them. */
  goals: Goal[];
  summary: GoalSummary;
  /** False on the server and during hydration, so callers can show a placeholder. */
  hydrated: boolean;
}

/**
 * The summary counts days, which means reading today's date — so it is worked
 * out here rather than during render, and only ever once the browser has taken
 * over. Everything the section shows sits behind `hydrated` for that reason.
 */
export function useGoals(): GoalsState {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return useMemo(() => {
    if (raw === null) {
      return {
        goals: [],
        summary: { total: 0, reached: 0, passed: 0, nextInDays: null },
        hydrated: false,
      };
    }

    const stored = getGoals();

    return {
      // Sorts are stable, so the date order survives inside each half.
      goals: sortGoalsForDisplay(stored),
      summary: summariseGoals(stored),
      hydrated: true,
    };
  }, [raw]);
}
