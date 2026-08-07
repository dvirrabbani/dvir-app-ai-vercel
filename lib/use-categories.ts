'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  CATEGORIES_EVENT,
  CATEGORIES_KEY,
  PostCategory,
  ensureCategoriesSeeded,
  getCategories,
} from '@/lib/categories';

function subscribe(onChange: () => void) {
  window.addEventListener(CATEGORIES_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CATEGORIES_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

// The raw string, so the snapshot only changes when the stored data does.
function getSnapshot(): string {
  try {
    return window.localStorage.getItem(CATEGORIES_KEY) ?? '';
  } catch {
    return '';
  }
}

function getServerSnapshot(): null {
  return null;
}

interface CategoriesState {
  categories: PostCategory[];
  /** False on the server and during hydration, so callers can show a placeholder. */
  hydrated: boolean;
}

export function useCategories(): CategoriesState {
  // Seeding writes, so it waits until the browser is in charge.
  useEffect(() => {
    ensureCategoriesSeeded();
  }, []);

  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return useMemo(() => {
    if (raw === null) return { categories: [], hydrated: false };
    return { categories: getCategories(), hydrated: true };
  }, [raw]);
}
