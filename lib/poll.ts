/**
 * Poll data: the people voting, the shares they vote on, their votes, and what
 * they said worked better.
 *
 * Like the posts, all of it lives in localStorage — there is no server, so this
 * is one browser's copy of the data rather than something visitors share.
 */

export type PollAnswer = 'helped' | 'not-helped';

export interface PollUser {
  id: string;
  name: string;
  createdAt: string;
}

export interface PollShare {
  id: string;
  title: string;
  description: string;
  createdAt: string;
}

/** One person's answer for one share. At most one row per user per share. */
export interface PollVote {
  userId: string;
  shareId: string;
  answer: PollAnswer;
  votedAt: string;
}

export interface PollSuggestion {
  id: string;
  shareId: string;
  /** Null when it was written before anyone was selected, or by a deleted user. */
  userId: string | null;
  /** Kept alongside userId so the credit survives the user being removed. */
  author: string;
  /** Plain text — rendered as text, never as HTML. */
  text: string;
  createdAt: string;
}

export interface ShareTally {
  helped: number;
  notHelped: number;
  total: number;
}

export const POLL_USERS_KEY = 'dvir-poll:users';
export const POLL_SHARES_KEY = 'dvir-poll:shares';
export const POLL_VOTES_KEY = 'dvir-poll:votes';
export const POLL_SUGGESTIONS_KEY = 'dvir-poll:suggestions';
export const POLL_CURRENT_USER_KEY = 'dvir-poll:current-user';

/** Fired on `window` after any write, so open views can refresh themselves. */
export const POLL_EVENT = 'poll-changed';

export const SUGGESTION_MAX_LENGTH = 500;
export const NAME_MAX_LENGTH = 40;

/* -------------------------------------------------------------------------- */
/*  Low level storage                                                         */
/* -------------------------------------------------------------------------- */

function readList<T>(key: string, isValid: (value: unknown) => value is T): T[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isValid) : [];
  } catch {
    return [];
  }
}

function writeList<T>(key: string, items: T[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent(POLL_EVENT));
  } catch {
    // Storage unavailable (private mode, quota) — the change just does not stick.
  }
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/* -------------------------------------------------------------------------- */
/*  Seed shares                                                               */
/* -------------------------------------------------------------------------- */

const DEFAULT_SHARES: Array<Pick<PollShare, 'title' | 'description'>> = [
  {
    title: 'Work in 20 minute blocks',
    description: 'Set a timer, do one thing until it rings, then stop and take a real break.',
  },
  {
    title: 'Write tomorrow’s list before you close the laptop',
    description: 'Three items, in order. You start the next day already knowing what to pick up.',
  },
  {
    title: 'Keep a done list, not just a to-do list',
    description: 'Note what you finished each day. It shows progress on the days that felt slow.',
  },
];

/**
 * Writes the starter shares when this browser has none stored at all. An
 * existing entry is left alone even when empty, so deleting every share sticks.
 */
export function ensurePollSeeded(): void {
  if (typeof window === 'undefined') return;

  try {
    const raw = window.localStorage.getItem(POLL_SHARES_KEY);
    if (raw !== null && Array.isArray(JSON.parse(raw))) return;
  } catch {
    // Unreadable entry — treat it as missing and write the defaults over it.
  }

  const now = Date.now();
  writeList<PollShare>(
    POLL_SHARES_KEY,
    DEFAULT_SHARES.map((share, index) => ({
      ...share,
      id: makeId(`share${index}`),
      // Spread the timestamps so the list keeps the order written here.
      createdAt: new Date(now - (DEFAULT_SHARES.length - index) * 1000).toISOString(),
    }))
  );
}

/* -------------------------------------------------------------------------- */
/*  Users                                                                     */
/* -------------------------------------------------------------------------- */

function isUser(value: unknown): value is PollUser {
  if (typeof value !== 'object' || value === null) return false;
  const user = value as Partial<PollUser>;
  return typeof user.id === 'string' && typeof user.name === 'string';
}

export function getUsers(): PollUser[] {
  return readList(POLL_USERS_KEY, isUser).sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
}

export function addUser(name: string): PollUser | null {
  const trimmed = name.trim().slice(0, NAME_MAX_LENGTH);
  if (!trimmed) return null;

  const users = getUsers();
  // Names are how you tell people apart here, so keep them unique.
  if (users.some((user) => user.name.toLowerCase() === trimmed.toLowerCase())) return null;

  const user: PollUser = { id: makeId('user'), name: trimmed, createdAt: new Date().toISOString() };
  writeList(POLL_USERS_KEY, [...users, user]);
  return user;
}

export function renameUser(id: string, name: string): boolean {
  const trimmed = name.trim().slice(0, NAME_MAX_LENGTH);
  if (!trimmed) return false;

  const users = getUsers();
  if (users.some((user) => user.id !== id && user.name.toLowerCase() === trimmed.toLowerCase())) return false;

  writeList(
    POLL_USERS_KEY,
    users.map((user) => (user.id === id ? { ...user, name: trimmed } : user))
  );
  return true;
}

/** Removes the person and their votes. Their suggestions stay, credited by name. */
export function deleteUser(id: string) {
  writeList(POLL_USERS_KEY, getUsers().filter((user) => user.id !== id));
  writeList(POLL_VOTES_KEY, getVotes().filter((vote) => vote.userId !== id));
  writeList(
    POLL_SUGGESTIONS_KEY,
    getSuggestions().map((suggestion) => (suggestion.userId === id ? { ...suggestion, userId: null } : suggestion))
  );

  if (getCurrentUserId() === id) setCurrentUserId(null);
}

export function getCurrentUserId(): string | null {
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage.getItem(POLL_CURRENT_USER_KEY);
  } catch {
    return null;
  }
}

export function setCurrentUserId(id: string | null) {
  if (typeof window === 'undefined') return;

  try {
    if (id) window.localStorage.setItem(POLL_CURRENT_USER_KEY, id);
    else window.localStorage.removeItem(POLL_CURRENT_USER_KEY);
    window.dispatchEvent(new CustomEvent(POLL_EVENT));
  } catch {
    // Nothing to do.
  }
}

/* -------------------------------------------------------------------------- */
/*  Shares                                                                    */
/* -------------------------------------------------------------------------- */

function isShare(value: unknown): value is PollShare {
  if (typeof value !== 'object' || value === null) return false;
  const share = value as Partial<PollShare>;
  return typeof share.id === 'string' && typeof share.title === 'string';
}

export function getShares(): PollShare[] {
  return readList(POLL_SHARES_KEY, isShare).sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
}

export function addShare(title: string, description: string): PollShare | null {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) return null;

  const share: PollShare = {
    id: makeId('share'),
    title: trimmedTitle,
    description: description.trim(),
    createdAt: new Date().toISOString(),
  };
  writeList(POLL_SHARES_KEY, [...getShares(), share]);
  return share;
}

export function updateShare(id: string, title: string, description: string): boolean {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) return false;

  writeList(
    POLL_SHARES_KEY,
    getShares().map((share) =>
      share.id === id ? { ...share, title: trimmedTitle, description: description.trim() } : share
    )
  );
  return true;
}

/** Removes the share along with everything attached to it. */
export function deleteShare(id: string) {
  writeList(POLL_SHARES_KEY, getShares().filter((share) => share.id !== id));
  writeList(POLL_VOTES_KEY, getVotes().filter((vote) => vote.shareId !== id));
  writeList(POLL_SUGGESTIONS_KEY, getSuggestions().filter((suggestion) => suggestion.shareId !== id));
}

/* -------------------------------------------------------------------------- */
/*  Votes                                                                     */
/* -------------------------------------------------------------------------- */

function isVote(value: unknown): value is PollVote {
  if (typeof value !== 'object' || value === null) return false;
  const vote = value as Partial<PollVote>;
  return (
    typeof vote.userId === 'string' &&
    typeof vote.shareId === 'string' &&
    (vote.answer === 'helped' || vote.answer === 'not-helped')
  );
}

export function getVotes(): PollVote[] {
  return readList(POLL_VOTES_KEY, isVote);
}

export function findVote(votes: PollVote[], userId: string | null, shareId: string): PollVote | undefined {
  if (!userId) return undefined;
  return votes.find((vote) => vote.userId === userId && vote.shareId === shareId);
}

/** Replaces this person's answer for the share, so nobody counts twice. */
export function setVote(userId: string, shareId: string, answer: PollAnswer) {
  const others = getVotes().filter((vote) => !(vote.userId === userId && vote.shareId === shareId));
  writeList(POLL_VOTES_KEY, [...others, { userId, shareId, answer, votedAt: new Date().toISOString() }]);
}

export function clearVote(userId: string, shareId: string) {
  writeList(
    POLL_VOTES_KEY,
    getVotes().filter((vote) => !(vote.userId === userId && vote.shareId === shareId))
  );
}

export function tallyForShare(votes: PollVote[], shareId: string): ShareTally {
  let helped = 0;
  let notHelped = 0;

  for (const vote of votes) {
    if (vote.shareId !== shareId) continue;
    if (vote.answer === 'helped') helped++;
    else notHelped++;
  }

  return { helped, notHelped, total: helped + notHelped };
}

/* -------------------------------------------------------------------------- */
/*  Suggestions                                                               */
/* -------------------------------------------------------------------------- */

function isSuggestion(value: unknown): value is PollSuggestion {
  if (typeof value !== 'object' || value === null) return false;
  const suggestion = value as Partial<PollSuggestion>;
  return (
    typeof suggestion.id === 'string' &&
    typeof suggestion.shareId === 'string' &&
    typeof suggestion.text === 'string'
  );
}

export function getSuggestions(): PollSuggestion[] {
  return readList(POLL_SUGGESTIONS_KEY, isSuggestion).sort((a, b) =>
    (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
  );
}

export function addSuggestion(shareId: string, text: string, user: PollUser | null): PollSuggestion | null {
  const trimmed = text.trim().slice(0, SUGGESTION_MAX_LENGTH);
  if (!trimmed || !shareId) return null;

  const suggestion: PollSuggestion = {
    id: makeId('tip'),
    shareId,
    userId: user?.id ?? null,
    author: user?.name ?? 'Anonymous',
    text: trimmed,
    createdAt: new Date().toISOString(),
  };
  writeList(POLL_SUGGESTIONS_KEY, [suggestion, ...getSuggestions()]);
  return suggestion;
}

export function deleteSuggestion(id: string) {
  writeList(POLL_SUGGESTIONS_KEY, getSuggestions().filter((suggestion) => suggestion.id !== id));
}
