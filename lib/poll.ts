/**
 * Poll data. Like the posts, this lives in localStorage only — there is no
 * server, so a vote counts for the browser that cast it and nothing is shared
 * between visitors.
 */

export type PollAnswer = 'helped' | 'not-helped';

export interface PollTally {
  helped: number;
  notHelped: number;
}

export interface PollSuggestion {
  id: string;
  /** What worked for this person. Plain text — rendered as text, never as HTML. */
  text: string;
  author: string;
  createdAt: string;
}

export const POLL_TALLY_KEY = 'dvir-poll:tally';
export const POLL_VOTE_KEY = 'dvir-poll:vote';
export const POLL_SUGGESTIONS_KEY = 'dvir-poll:suggestions';

/** Fired on `window` after any write, so open views can refresh themselves. */
export const POLL_EVENT = 'poll-changed';

export const SUGGESTION_MAX_LENGTH = 500;

const EMPTY_TALLY: PollTally = { helped: 0, notHelped: 0 };

function notifyChange() {
  window.dispatchEvent(new CustomEvent(POLL_EVENT));
}

/* -------------------------------------------------------------------------- */
/*  Votes                                                                     */
/* -------------------------------------------------------------------------- */

export function getTally(): PollTally {
  if (typeof window === 'undefined') return EMPTY_TALLY;

  try {
    const raw = window.localStorage.getItem(POLL_TALLY_KEY);
    if (!raw) return EMPTY_TALLY;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return EMPTY_TALLY;

    const { helped, notHelped } = parsed as Partial<PollTally>;
    return {
      helped: Number.isFinite(helped) ? Math.max(0, Number(helped)) : 0,
      notHelped: Number.isFinite(notHelped) ? Math.max(0, Number(notHelped)) : 0,
    };
  } catch {
    return EMPTY_TALLY;
  }
}

/** The answer this browser already gave, if any. */
export function getMyVote(): PollAnswer | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(POLL_VOTE_KEY);
    return raw === 'helped' || raw === 'not-helped' ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Records a vote. Voting again moves the existing one rather than adding a
 * second, so the totals always match the number of people who answered.
 */
export function castVote(answer: PollAnswer) {
  if (typeof window === 'undefined') return;

  const previous = getMyVote();
  if (previous === answer) return;

  const tally = getTally();
  const next: PollTally = {
    helped: tally.helped + (answer === 'helped' ? 1 : 0) - (previous === 'helped' ? 1 : 0),
    notHelped: tally.notHelped + (answer === 'not-helped' ? 1 : 0) - (previous === 'not-helped' ? 1 : 0),
  };

  try {
    window.localStorage.setItem(POLL_TALLY_KEY, JSON.stringify({
      helped: Math.max(0, next.helped),
      notHelped: Math.max(0, next.notHelped),
    }));
    window.localStorage.setItem(POLL_VOTE_KEY, answer);
    notifyChange();
  } catch {
    // Storage unavailable — the vote simply does not stick.
  }
}

/* -------------------------------------------------------------------------- */
/*  Suggestions                                                               */
/* -------------------------------------------------------------------------- */

function isSuggestion(value: unknown): value is PollSuggestion {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Partial<PollSuggestion>;
  return typeof item.id === 'string' && typeof item.text === 'string';
}

export function getSuggestions(): PollSuggestion[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(POLL_SUGGESTIONS_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(isSuggestion)
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  } catch {
    return [];
  }
}

function writeSuggestions(suggestions: PollSuggestion[]) {
  window.localStorage.setItem(POLL_SUGGESTIONS_KEY, JSON.stringify(suggestions));
  notifyChange();
}

export function addSuggestion(text: string, author: string): PollSuggestion | null {
  const trimmed = text.trim().slice(0, SUGGESTION_MAX_LENGTH);
  if (!trimmed) return null;

  const suggestion: PollSuggestion = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text: trimmed,
    author: author.trim() || 'Anonymous',
    createdAt: new Date().toISOString(),
  };

  try {
    writeSuggestions([suggestion, ...getSuggestions()]);
    return suggestion;
  } catch {
    return null;
  }
}

export function deleteSuggestion(id: string) {
  if (typeof window === 'undefined') return;

  try {
    writeSuggestions(getSuggestions().filter((suggestion) => suggestion.id !== id));
  } catch {
    // Nothing to do — the list stays as it was.
  }
}
