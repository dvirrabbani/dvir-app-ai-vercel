'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { toDateKey } from '@/lib/calendar';
import { rangeStatus } from '@/lib/milestones';
import {
  CYCLES_EVENT,
  CYCLES_KEY,
  MilestoneCycle,
  countFor,
  dueOn,
  getMilestoneCycles,
  isCycleComplete,
} from '@/lib/milestone-cycles';

function subscribe(onChange: () => void) {
  window.addEventListener(CYCLES_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CYCLES_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

// The raw string, so the snapshot only changes when the stored data does.
function getSnapshot(): string {
  try {
    return window.localStorage.getItem(CYCLES_KEY) ?? '';
  } catch {
    return '';
  }
}

function getServerSnapshot(): null {
  return null;
}

export interface CyclesSummary {
  total: number;
  /** Running right now — started, not yet past the end date. */
  active: number;
  /**
   * Every go due today across them all, and how many are in. Counted in goes
   * rather than tasks, so a pill three times a day is three of each.
   */
  dueToday: number;
  doneToday: number;
}

interface CyclesState {
  cycles: MilestoneCycle[];
  summary: CyclesSummary;
  /** Today as a day key, empty until hydrated so the server render matches. */
  today: string;
  /** False on the server and during hydration, so callers can show a placeholder. */
  hydrated: boolean;
}

const EMPTY_SUMMARY: CyclesSummary = { total: 0, active: 0, dueToday: 0, doneToday: 0 };

/** Running first, then the ones still to start, then the ones already over. */
const STATE_ORDER = { active: 0, upcoming: 1, ended: 2 } as const;

/**
 * Which turn of a cycle is current follows today rather than being stored, so a
 * tab left open overnight keeps yesterday's reckoning until something else moves
 * it — the same trade the calendar's routines make.
 */
export function useMilestoneCycles(): CyclesState {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return useMemo(() => {
    if (raw === null) {
      return { cycles: [], summary: EMPTY_SUMMARY, today: '', hydrated: false };
    }

    // Read once here rather than per item, so one render cannot straddle
    // midnight and sort a list against two different days.
    const today = toDateKey(new Date());
    const stored = getMilestoneCycles();

    let dueToday = 0;
    let doneToday = 0;
    let active = 0;

    for (const item of stored) {
      if (rangeStatus(item.range, today).state === 'active') active += 1;
      for (const task of dueOn(item, today)) {
        dueToday += task.target;
        doneToday += countFor(task, today);
      }
    }

    const cycles = [...stored].sort((a, b) => {
      const byState =
        STATE_ORDER[rangeStatus(a.range, today).state] - STATE_ORDER[rangeStatus(b.range, today).state];
      if (byState !== 0) return byState;

      // Then the finished ones last, so what still needs doing stays on top.
      const byDone = Number(isCycleComplete(a)) - Number(isCycleComplete(b));
      if (byDone !== 0) return byDone;

      return a.range.end.localeCompare(b.range.end) || (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
    });

    return {
      cycles,
      summary: { total: stored.length, active, dueToday, doneToday },
      today,
      hydrated: true,
    };
  }, [raw]);
}
