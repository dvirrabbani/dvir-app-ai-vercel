'use client';

import { useMemo, useSyncExternalStore } from 'react';
import {
  DatedMilestone,
  MILESTONES_EVENT,
  MILESTONES_KEY,
  Milestone,
  MilestoneSummary,
  getMilestones,
  sortByCompletion,
  sortByDeadline,
  splitByRange,
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
  /** The ones with dates on them, soonest deadline first. */
  dated: DatedMilestone[];
  /** Everything else, which is what the open/done list shows. */
  undated: Milestone[];
  summary: MilestoneSummary;
  /** False on the server and during hydration, so callers can show a placeholder. */
  hydrated: boolean;
}

export function useMilestones(): MilestonesState {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return useMemo(() => {
    if (raw === null) {
      return {
        milestones: [],
        dated: [],
        undated: [],
        summary: { total: 0, completed: 0, averagePercent: 0 },
        hydrated: false,
      };
    }

    const stored = getMilestones();
    const { dated, undated } = splitByRange(stored);

    return {
      // Unfinished first, done last — so each list reads as what is left to do.
      milestones: sortByCompletion(stored),
      // Sorts are stable, so the deadline order survives inside each half.
      dated: sortByCompletion(sortByDeadline(dated)),
      undated: sortByCompletion(undated),
      summary: summarise(stored),
      hydrated: true,
    };
  }, [raw]);
}
