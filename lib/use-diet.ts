'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { DIET_EVENT, DIET_KEY, Dish, getMenu } from '@/lib/diet';

function subscribe(onChange: () => void) {
  window.addEventListener(DIET_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(DIET_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

// The raw string, so the snapshot only changes when the stored data does.
function getSnapshot(): string {
  try {
    return window.localStorage.getItem(DIET_KEY) ?? '';
  } catch {
    return '';
  }
}

function getServerSnapshot(): null {
  return null;
}

interface DietState {
  /** The menu in the order it was written. */
  menu: Dish[];
  /** False on the server and during hydration, so callers can show a placeholder. */
  hydrated: boolean;
}

/** The standing list of dishes, which every part of the day picks from. */
export function useDietMenu(): DietState {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return useMemo(() => {
    if (raw === null) return { menu: [], hydrated: false };
    return { menu: getMenu(), hydrated: true };
  }, [raw]);
}
