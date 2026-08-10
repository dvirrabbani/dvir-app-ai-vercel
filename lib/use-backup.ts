'use client';

import { useMemo, useSyncExternalStore } from 'react';
import {
  BACKUP_FEATURES,
  BACKUP_KEYS,
  BackupEntry,
  collectBackup,
  summariseBackup,
} from '@/lib/backup';

function subscribe(onChange: () => void) {
  for (const feature of BACKUP_FEATURES) {
    window.addEventListener(feature.event, onChange);
  }
  window.addEventListener('storage', onChange);

  return () => {
    for (const feature of BACKUP_FEATURES) {
      window.removeEventListener(feature.event, onChange);
    }
    window.removeEventListener('storage', onChange);
  };
}

/**
 * Every travelling key's raw string, joined. Only ever compared against itself,
 * so the separator does not have to be absent from the values.
 */
function getSnapshot(): string {
  try {
    return BACKUP_KEYS.map((key) => window.localStorage.getItem(key) ?? '').join('|');
  } catch {
    return '';
  }
}

function getServerSnapshot(): null {
  return null;
}

interface DeviceData {
  /** One line per feature, in the registry's order. */
  entries: BackupEntry[];
  /** Records across every feature — 0 means there is nothing here to take away. */
  total: number;
  /** False on the server and during hydration, so callers can show a placeholder. */
  hydrated: boolean;
}

/** What this browser is currently holding, refreshed whenever any feature writes. */
export function useDeviceData(): DeviceData {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return useMemo(() => {
    if (raw === null) return { entries: [], total: 0, hydrated: false };

    const entries = summariseBackup(collectBackup().data);
    const total = entries.reduce((sum, entry) => sum + entry.count, 0);
    return { entries, total, hydrated: true };
  }, [raw]);
}
