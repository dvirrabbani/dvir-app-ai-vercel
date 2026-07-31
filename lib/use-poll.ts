'use client';

import { useMemo, useSyncExternalStore } from 'react';
import {
  POLL_EVENT,
  POLL_SUGGESTIONS_KEY,
  POLL_TALLY_KEY,
  POLL_VOTE_KEY,
  PollAnswer,
  PollSuggestion,
  PollTally,
  getMyVote,
  getSuggestions,
  getTally,
} from '@/lib/poll';

function subscribe(onChange: () => void) {
  window.addEventListener(POLL_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(POLL_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

// One string covering everything the page reads, so the snapshot only changes
// when the stored data does.
function getSnapshot(): string {
  try {
    const { localStorage } = window;
    return [
      localStorage.getItem(POLL_TALLY_KEY) ?? '',
      localStorage.getItem(POLL_VOTE_KEY) ?? '',
      localStorage.getItem(POLL_SUGGESTIONS_KEY) ?? '',
    ].join('|');
  } catch {
    return '';
  }
}

function getServerSnapshot(): null {
  return null;
}

interface PollState {
  tally: PollTally;
  myVote: PollAnswer | null;
  suggestions: PollSuggestion[];
  total: number;
  /** False on the server and during hydration, so callers can show a placeholder. */
  hydrated: boolean;
}

export function usePoll(): PollState {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return useMemo(() => {
    if (raw === null) {
      return { tally: { helped: 0, notHelped: 0 }, myVote: null, suggestions: [], total: 0, hydrated: false };
    }

    const tally = getTally();
    return {
      tally,
      myVote: getMyVote(),
      suggestions: getSuggestions(),
      total: tally.helped + tally.notHelped,
      hydrated: true,
    };
  }, [raw]);
}
