import { CALENDAR_EVENT, CALENDAR_KEY, toDateKey } from '@/lib/calendar';
import { CATEGORIES_EVENT, CATEGORIES_KEY } from '@/lib/categories';
import { CONTACT_EVENT, CONTACT_KEY } from '@/lib/contact';
import { DIET_EVENT, DIET_KEY } from '@/lib/diet';
import { DOCUMENTS_EVENT, DOCUMENTS_KEY } from '@/lib/documents';
import { SHOWS_EVENT, SHOWS_KEY } from '@/lib/entertainment';
import {
  FINANCE_BUDGETS_KEY,
  FINANCE_EVENT,
  FINANCE_SETTINGS_KEY,
  FINANCE_TRANSACTIONS_KEY,
} from '@/lib/finance';
import { GOALS_EVENT, GOALS_KEY } from '@/lib/goals';
import { LIFESTYLE_EVENT, LIFESTYLE_KEY } from '@/lib/lifestyle';
import { LOCAL_DRAFT_KEY, LOCAL_POSTS_EVENT, LOCAL_POSTS_KEY } from '@/lib/local-posts';
import { CYCLES_EVENT, CYCLES_KEY } from '@/lib/milestone-cycles';
import { MILESTONES_EVENT, MILESTONES_KEY } from '@/lib/milestones';
import {
  POLL_EVENT,
  POLL_SHARES_KEY,
  POLL_SUGGESTIONS_KEY,
  POLL_USERS_KEY,
  POLL_VOTES_KEY,
} from '@/lib/poll';
import { ROUTINES_EVENT, ROUTINES_KEY } from '@/lib/routines';
import {
  SELF_CARE_BODY_KEY,
  SELF_CARE_EVENT,
  SELF_CARE_ITEMS_KEY,
  SELF_CARE_STATE_KEY,
} from '@/lib/self-care';

/**
 * Moving a browser's worth of data to another browser, by hand.
 *
 * There is no server behind any of this, so two devices can only share what
 * somebody carries between them. This module is that carrying: every feature's
 * storage keys read out into one JSON file, and the same file read back in on
 * the other device. It owns no records of its own — it is a registry of what
 * the other modules store, plus the two directions.
 */

/** One feature's storage, as the backup file and the page both see it. */
export interface BackupFeature {
  /** Stable id, used as the React key and never written to the file. */
  id: string;
  /** What the page calls it. */
  label: string;
  /** Every storage key the feature owns. */
  keys: readonly string[];
  /** The event to fire once the feature's keys have been written. */
  event: string;
}

/**
 * Every feature that travels. Two things deliberately do not:
 *
 * - `dvir-poll:current-user` — which of the poll's people *this browser* is
 *   answering as. It is about the device, not about the data.
 * - the blog's image folder — a `FileSystemDirectoryHandle` in IndexedDB. A
 *   handle to a folder on one machine means nothing on another, and it cannot
 *   be turned into JSON in the first place.
 */
export const BACKUP_FEATURES: readonly BackupFeature[] = [
  { id: 'routines', label: 'Routines', keys: [ROUTINES_KEY], event: ROUTINES_EVENT },
  { id: 'lifestyle', label: 'Day log', keys: [LIFESTYLE_KEY], event: LIFESTYLE_EVENT },
  { id: 'diet', label: 'Diet menu', keys: [DIET_KEY], event: DIET_EVENT },
  { id: 'entertainment', label: 'Shows', keys: [SHOWS_KEY], event: SHOWS_EVENT },
  { id: 'calendar', label: 'Calendar', keys: [CALENDAR_KEY], event: CALENDAR_EVENT },
  { id: 'milestones', label: 'Milestones', keys: [MILESTONES_KEY], event: MILESTONES_EVENT },
  { id: 'cycles', label: 'Milestone cycles', keys: [CYCLES_KEY], event: CYCLES_EVENT },
  { id: 'goals', label: 'Goals', keys: [GOALS_KEY], event: GOALS_EVENT },
  {
    id: 'posts',
    label: 'Blog posts',
    keys: [LOCAL_POSTS_KEY, LOCAL_DRAFT_KEY],
    event: LOCAL_POSTS_EVENT,
  },
  { id: 'categories', label: 'Blog categories', keys: [CATEGORIES_KEY], event: CATEGORIES_EVENT },
  {
    id: 'poll',
    label: 'Poll',
    keys: [POLL_USERS_KEY, POLL_SHARES_KEY, POLL_VOTES_KEY, POLL_SUGGESTIONS_KEY],
    event: POLL_EVENT,
  },
  { id: 'documents', label: 'Tables', keys: [DOCUMENTS_KEY], event: DOCUMENTS_EVENT },
  {
    id: 'finance',
    label: 'Finance',
    keys: [FINANCE_TRANSACTIONS_KEY, FINANCE_BUDGETS_KEY, FINANCE_SETTINGS_KEY],
    event: FINANCE_EVENT,
  },
  {
    id: 'self-care',
    label: 'Lifestyle',
    // The catalogue itself is a constant in code and therefore already on the
    // other device. Only what that device cannot know travels: the ticks, the
    // notes, anything added by hand, and the weight.
    keys: [SELF_CARE_STATE_KEY, SELF_CARE_ITEMS_KEY, SELF_CARE_BODY_KEY],
    event: SELF_CARE_EVENT,
  },
  { id: 'contact', label: 'Contact messages', keys: [CONTACT_KEY], event: CONTACT_EVENT },
];

/** Every key that travels, in the order the features are listed. */
export const BACKUP_KEYS: readonly string[] = BACKUP_FEATURES.flatMap((feature) => feature.keys);

/** Stamped into the file so a stray JSON cannot be mistaken for one of ours. */
export const BACKUP_FORMAT = 'dvir-app-backup';

/** Bumped only if the shape below stops being readable by older code. */
export const BACKUP_VERSION = 1;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  /** ISO timestamp of the export, shown when loading the file back. */
  exportedAt: string;
  /**
   * Storage key → the *parsed* value that was under it. Parsed rather than the
   * raw string so the file can be read by a human in a text editor; the values
   * are re-serialised on the way back in, and every feature parses through its
   * own type guard anyway.
   */
  data: Record<string, unknown>;
}

/** One line of the "what is in here" list, for a file or for this device. */
export interface BackupEntry {
  id: string;
  label: string;
  /** True when the feature has anything stored at all. */
  present: boolean;
  /** How many records — list lengths summed across the feature's keys. */
  count: number;
}

/* -------------------------------------------------------------------------- */
/*  Reading this device                                                       */
/* -------------------------------------------------------------------------- */

/** Everything this browser has stored, ready to be written out as a file. */
export function collectBackup(): BackupFile {
  const data: Record<string, unknown> = {};

  if (typeof window !== 'undefined') {
    for (const key of BACKUP_KEYS) {
      try {
        const raw = window.localStorage.getItem(key);
        if (raw === null) continue;
        data[key] = JSON.parse(raw) as unknown;
      } catch {
        // Unreadable, or not JSON at all. Leaving it out beats writing a file
        // that cannot be loaded back.
      }
    }
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };
}

/** A stored blob's size in records: lists count their items, anything else counts once. */
function countOf(value: unknown): number {
  if (value === undefined || value === null) return 0;
  if (Array.isArray(value)) return value.length;
  return 1;
}

/** The per-feature list the page shows, for either side of the comparison. */
export function summariseBackup(data: Record<string, unknown>): BackupEntry[] {
  return BACKUP_FEATURES.map((feature) => {
    const present = feature.keys.some((key) => data[key] !== undefined);
    const count = feature.keys.reduce((total, key) => total + countOf(data[key]), 0);
    return { id: feature.id, label: feature.label, present, count };
  });
}

/* -------------------------------------------------------------------------- */
/*  Reading a file                                                            */
/* -------------------------------------------------------------------------- */

function isBackupFile(value: unknown): value is BackupFile {
  if (typeof value !== 'object' || value === null) return false;

  const file = value as Partial<BackupFile>;
  return (
    file.format === BACKUP_FORMAT &&
    typeof file.version === 'number' &&
    typeof file.data === 'object' &&
    file.data !== null &&
    !Array.isArray(file.data)
  );
}

export type BackupParse = { ok: true; file: BackupFile } | { ok: false; error: string };

/** Turn the text of an uploaded file into something safe to apply. */
export function parseBackup(text: string): BackupParse {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }

  if (!isBackupFile(parsed)) {
    return {
      ok: false,
      error: 'That JSON is not a backup from this site — it has no "format": "dvir-app-backup".',
    };
  }

  if (parsed.version > BACKUP_VERSION) {
    return {
      ok: false,
      error: `That backup was written by a newer version of the site (v${parsed.version}). Update this device first.`,
    };
  }

  return { ok: true, file: parsed };
}

/* -------------------------------------------------------------------------- */
/*  Writing this device                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Make this browser match the file: every key in it written, every key it
 * leaves out removed. A feature missing from the file was empty on the device
 * the file came from, so leaving the old records in place would quietly make
 * the two devices disagree — which is the one thing this page exists to fix.
 *
 * Returns false if storage refused the write partway (private mode, quota).
 * The events fire either way, because whatever did land is what the open views
 * should now be showing.
 */
export function applyBackup(file: BackupFile): boolean {
  if (typeof window === 'undefined') return false;

  let complete = true;

  try {
    for (const key of BACKUP_KEYS) {
      const value = file.data[key];
      if (value === undefined) {
        window.localStorage.removeItem(key);
      } else {
        window.localStorage.setItem(key, JSON.stringify(value));
      }
    }
  } catch {
    complete = false;
  }

  // Only once everything is written, so nothing refreshes onto a half-applied
  // store and shows a day log from one device beside a diet menu from another.
  for (const feature of BACKUP_FEATURES) {
    window.dispatchEvent(new CustomEvent(feature.event));
  }

  return complete;
}

/* -------------------------------------------------------------------------- */
/*  The file itself                                                           */
/* -------------------------------------------------------------------------- */

/** Dated, so a folder full of these sorts itself. */
export function backupFilename(date: Date = new Date()): string {
  return `dvir-backup-${toDateKey(date)}.json`;
}

/** Hand the file to the browser's downloads. */
export function downloadBackup(file: BackupFile): void {
  if (typeof window === 'undefined') return;

  const url = URL.createObjectURL(
    new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
  );

  const link = document.createElement('a');
  link.href = url;
  link.download = backupFilename();
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}
