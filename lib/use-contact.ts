'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { CONTACT_EVENT, CONTACT_KEY, ContactMessage, getMessages } from '@/lib/contact';

function subscribe(onChange: () => void) {
  window.addEventListener(CONTACT_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CONTACT_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

// The raw string, so the snapshot only changes when the stored data does.
function getSnapshot(): string {
  try {
    return window.localStorage.getItem(CONTACT_KEY) ?? '';
  } catch {
    return '';
  }
}

function getServerSnapshot(): null {
  return null;
}

interface ContactState {
  messages: ContactMessage[];
  /** False on the server and during hydration, so callers can show a placeholder. */
  hydrated: boolean;
}

export function useContact(): ContactState {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return useMemo(
    () => (raw === null ? { messages: [], hydrated: false } : { messages: getMessages(), hydrated: true }),
    [raw]
  );
}
