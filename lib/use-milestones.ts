'use client';

import { useMemo, useSyncExternalStore } from 'react';
import {
  MILESTONES_EVENT,
  MILESTONES_KEY,
  Milestone,
  MilestoneSummary,
  getMilestones,
  sortByCompletion,
  summarise,
} from '@/lib/milestones';

function subscribe(onChange: () => void) {
  window.addEventListener(MILESTONES_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(MILESTONES_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

// The raw string, so the snapshot only changes when the stored data does.
function getSnapshot(): string {
  try {
    return window.localStorage.getItem(MILESTONES_KEY) ?? '';
  } catch {
    return '';
  }
}

function getServerSnapshot(): null {
  return null;
}

interface MilestonesState {
  milestones: Milestone[];
  summary: MilestoneSummary;
  /** False on the server and during hydration, so callers can show a placeholder. */
  hydrated: boolean;
}

export function useMilestones(): MilestonesState {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return useMemo(() => {
    if (raw === null) {
      return { milestones: [], summary: { total: 0, completed: 0, averagePercent: 0 }, hydrated: false };
    }

    // Unfinished first, done last — so the list reads as what is left to do.
    const milestones = sortByCompletion(getMilestones());
    return { milestones, summary: summarise(milestones), hydrated: true };
  }, [raw]);
}
