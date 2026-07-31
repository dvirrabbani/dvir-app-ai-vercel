'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  POLL_CURRENT_USER_KEY,
  POLL_EVENT,
  POLL_SHARES_KEY,
  POLL_SUGGESTIONS_KEY,
  POLL_USERS_KEY,
  POLL_VOTES_KEY,
  PollShare,
  PollSuggestion,
  PollUser,
  PollVote,
  ensurePollSeeded,
  getCurrentUserId,
  getShares,
  getSuggestions,
  getUsers,
  getVotes,
} from '@/lib/poll';

function subscribe(onChange: () => void) {
  window.addEventListener(POLL_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(POLL_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

// One string covering everything the pages read, so the snapshot only changes
// when the stored data does.
function getSnapshot(): string {
  try {
    const { localStorage } = window;
    return [
      localStorage.getItem(POLL_USERS_KEY) ?? '',
      localStorage.getItem(POLL_SHARES_KEY) ?? '',
      localStorage.getItem(POLL_VOTES_KEY) ?? '',
      localStorage.getItem(POLL_SUGGESTIONS_KEY) ?? '',
      localStorage.getItem(POLL_CURRENT_USER_KEY) ?? '',
    ].join('|');
  } catch {
    return '';
  }
}

function getServerSnapshot(): null {
  return null;
}

export interface PollState {
  users: PollUser[];
  shares: PollShare[];
  votes: PollVote[];
  suggestions: PollSuggestion[];
  currentUser: PollUser | null;
  /** False on the server and during hydration, so callers can show a placeholder. */
  hydrated: boolean;
}

export function usePoll(): PollState {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Writing the starter shares notifies the store above, which re-renders with them.
  useEffect(() => {
    ensurePollSeeded();
  }, []);

  return useMemo(() => {
    if (raw === null) {
      return { users: [], shares: [], votes: [], suggestions: [], currentUser: null, hydrated: false };
    }

    const users = getUsers();
    const currentUserId = getCurrentUserId();

    return {
      users,
      shares: getShares(),
      votes: getVotes(),
      suggestions: getSuggestions(),
      currentUser: users.find((user) => user.id === currentUserId) ?? null,
      hydrated: true,
    };
  }, [raw]);
}
