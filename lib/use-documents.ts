'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { DOCUMENTS_EVENT, DOCUMENTS_KEY, TableDoc, getTables } from '@/lib/documents';

function subscribe(onChange: () => void) {
  window.addEventListener(DOCUMENTS_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(DOCUMENTS_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

// The raw string, so the snapshot only changes when the stored data does.
function getSnapshot(): string {
  try {
    return window.localStorage.getItem(DOCUMENTS_KEY) ?? '';
  } catch {
    return '';
  }
}

function getServerSnapshot(): null {
  return null;
}

interface DocumentsState {
  /** Every table, in the order they were made. */
  tables: TableDoc[];
  /** False on the server and during hydration, so callers can show a placeholder. */
  hydrated: boolean;
}

/** Every table this browser holds, refreshed whenever any of them is written to. */
export function useDocuments(): DocumentsState {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return useMemo(() => {
    if (raw === null) return { tables: [], hydrated: false };
    return { tables: getTables(), hydrated: true };
  }, [raw]);
}
