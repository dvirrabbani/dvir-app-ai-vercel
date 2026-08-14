'use client';

import { useMemo, useSyncExternalStore } from 'react';
import {
  Body,
  CareItem,
  CareState,
  DEFAULT_BODY,
  SELF_CARE_BODY_KEY,
  SELF_CARE_EVENT,
  SELF_CARE_ITEMS_KEY,
  SELF_CARE_STATE_KEY,
  allItems,
  getBody,
  getCustomItems,
  getState,
  missingEssentials,
} from '@/lib/self-care';

function subscribe(onChange: () => void) {
  window.addEventListener(SELF_CARE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(SELF_CARE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/**
 * The three raw strings joined, so the snapshot only changes when the stored
 * data does. Parsing here would hand React a new object every render.
 */
function getSnapshot(): string {
  try {
    return [SELF_CARE_STATE_KEY, SELF_CARE_ITEMS_KEY, SELF_CARE_BODY_KEY]
      .map((key) => window.localStorage.getItem(key) ?? '')
      .join('|');
  } catch {
    return '';
  }
}

function getServerSnapshot(): null {
  return null;
}

interface SelfCareState {
  /** The catalogue with anything added by hand folded in after it. */
  items: CareItem[];
  /** Item id → have / use / your line about it. */
  state: CareState;
  /** The weight and the aim the strength numbers are worked out from. */
  body: Body;
  /** The essentials with no tick against them, in catalogue order. */
  missing: CareItem[];
  /** False on the server and during hydration, so callers can show a placeholder. */
  hydrated: boolean;
}

export function useSelfCare(): SelfCareState {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return useMemo(() => {
    if (raw === null) {
      // The catalogue is a constant rather than stored, so it could be handed
      // over before hydration — but a page that drew the list and then the
      // ticks would flash every box on. It waits with everything else.
      return { items: [], state: {}, body: DEFAULT_BODY, missing: [], hydrated: false };
    }

    const items = allItems(getCustomItems());
    const state = getState();

    return { items, state, body: getBody(), missing: missingEssentials(items, state), hydrated: true };
  }, [raw]);
}
