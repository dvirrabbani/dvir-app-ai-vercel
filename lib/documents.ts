/**
 * Documents: tables you keep yourself, a column at a time.
 *
 * Not a spreadsheet and not a database — a sheet of paper with columns ruled on
 * it. A table is a list of columns, a list of rows, and the view you last left
 * it in: which column it is filtered by and which one it is sorted on. The view
 * is stored with the table on purpose. A filter you set is a way of looking at
 * the thing, and coming back tomorrow to find every row again would mean setting
 * it up twice.
 *
 * Every cell is stored as the string that was typed. The column's type says how
 * that string is *read* — compared as a number, ordered as a day, matched as
 * text — but never rewrites it, so changing a column from text to number cannot
 * quietly lose what was in it, and changing it back brings it all round again.
 *
 * A cell can also carry pictures — a screenshot snipped and pasted straight in,
 * with the text beside it — on a column typed to hold them. Only the file names
 * are stored here; the bytes go to a folder the author picks on their own
 * machine, the same one the blog's pasted screenshots go to, because a dozen
 * screenshots in localStorage would fill the quota and take the tables down with
 * them. See `lib/image-folder.ts`.
 *
 * Like everything else here it lives in localStorage only — one browser's copy,
 * shared with nobody, gone if the browser is cleared.
 */

import { isLocalImageName } from '@/lib/local-posts';
import { plainRichText } from '@/lib/rich-text';

export type ColumnType = 'text' | 'number' | 'date' | 'note' | 'check' | 'select';

export const COLUMN_TYPES: readonly ColumnType[] = [
  'text',
  'number',
  'date',
  'note',
  'check',
  'select',
];

export const COLUMN_TYPE_LABELS: Record<ColumnType, string> = {
  text: 'Text',
  number: 'Number',
  date: 'Date',
  note: 'Text & pictures',
  check: 'Tick box',
  select: 'Pick from a list',
};

/** What a tick is written into the cell as. */
export const TICKED = 'yes';

/**
 * Every spelling of a tick this will accept on the way in.
 *
 * A tick box column is the same string as any other cell, read differently — so
 * a column somebody has been filling in by hand with "yes" or an x becomes a
 * column of ticked boxes the moment it is retyped, rather than a column of
 * boxes that are all empty with the answers hidden behind them.
 */
const TICKS = new Set(['yes', 'y', 'true', '1', 'x', '✓', '✔', 'done', 'ok']);

export function isTicked(value: string): boolean {
  return TICKS.has(value.trim().toLowerCase());
}

/**
 * Whether two choices are the same choice. Spelled the way a tick is read:
 * the case and the spaces round it are how it was typed rather than what it
 * says, so "Done" picked off the list and "done" typed by hand are one answer.
 */
export function sameOption(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export interface Column {
  id: string;
  name: string;
  type: ColumnType;
  /** How wide it has been dragged, in pixels. */
  width: number;
  /**
   * The choices a `select` column offers, in the order they are meant to be
   * read — "To do, Doing, Done" rather than alphabetically, which is what
   * sorting the column follows.
   *
   * Kept on the column whatever its type is, so retyping a list of choices as
   * text and back gives the list return along with every cell — the same
   * promise the cells themselves are under. A cell holds the *name* of the
   * choice and not a reference to it, so a column filled in by hand becomes a
   * column of choices the moment the list catches up with it.
   */
  options: string[];
}

export interface Row {
  id: string;
  /** Column id → what was typed. Columns with nothing in them are absent. */
  cells: Record<string, string>;
  /**
   * Column id → the pictures under that cell, as file names in the image folder
   * the author picked on this machine (`lib/image-folder.ts`). Only the names
   * are here: the bytes would fill the localStorage quota in a dozen
   * screenshots, exactly as they would for a blog post, so they live in a real
   * folder and the table keeps the reference. Cells without pictures are absent.
   */
  images: Record<string, string[]>;
  /**
   * Column id → a piece of writing *about* that cell: what the choice means
   * here, what was decided, what still has to happen. Kept in the same markers
   * a cell itself holds (`lib/rich-text.ts`), so it is written and read the way
   * everything else on this page is.
   *
   * Beside the cells rather than inside them, exactly as the pictures are, and
   * for the same reason: the cell goes on holding the one word that was picked,
   * so the column still sorts and filters by the choice. The writing is a layer
   * over that rather than a different kind of value — see `setCellNote`.
   *
   * Not to be confused with the `note` **column type**, which is a cell that
   * *is* writing. This is writing behind a cell that is something else.
   *
   * Kept whatever type the column is, like `Column.options`: retyping a column
   * of choices as text and back gives every page of writing return along with
   * every cell. Cells with nothing written about them are absent.
   */
  notes: Record<string, string>;
}

/**
 * The comparisons a filter can make. Which of them a column offers depends on
 * its type, and what they are *called* does too — `gt` is "greater than" on a
 * number and "is after" on a date, which is the same question asked of a
 * different thing.
 */
export type FilterOperator =
  | 'contains'
  | 'not-contains'
  | 'is'
  | 'is-not'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'empty'
  | 'not-empty'
  | 'has-image'
  | 'no-image'
  | 'ticked'
  | 'not-ticked';

export interface Filter {
  id: string;
  columnId: string;
  operator: FilterOperator;
  /** Ignored by `empty` and `not-empty`, which ask about the cell itself. */
  value: string;
}

export interface Sort {
  columnId: string;
  direction: 'asc' | 'desc';
}

export interface TableDoc {
  id: string;
  name: string;
  columns: Column[];
  rows: Row[];
  /** Every one of them has to pass: two filters narrow, they do not widen. */
  filters: Filter[];
  sort: Sort | null;
  /**
   * Whether the headings stay put at the top of the box while the rows scroll
   * under them. On by default — a column of dates you cannot name is not much
   * use — but it is a view setting like the others, and a table read on a short
   * screen can want every line of its height back.
   */
  stickyHeader: boolean;
  createdAt: string;
  updatedAt: string;
}

export const DOCUMENTS_KEY = 'dvir-documents:tables';

/** Fired on `window` after any write, so open views can refresh themselves. */
export const DOCUMENTS_EVENT = 'documents-changed';

export const TABLE_NAME_MAX_LENGTH = 60;
export const COLUMN_NAME_MAX_LENGTH = 40;
/** A choice is a label on a chip, not a sentence — it has to fit in a cell. */
export const OPTION_MAX_LENGTH = 40;
/**
 * A cell holds a paragraph rather than a phrase — text cells take line breaks,
 * so what goes in one is often several lines. The same size a goal's notes are
 * given in `goals.ts`, which is the other free-writing field in this project.
 *
 * The formatting markers count towards it like every other character, because
 * they *are* other characters: see `lib/rich-text.ts`.
 */
export const CELL_MAX_LENGTH = 2_000;

/**
 * How much can be written *about* a cell (`Row.notes`). Several times a cell,
 * because this is the one field on the page meant to be read as a page — the
 * reasoning behind a choice rather than the choice — and a paragraph limit is
 * what makes somebody keep it somewhere else instead.
 *
 * Not unbounded, and not near it: every table in this browser shares one
 * localStorage quota, and a write that does not fit simply does not stick.
 */
export const CELL_NOTE_MAX_LENGTH = 6_000;

export const MAX_TABLES = 20;
export const MAX_COLUMNS = 24;
/**
 * How many choices one column offers. A list longer than this has stopped
 * being a list of choices and become writing, which is what a text column is
 * for — and a menu you have to scroll to read is slower than typing the word.
 */
export const MAX_COLUMN_OPTIONS = 24;
export const MAX_ROWS = 500;
export const MAX_FILTERS = 8;

/** Enough for a screenshot and the two beside it; a cell is not a gallery. */
export const MAX_CELL_IMAGES = 4;

export const MIN_COLUMN_WIDTH = 90;
export const MAX_COLUMN_WIDTH = 640;
export const DEFAULT_COLUMN_WIDTH = 180;

/* -------------------------------------------------------------------------- */
/*  Reading                                                                   */
/* -------------------------------------------------------------------------- */

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function clampWidth(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_COLUMN_WIDTH;
  return Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round(value)));
}

/**
 * A column's list of choices, read back. Blanks are dropped and a choice
 * already on the list is not added twice — two chips reading "Done" would be
 * one thing you could pick two ways and filter for only half of.
 */
function toOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const options: string[] = [];
  for (const raw of value) {
    if (typeof raw !== 'string') continue;

    const name = raw.trim().slice(0, OPTION_MAX_LENGTH);
    if (!name || options.some((each) => sameOption(each, name))) continue;

    options.push(name);
    if (options.length >= MAX_COLUMN_OPTIONS) break;
  }

  return options;
}

function toColumn(value: unknown): Column | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Partial<Column>;
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string') return null;

  return {
    id: raw.id,
    name: raw.name.slice(0, COLUMN_NAME_MAX_LENGTH),
    type: COLUMN_TYPES.includes(raw.type as ColumnType) ? (raw.type as ColumnType) : 'text',
    width: clampWidth(raw.width),
    // Absent on every column written before one could hold a list, which reads
    // as a column offering no choices — which is what those were.
    options: toOptions(raw.options),
  };
}

/**
 * The pictures under one cell. Every name is checked against the same rule the
 * blog's images are (`isLocalImageName`): a bare file name, no slashes and no
 * `..`, because what comes back out of here is handed to `getFileHandle` and
 * storage is user-writable.
 */
function toCellImages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const names: string[] = [];
  for (const raw of value) {
    if (typeof raw !== 'string' || !isLocalImageName(raw) || names.includes(raw)) continue;

    names.push(raw);
    if (names.length >= MAX_CELL_IMAGES) break;
  }

  return names;
}

/**
 * A row read against the columns that actually exist. A cell left behind by a
 * deleted column is dropped here rather than carried around for ever — it can
 * never be seen or edited again, and it would come back to life the day a new
 * column happened to be given the same id.
 */
function toRow(value: unknown, columnIds: Set<string>): Row | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Partial<Row>;
  if (typeof raw.id !== 'string') return null;

  const cells: Record<string, string> = {};
  if (typeof raw.cells === 'object' && raw.cells !== null && !Array.isArray(raw.cells)) {
    for (const [columnId, cell] of Object.entries(raw.cells as Record<string, unknown>)) {
      if (!columnIds.has(columnId) || typeof cell !== 'string' || cell === '') continue;
      cells[columnId] = cell.slice(0, CELL_MAX_LENGTH);
    }
  }

  // Absent on every row written before a cell could hold a picture, which reads
  // as a row of plain cells — exactly what those were.
  const images: Record<string, string[]> = {};
  if (typeof raw.images === 'object' && raw.images !== null && !Array.isArray(raw.images)) {
    for (const [columnId, list] of Object.entries(raw.images as Record<string, unknown>)) {
      if (!columnIds.has(columnId)) continue;

      const names = toCellImages(list);
      if (names.length > 0) images[columnId] = names;
    }
  }

  // Absent on every row written before a cell could be written about, which
  // reads as a row nothing has been written about — which is what those were.
  const notes: Record<string, string> = {};
  if (typeof raw.notes === 'object' && raw.notes !== null && !Array.isArray(raw.notes)) {
    for (const [columnId, note] of Object.entries(raw.notes as Record<string, unknown>)) {
      if (!columnIds.has(columnId) || typeof note !== 'string' || note === '') continue;
      notes[columnId] = note.slice(0, CELL_NOTE_MAX_LENGTH);
    }
  }

  return { id: raw.id, cells, images, notes };
}

function toFilter(value: unknown, columnIds: Set<string>): Filter | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Partial<Filter>;

  if (typeof raw.id !== 'string' || typeof raw.columnId !== 'string') return null;
  // A filter on a column that has been deleted would hide rows for a reason
  // nothing on the screen could explain, so it goes when the column does.
  if (!columnIds.has(raw.columnId)) return null;
  if (!ALL_OPERATORS.includes(raw.operator as FilterOperator)) return null;

  return {
    id: raw.id,
    columnId: raw.columnId,
    operator: raw.operator as FilterOperator,
    value: typeof raw.value === 'string' ? raw.value.slice(0, CELL_MAX_LENGTH) : '',
  };
}

function toSort(value: unknown, columnIds: Set<string>): Sort | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Partial<Sort>;

  if (typeof raw.columnId !== 'string' || !columnIds.has(raw.columnId)) return null;
  return { columnId: raw.columnId, direction: raw.direction === 'desc' ? 'desc' : 'asc' };
}

function toTable(value: unknown): TableDoc | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Partial<TableDoc>;
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string') return null;

  const columns = (Array.isArray(raw.columns) ? raw.columns : [])
    .map(toColumn)
    .filter((column): column is Column => column !== null)
    .slice(0, MAX_COLUMNS);

  const columnIds = new Set(columns.map((column) => column.id));

  const rows = (Array.isArray(raw.rows) ? raw.rows : [])
    .map((row) => toRow(row, columnIds))
    .filter((row): row is Row => row !== null)
    .slice(0, MAX_ROWS);

  const filters = (Array.isArray(raw.filters) ? raw.filters : [])
    .map((filter) => toFilter(filter, columnIds))
    .filter((filter): filter is Filter => filter !== null)
    .slice(0, MAX_FILTERS);

  const createdAt = typeof raw.createdAt === 'string' ? raw.createdAt : new Date(0).toISOString();

  return {
    id: raw.id,
    name: raw.name.slice(0, TABLE_NAME_MAX_LENGTH) || 'Untitled',
    columns,
    rows,
    filters,
    sort: toSort(raw.sort, columnIds),
    // Absent on every table written before the headings could be let go of,
    // which reads as sticky — which is what those tables were doing.
    stickyHeader: raw.stickyHeader !== false,
    createdAt,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : createdAt,
  };
}

/**
 * Every table, in the order they were made. Not most-recently-touched: the tabs
 * along the top are found by where they are, and a list that re-ordered itself
 * every time a cell was typed into would move the one you are working on.
 */
export function getTables(): TableDoc[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(DOCUMENTS_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(toTable)
      .filter((table): table is TableDoc => table !== null)
      .slice(0, MAX_TABLES);
  } catch {
    return [];
  }
}

export function getTable(id: string): TableDoc | null {
  return getTables().find((table) => table.id === id) ?? null;
}

/* -------------------------------------------------------------------------- */
/*  Writing                                                                   */
/* -------------------------------------------------------------------------- */

function writeTables(tables: TableDoc[]) {
  try {
    window.localStorage.setItem(DOCUMENTS_KEY, JSON.stringify(tables));
    window.dispatchEvent(new CustomEvent(DOCUMENTS_EVENT));
  } catch {
    // Storage unavailable (private mode, quota) — the change just does not stick.
  }
}

/**
 * Every change to a table goes through here: read the lot, hand the one table
 * to the caller, put back whatever it returns. Returning the table unchanged
 * (or null) writes nothing at all, so a rename to the name it already had does
 * not stamp a new `updatedAt` on it.
 */
function editTable(id: string, change: (table: TableDoc) => TableDoc | null): boolean {
  const tables = getTables();
  const existing = tables.find((table) => table.id === id);
  if (!existing) return false;

  const updated = change(existing);
  if (updated === null || updated === existing) return false;

  const stamped = { ...updated, updatedAt: new Date().toISOString() };
  writeTables(tables.map((table) => (table.id === id ? stamped : table)));
  return true;
}

/** The three a table starts with when nobody asks for more. A name, a number
 *  and a date is the shape of most things worth keeping a table of; anything
 *  past them is plain text, which is the type that loses nothing. */
const STARTER_COLUMNS: Array<{ name: string; type: ColumnType; width: number }> = [
  { name: 'Name', type: 'text', width: DEFAULT_COLUMN_WIDTH },
  { name: 'Amount', type: 'number', width: 130 },
  { name: 'Date', type: 'date', width: 150 },
];

/** A count somebody typed, made into one a table can actually have. Anything
 *  that is not a number at all falls back rather than refusing: an empty box
 *  means "the usual", not "no table". */
function countWithin(value: unknown, most: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) return fallback;
  return Math.min(most, Math.max(1, Math.round(value)));
}

export const DEFAULT_TABLE_ROWS = 3;
export const DEFAULT_TABLE_COLUMNS = 3;

/**
 * A new table with somewhere to start typing: three columns and three rows
 * unless a size is asked for, in which case as many of each as fit within
 * `MAX_ROWS` and `MAX_COLUMNS`.
 *
 * Asking for the size up front is not the only way to get there — a column is
 * added from the + at the end of the headings and a row from the bottom of the
 * grid — but a table somebody already knows the shape of is a dozen clicks
 * otherwise, and the shape is the first thing they know.
 */
export function addTable(
  name = 'Untitled table',
  size: { rows?: number; columns?: number } = {}
): TableDoc | null {
  const tables = getTables();
  if (tables.length >= MAX_TABLES) return null;

  const now = new Date().toISOString();
  const wantedColumns = countWithin(size.columns, MAX_COLUMNS, DEFAULT_TABLE_COLUMNS);
  const wantedRows = countWithin(size.rows, MAX_ROWS, DEFAULT_TABLE_ROWS);

  const columns: Column[] = Array.from({ length: wantedColumns }, (_, index) => {
    const starter = STARTER_COLUMNS[index];

    return {
      id: makeId('col'),
      name: starter?.name ?? `Column ${index + 1}`,
      type: starter?.type ?? 'text',
      width: starter?.width ?? DEFAULT_COLUMN_WIDTH,
      options: [],
    };
  });

  const table: TableDoc = {
    id: makeId('tbl'),
    name: name.trim().slice(0, TABLE_NAME_MAX_LENGTH) || 'Untitled table',
    columns,
    rows: Array.from({ length: wantedRows }, () => ({
      id: makeId('row'),
      cells: {},
      images: {},
      notes: {},
    })),
    filters: [],
    sort: null,
    stickyHeader: true,
    createdAt: now,
    updatedAt: now,
  };

  writeTables([...tables, table]);
  return table;
}

export function renameTable(id: string, name: string): boolean {
  const trimmed = name.trim().slice(0, TABLE_NAME_MAX_LENGTH);
  if (!trimmed) return false;

  return editTable(id, (table) => (table.name === trimmed ? null : { ...table, name: trimmed }));
}

/** Headings that stay at the top of the box, or headings that scroll away. */
export function toggleStickyHeader(id: string): boolean {
  return editTable(id, (table) => ({ ...table, stickyHeader: !table.stickyHeader }));
}

export function deleteTable(id: string) {
  writeTables(getTables().filter((table) => table.id !== id));
}

/**
 * A name for the copy that says what it is a copy of and is not the name of a
 * table already there: "Notes (copy)", then "Notes (copy 2)". The tabs along the
 * top are how a table is found, and three tabs reading "Notes" are three tabs
 * you have to open one at a time to tell apart.
 *
 * A copy of a copy counts on rather than nests: the suffix already on the end is
 * taken off before the next one goes on, so it is "Notes (copy 2)" and never
 * "Notes (copy) (copy)", which is a name that says how it was made rather than
 * what it is.
 *
 * The suffix is fitted *within* `TABLE_NAME_MAX_LENGTH` rather than run past it,
 * so a copy of a name already at the limit is still marked as one. There are at
 * most `MAX_TABLES` names to clash with and every attempt spells its suffix
 * differently, so the loop always finds a free one.
 */
function copyName(name: string, taken: string[]): string {
  const used = new Set(taken.map((each) => each.trim().toLowerCase()));
  const of = name.replace(/\s*\(copy(?: \d+)?\)$/i, '').trim() || name.trim();

  for (let attempt = 1; ; attempt += 1) {
    const suffix = attempt === 1 ? ' (copy)' : ` (copy ${attempt})`;
    const stem = of.slice(0, TABLE_NAME_MAX_LENGTH - suffix.length).trim();
    const candidate = `${stem}${suffix}`;

    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}

/**
 * A whole table again under a new name, sitting beside the one it came from.
 *
 * Everything travels: the columns with their types and their lists of choices,
 * every cell as the string it holds, and the *view* — the filters, the sort, the
 * sticky headings — because a table copied to try something on is a table copied
 * to keep looking at the same way.
 *
 * The ids do not travel. Columns and rows are given fresh ones and the cells,
 * the pictures, the filters and the sort are read onto them, so the two tables
 * are never one edit away from each other.
 *
 * The pictures come across as the same file names rather than as copies on
 * disk, exactly as a duplicated row's do — two tables pointing at one
 * screenshot, which is why nothing removes a file without first checking that
 * no other cell and no post still wants it (`discardTableImages`).
 */
export function duplicateTable(id: string): TableDoc | null {
  const tables = getTables();
  if (tables.length >= MAX_TABLES) return null;

  const at = tables.findIndex((table) => table.id === id);
  if (at === -1) return null;

  const source = tables[at];
  const now = new Date().toISOString();

  /** Old column id → the copy's, which everything keyed by one is read through. */
  const columnIds = new Map(source.columns.map((column) => [column.id, makeId('col')]));

  /** A record kept by column id, moved onto the copy's columns. */
  const onCopy = <T>(record: Record<string, T>, take: (value: T) => T): Record<string, T> => {
    const moved: Record<string, T> = {};

    for (const [columnId, value] of Object.entries(record)) {
      const to = columnIds.get(columnId);
      if (to) moved[to] = take(value);
    }

    return moved;
  };

  const sortedOn = source.sort ? columnIds.get(source.sort.columnId) : undefined;

  const copy: TableDoc = {
    id: makeId('tbl'),
    name: copyName(
      source.name,
      tables.map((table) => table.name)
    ),
    columns: source.columns.map((column) => ({
      ...column,
      id: columnIds.get(column.id) as string,
      options: [...column.options],
    })),
    rows: source.rows.map((row) => ({
      id: makeId('row'),
      cells: onCopy(row.cells, (cell) => cell),
      images: onCopy(row.images, (names) => [...names]),
      notes: onCopy(row.notes, (note) => note),
    })),
    filters: source.filters
      .map((filter) => {
        const columnId = columnIds.get(filter.columnId);
        return columnId ? { ...filter, id: makeId('flt'), columnId } : null;
      })
      .filter((filter): filter is Filter => filter !== null),
    sort: source.sort && sortedOn ? { ...source.sort, columnId: sortedOn } : null,
    stickyHeader: source.stickyHeader,
    createdAt: now,
    updatedAt: now,
  };

  const next = [...tables];
  next.splice(at + 1, 0, copy);
  writeTables(next);

  return copy;
}

/* -------------------------------------------------------------------------- */
/*  Columns                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A column at the right-hand end, or at `at` when one is being put between two
 * that are already there. The cells come with it by simply not existing — a
 * column never typed into reads as empty in every row — so an inserted column
 * costs nothing per row and none of the rows are rewritten.
 */
export function addColumn(
  tableId: string,
  input: { name?: string; type?: ColumnType; options?: string[]; at?: number } = {}
): boolean {
  return editTable(tableId, (table) => {
    if (table.columns.length >= MAX_COLUMNS) return null;

    const column: Column = {
      id: makeId('col'),
      name: (input.name ?? `Column ${table.columns.length + 1}`).trim().slice(0, COLUMN_NAME_MAX_LENGTH),
      type: input.type ?? 'text',
      width: DEFAULT_COLUMN_WIDTH,
      options: toOptions(input.options),
    };

    const columns = [...table.columns];
    const at = input.at;
    columns.splice(at === undefined ? columns.length : Math.max(0, Math.min(at, columns.length)), 0, column);

    return { ...table, columns };
  });
}

/**
 * Renaming a column, retyping it, or setting where it has been dragged to.
 *
 * Retyping leaves every cell exactly as it was typed — a number column holding
 * "about six" keeps saying that, and simply sorts and filters as nothing. The
 * alternative is throwing away what somebody wrote because they picked the
 * wrong menu item.
 */
export function updateColumn(
  tableId: string,
  columnId: string,
  changes: { name?: string; type?: ColumnType; width?: number }
): boolean {
  return editTable(tableId, (table) => {
    const existing = table.columns.find((column) => column.id === columnId);
    if (!existing) return null;

    const name = (changes.name ?? existing.name).trim().slice(0, COLUMN_NAME_MAX_LENGTH);
    if (!name) return null;

    const updated: Column = {
      ...existing,
      name,
      type: changes.type ?? existing.type,
      width: changes.width === undefined ? existing.width : clampWidth(changes.width),
    };

    return {
      ...table,
      columns: table.columns.map((column) => (column.id === columnId ? updated : column)),
    };
  });
}

/** A column moved one place left or right, carrying its cells with it. */
export function moveColumn(tableId: string, columnId: string, delta: -1 | 1): boolean {
  return editTable(tableId, (table) => {
    const from = table.columns.findIndex((column) => column.id === columnId);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= table.columns.length) return null;

    const columns = [...table.columns];
    [columns[from], columns[to]] = [columns[to], columns[from]];
    return { ...table, columns };
  });
}

/**
 * A column and everything under it. The filters and the sort go with it — see
 * `toFilter` — because a view of a column that is gone is not a view of
 * anything, and the last column standing cannot be removed: a table with no
 * columns has nowhere to put a row back.
 */
export function deleteColumn(tableId: string, columnId: string): boolean {
  return editTable(tableId, (table) => {
    if (table.columns.length <= 1 || !table.columns.some((column) => column.id === columnId)) {
      return null;
    }

    return {
      ...table,
      columns: table.columns.filter((column) => column.id !== columnId),
      rows: table.rows.map((row) => {
        const cells = { ...row.cells };
        const images = { ...row.images };
        const notes = { ...row.notes };
        delete cells[columnId];
        delete images[columnId];
        delete notes[columnId];
        return { ...row, cells, images, notes };
      }),
      filters: table.filters.filter((filter) => filter.columnId !== columnId),
      sort: table.sort?.columnId === columnId ? null : table.sort,
    };
  });
}

/* -------------------------------------------------------------------------- */
/*  The list a column offers                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Which of a column's choices a cell is holding, or null when it is holding
 * something else — a word typed before the list had it, or a choice since
 * taken off. Nothing is rewritten by the answer: an off-list cell still says
 * what it says and still shows it, exactly as a tick box column holds every
 * spelling of a tick somebody has already written.
 */
export function optionFor(column: Column, value: string): string | null {
  const at = optionIndex(column, value);
  return at === -1 ? null : column.options[at];
}

/**
 * Where on the list a cell's value sits, or -1 for a value the list does not
 * offer. The place rather than the name, because the place is what a choice's
 * colour is taken from — a list of choices that are all one colour is a list
 * you have to read instead of glance at.
 */
export function optionIndex(column: Column, value: string): number {
  const wanted = value.trim();
  if (!wanted) return -1;

  return column.options.findIndex((each) => sameOption(each, wanted));
}

/**
 * The same, for sorting: anything not on the list comes after everything that
 * is. It is not a choice yet, and the point of the order is to read the
 * choices in the order they were put in.
 */
function optionRank(column: Column, value: string): number {
  const at = optionIndex(column, value);
  return at === -1 ? column.options.length : at;
}

/**
 * Every value in this column that the list does not offer, each one once.
 *
 * This is what makes retyping a column somebody has been filling in by hand
 * into a list of choices worth doing: the words already down the column are
 * gathered here and added to the list in one go, rather than being typed out
 * again by hand or quietly becoming a column of things that match nothing.
 */
export function unlistedValues(table: TableDoc, column: Column): string[] {
  const found: string[] = [];

  for (const row of table.rows) {
    const value = cellValue(row, column.id).trim();
    if (!value || optionFor(column, value)) continue;
    if (found.some((each) => sameOption(each, value))) continue;

    found.push(value.slice(0, OPTION_MAX_LENGTH));
    if (found.length >= MAX_COLUMN_OPTIONS) break;
  }

  return found;
}

/** One choice on the end of the list, refused if it is already on it. */
export function addOption(tableId: string, columnId: string, name: string): boolean {
  return editTable(tableId, (table) => {
    const column = table.columns.find((each) => each.id === columnId);
    if (!column) return null;

    const wanted = name.trim().slice(0, OPTION_MAX_LENGTH);
    if (!wanted || column.options.length >= MAX_COLUMN_OPTIONS) return null;
    if (column.options.some((each) => sameOption(each, wanted))) return null;

    return {
      ...table,
      columns: table.columns.map((each) =>
        each.id === columnId ? { ...each, options: [...each.options, wanted] } : each
      ),
    };
  });
}

/**
 * A choice renamed, carrying every cell holding it along with it.
 *
 * This is the one place a cell is rewritten by something other than typing in
 * it, and it is deliberate: a cell of a select column *is* the choice, so a
 * choice renamed and its cells left behind would empty half the column of
 * anything the list could still match. Taking a choice off the list is the
 * other way round — see `removeOption`.
 */
export function renameOption(tableId: string, columnId: string, from: string, to: string): boolean {
  return editTable(tableId, (table) => {
    const column = table.columns.find((each) => each.id === columnId);
    if (!column) return null;

    const wanted = to.trim().slice(0, OPTION_MAX_LENGTH);
    if (!wanted || !column.options.some((each) => sameOption(each, from))) return null;
    // Its own new spelling is allowed through — "done" to "Done" is a rename.
    if (column.options.some((each) => sameOption(each, wanted) && !sameOption(each, from))) return null;

    return {
      ...table,
      columns: table.columns.map((each) =>
        each.id === columnId
          ? { ...each, options: each.options.map((option) => (sameOption(option, from) ? wanted : option)) }
          : each
      ),
      rows: table.rows.map((row) => {
        if (!sameOption(cellValue(row, columnId), from)) return row;
        return { ...row, cells: { ...row.cells, [columnId]: wanted } };
      }),
    };
  });
}

/**
 * A choice off the list. Every cell already holding it is left exactly as it
 * was — the same rule the diet menu follows, and the same reason: what was
 * written down happened, and a list you have stopped offering is not a reason
 * to go back and empty the rows that used it. Those cells simply stop matching
 * anything on the list, and putting the choice back makes them chips again.
 */
export function removeOption(tableId: string, columnId: string, name: string): boolean {
  return editTable(tableId, (table) => {
    const column = table.columns.find((each) => each.id === columnId);
    if (!column || !column.options.some((each) => sameOption(each, name))) return null;

    return {
      ...table,
      columns: table.columns.map((each) =>
        each.id === columnId
          ? { ...each, options: each.options.filter((option) => !sameOption(option, name)) }
          : each
      ),
    };
  });
}

/** A choice one place up or down the list, which is the order it is read in. */
export function moveOption(tableId: string, columnId: string, name: string, delta: -1 | 1): boolean {
  return editTable(tableId, (table) => {
    const column = table.columns.find((each) => each.id === columnId);
    if (!column) return null;

    const from = column.options.findIndex((each) => sameOption(each, name));
    const to = from + delta;
    if (from === -1 || to < 0 || to >= column.options.length) return null;

    const options = [...column.options];
    [options[from], options[to]] = [options[to], options[from]];

    return {
      ...table,
      columns: table.columns.map((each) => (each.id === columnId ? { ...each, options } : each)),
    };
  });
}

/* -------------------------------------------------------------------------- */
/*  Rows and cells                                                            */
/* -------------------------------------------------------------------------- */

/**
 * A blank row at the bottom, or beside `nearRowId` when one is being inserted
 * mid-table. Returns the new row's id so the grid can put the cursor in it.
 *
 * "Beside" is the *stored* order, which is the only order there is — a sort is
 * a way of looking at the rows and never rearranges them (see `visibleRows`).
 * So a row put under the third row is the fourth row, whatever the screen is
 * showing at the time.
 */
export function addRow(
  tableId: string,
  nearRowId?: string,
  where: 'above' | 'below' = 'below'
): string | null {
  const table = getTable(tableId);
  if (!table || table.rows.length >= MAX_ROWS) return null;

  const row: Row = { id: makeId('row'), cells: {}, images: {}, notes: {} };

  const done = editTable(tableId, (current) => {
    if (current.rows.length >= MAX_ROWS) return null;

    const at = nearRowId ? current.rows.findIndex((each) => each.id === nearRowId) : -1;
    if (at === -1) return { ...current, rows: [...current.rows, row] };

    const rows = [...current.rows];
    rows.splice(where === 'above' ? at : at + 1, 0, row);
    return { ...current, rows };
  });

  return done ? row.id : null;
}

export function deleteRow(tableId: string, rowId: string): boolean {
  return editTable(tableId, (table) => {
    if (!table.rows.some((row) => row.id === rowId)) return null;
    return { ...table, rows: table.rows.filter((row) => row.id !== rowId) };
  });
}

/**
 * Everything in a row, into a new one directly beneath it. The pictures come
 * with it as the same file names rather than as copies on disk — two cells
 * pointing at one screenshot, which is why nothing deletes a file without first
 * checking that no other cell still wants it.
 */
export function duplicateRow(tableId: string, rowId: string): string | null {
  const copy: Row = { id: makeId('row'), cells: {}, images: {}, notes: {} };

  const done = editTable(tableId, (table) => {
    const at = table.rows.findIndex((row) => row.id === rowId);
    if (at === -1 || table.rows.length >= MAX_ROWS) return null;

    copy.cells = { ...table.rows[at].cells };
    copy.images = { ...table.rows[at].images };
    copy.notes = { ...table.rows[at].notes };

    const rows = [...table.rows];
    rows.splice(at + 1, 0, copy);
    return { ...table, rows };
  });

  return done ? copy.id : null;
}

/** What is in one cell — absent, for a column never typed into, reads as empty. */
export function cellValue(row: Row, columnId: string): string {
  return row.cells[columnId] ?? '';
}

/**
 * One cell, committed. Emptying a cell removes the key rather than storing an
 * empty string, so a table of mostly-blank rows does not cost a JSON entry per
 * blank.
 */
export function setCell(tableId: string, rowId: string, columnId: string, value: string): boolean {
  const trimmed = value.slice(0, CELL_MAX_LENGTH);

  return editTable(tableId, (table) => {
    const row = table.rows.find((each) => each.id === rowId);
    if (!row || !table.columns.some((column) => column.id === columnId)) return null;
    if (cellValue(row, columnId) === trimmed) return null;

    const cells = { ...row.cells };
    if (trimmed === '') delete cells[columnId];
    else cells[columnId] = trimmed;

    return { ...table, rows: table.rows.map((each) => (each.id === rowId ? { ...each, cells } : each)) };
  });
}

/**
 * A tick box turned over. Ticking writes the word and unticking empties the
 * cell, so an untouched box costs nothing and a column of them reads the same
 * as a column of anything else — which is what keeps a tick box column a way of
 * *reading* a cell rather than a different kind of cell.
 */
export function toggleTick(tableId: string, rowId: string, columnId: string): boolean {
  const row = getTable(tableId)?.rows.find((each) => each.id === rowId);
  if (!row) return false;

  return setCell(tableId, rowId, columnId, isTicked(cellValue(row, columnId)) ? '' : TICKED);
}

/* -------------------------------------------------------------------------- */
/*  Pictures under a cell                                                     */
/* -------------------------------------------------------------------------- */

/** The pictures under one cell, in the order they were put there. */
export function cellImages(row: Row, columnId: string): string[] {
  return row.images[columnId] ?? [];
}

/** Both halves of a cell at once, which is what a picture column shows. */
export function cellIsEmpty(row: Row, columnId: string): boolean {
  return cellValue(row, columnId).trim() === '' && cellImages(row, columnId).length === 0;
}

function writeCellImages(tableId: string, rowId: string, columnId: string, names: string[]): boolean {
  return editTable(tableId, (table) => {
    const row = table.rows.find((each) => each.id === rowId);
    if (!row || !table.columns.some((column) => column.id === columnId)) return null;

    const images = { ...row.images };
    if (names.length === 0) delete images[columnId];
    else images[columnId] = names;

    return { ...table, rows: table.rows.map((each) => (each.id === rowId ? { ...each, images } : each)) };
  });
}

/**
 * A screenshot that has just been written to the folder, remembered against a
 * cell. The name only: what it refers to is a file on this machine, and this is
 * the string that finds it again.
 */
export function addCellImage(tableId: string, rowId: string, columnId: string, name: string): boolean {
  if (!isLocalImageName(name)) return false;

  const row = getTable(tableId)?.rows.find((each) => each.id === rowId);
  if (!row) return false;

  const names = cellImages(row, columnId);
  if (names.length >= MAX_CELL_IMAGES || names.includes(name)) return false;

  return writeCellImages(tableId, rowId, columnId, [...names, name]);
}

/**
 * A picture taken back off a cell. The file itself is left where it is — this
 * module knows nothing about the folder, and whether the file can go is a
 * question for `discardTableImages`, which can see every other cell that might
 * still be pointing at it.
 */
export function removeCellImage(tableId: string, rowId: string, columnId: string, name: string): boolean {
  const row = getTable(tableId)?.rows.find((each) => each.id === rowId);
  if (!row) return false;

  const names = cellImages(row, columnId);
  if (!names.includes(name)) return false;

  return writeCellImages(
    tableId,
    rowId,
    columnId,
    names.filter((each) => each !== name)
  );
}

/**
 * Every picture a set of rows refers to. Used two ways: to gather what a row,
 * a column or a whole table was holding just before it is deleted, and to work
 * out what is still wanted afterwards.
 */
export function imageNamesIn(rows: readonly Row[], columnId?: string): string[] {
  const names = new Set<string>();

  for (const row of rows) {
    for (const [id, list] of Object.entries(row.images)) {
      if (columnId !== undefined && id !== columnId) continue;
      for (const name of list) names.add(name);
    }
  }

  return [...names];
}

/** Every picture every table in this browser is still pointing at. */
export function allTableImageNames(): Set<string> {
  const names = new Set<string>();

  for (const table of getTables()) {
    for (const name of imageNamesIn(table.rows)) names.add(name);
  }

  return names;
}

/* -------------------------------------------------------------------------- */
/*  Writing about a cell                                                      */
/* -------------------------------------------------------------------------- */

/** What has been written about one cell, or nothing at all. */
export function cellNote(row: Row, columnId: string): string {
  return row.notes[columnId] ?? '';
}

/**
 * A page of writing kept against a cell, committed.
 *
 * It never touches the cell itself, which is the whole point: a `select` cell
 * goes on holding the one word that was picked, so the column still sorts by
 * the order of its list and filters by the choice, while everything there is to
 * say about *this* row's choice sits behind it. Filtering deliberately does not
 * read it — "is Done" has to mean the chip says Done, or a filter would start
 * matching rows on a word buried three paragraphs into something else.
 *
 * Emptied back out, the key goes rather than being stored as a blank, so a
 * column nobody has written about costs nothing per row.
 */
export function setCellNote(tableId: string, rowId: string, columnId: string, value: string): boolean {
  const trimmed = value.slice(0, CELL_NOTE_MAX_LENGTH);

  return editTable(tableId, (table) => {
    const row = table.rows.find((each) => each.id === rowId);
    if (!row || !table.columns.some((column) => column.id === columnId)) return null;
    if (cellNote(row, columnId) === trimmed) return null;

    const notes = { ...row.notes };
    if (trimmed.trim() === '') delete notes[columnId];
    else notes[columnId] = trimmed;

    return { ...table, rows: table.rows.map((each) => (each.id === rowId ? { ...each, notes } : each)) };
  });
}

/* -------------------------------------------------------------------------- */
/*  Filtering                                                                 */
/* -------------------------------------------------------------------------- */

const ALL_OPERATORS: readonly FilterOperator[] = [
  'contains',
  'not-contains',
  'is',
  'is-not',
  'gt',
  'gte',
  'lt',
  'lte',
  'empty',
  'not-empty',
  'has-image',
  'no-image',
  'ticked',
  'not-ticked',
];

/** A tick box is one question with two answers, so it offers exactly those. */
const CHECK_OPERATORS: readonly FilterOperator[] = ['ticked', 'not-ticked'];

const TEXT_OPERATORS: readonly FilterOperator[] = [
  'contains',
  'not-contains',
  'is',
  'is-not',
  'empty',
  'not-empty',
];

/** A picture column is text, plus the two questions only it can be asked. */
const NOTE_OPERATORS: readonly FilterOperator[] = [...TEXT_OPERATORS, 'has-image', 'no-image'];

/**
 * A choice is one of a set rather than a point on a scale, so the questions
 * worth asking of it are which one it is and whether it has been answered at
 * all. "Contains" would be asking about the spelling of a chip you picked.
 */
const SELECT_OPERATORS: readonly FilterOperator[] = ['is', 'is-not', 'empty', 'not-empty'];

const ORDERED_OPERATORS: readonly FilterOperator[] = [
  'is',
  'is-not',
  'gt',
  'gte',
  'lt',
  'lte',
  'empty',
  'not-empty',
];

/** Which comparisons a column offers, which is decided by what it holds. */
export function operatorsFor(type: ColumnType): readonly FilterOperator[] {
  if (type === 'note') return NOTE_OPERATORS;
  if (type === 'check') return CHECK_OPERATORS;
  if (type === 'select') return SELECT_OPERATORS;
  return type === 'text' ? TEXT_OPERATORS : ORDERED_OPERATORS;
}

/** The same comparison, said the way that column's readers would say it. */
export function operatorLabel(operator: FilterOperator, type: ColumnType): string {
  switch (operator) {
    case 'contains':
      return 'contains';
    case 'not-contains':
      return 'does not contain';
    case 'is':
      return type === 'date' ? 'is on' : 'is';
    case 'is-not':
      return type === 'date' ? 'is not on' : 'is not';
    case 'gt':
      return type === 'date' ? 'is after' : 'is more than';
    case 'gte':
      return type === 'date' ? 'is on or after' : 'is at least';
    case 'lt':
      return type === 'date' ? 'is before' : 'is less than';
    case 'lte':
      return type === 'date' ? 'is on or before' : 'is at most';
    case 'empty':
      return 'is empty';
    case 'not-empty':
      return 'is not empty';
    case 'has-image':
      return 'has a picture';
    case 'no-image':
      return 'has no picture';
    case 'ticked':
      return 'is ticked';
    case 'not-ticked':
      return 'is not ticked';
  }
}

/** Whether the comparison needs something to compare *against*. */
export function operatorNeedsValue(operator: FilterOperator): boolean {
  return (
    operator !== 'empty' &&
    operator !== 'not-empty' &&
    operator !== 'has-image' &&
    operator !== 'no-image' &&
    operator !== 'ticked' &&
    operator !== 'not-ticked'
  );
}

/** The first operator a column of this type would sensibly be filtered by. */
export function defaultOperatorFor(type: ColumnType): FilterOperator {
  if (type === 'check') return 'ticked';
  return type === 'text' || type === 'note' ? 'contains' : 'is';
}

/**
 * A cell as it *reads*, which is not always as it is stored. A text cell can
 * carry the markers `lib/rich-text.ts` draws as bold or as a title, and those
 * are how the line looks rather than part of what it says — so a filter asks
 * about the words on the screen, and a bolded "Apple" sorts with the apples
 * instead of in front of the whole table under an asterisk.
 *
 * Nothing is rewritten in storage by this: it is the same rule the tick box
 * follows, a type deciding how one string is read.
 */
function readable(value: string, type: ColumnType): string {
  return type === 'text' || type === 'note' ? plainRichText(value) : value;
}

function toNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Where one cell falls against a filter's value: negative, zero or positive, or
 * null when they cannot be compared at all.
 *
 * Dates are YYYY-MM-DD, which sorts as text in date order, so they only need
 * checking for shape. Numbers that will not parse — a note typed into a number
 * column — compare against nothing, which drops the row rather than treating it
 * as a zero and putting it at the front of every "less than" in the table.
 */
function compareValues(cell: string, against: string, type: ColumnType): number | null {
  if (type === 'number') {
    const left = toNumber(cell);
    const right = toNumber(against);
    if (left === null || right === null) return null;
    return left - right;
  }

  const left = cell.trim();
  const right = against.trim();
  if (!left || !right) return null;

  return left.localeCompare(right, undefined, { numeric: type !== 'date', sensitivity: 'base' });
}

/** Whether one row survives one filter. */
export function matchesFilter(row: Row, column: Column, filter: Filter): boolean {
  const cell = readable(cellValue(row, column.id), column.type).trim();

  switch (filter.operator) {
    case 'ticked':
      return isTicked(cell);
    case 'not-ticked':
      return !isTicked(cell);
    case 'has-image':
      return cellImages(row, column.id).length > 0;
    case 'no-image':
      return cellImages(row, column.id).length === 0;
    case 'empty':
      return cell === '';
    case 'not-empty':
      return cell !== '';
    case 'contains':
      return cell.toLowerCase().includes(filter.value.trim().toLowerCase());
    case 'not-contains':
      return !cell.toLowerCase().includes(filter.value.trim().toLowerCase());
    default:
      break;
  }

  // A comparison with nothing to compare against is not a filter yet — the row
  // stays put while the value is still being typed, or while the choice to
  // compare against has not been picked.
  if (!filter.value.trim()) return true;

  // A choice is the same choice or it is not. Read as a comparison it would go
  // through `localeCompare`, where a numeric collation makes "Batch 2" and
  // "Batch 02" one answer — which is fine for sorting a column and wrong for
  // saying which chip is in the cell.
  if (column.type === 'select') {
    const same = sameOption(cell, filter.value);
    return filter.operator === 'is-not' ? !same : same;
  }

  const order = compareValues(cell, filter.value, column.type);
  if (order === null) return false;

  switch (filter.operator) {
    case 'is':
      return order === 0;
    case 'is-not':
      return order !== 0;
    case 'gt':
      return order > 0;
    case 'gte':
      return order >= 0;
    case 'lt':
      return order < 0;
    case 'lte':
      return order <= 0;
    default:
      return true;
  }
}

export function addFilter(tableId: string, columnId: string): boolean {
  return editTable(tableId, (table) => {
    const column = table.columns.find((each) => each.id === columnId);
    if (!column || table.filters.length >= MAX_FILTERS) return null;

    const filter: Filter = {
      id: makeId('flt'),
      columnId,
      operator: defaultOperatorFor(column.type),
      value: '',
    };

    return { ...table, filters: [...table.filters, filter] };
  });
}

/**
 * A filter re-pointed at another column, or re-worded. Moving one to a column
 * of a different type takes its operator with it only if that column offers it
 * — "contains" asked of a date is not a question.
 */
export function updateFilter(
  tableId: string,
  filterId: string,
  changes: { columnId?: string; operator?: FilterOperator; value?: string }
): boolean {
  return editTable(tableId, (table) => {
    const existing = table.filters.find((filter) => filter.id === filterId);
    if (!existing) return null;

    const columnId = changes.columnId ?? existing.columnId;
    const column = table.columns.find((each) => each.id === columnId);
    if (!column) return null;

    const wanted = changes.operator ?? existing.operator;
    const allowed = operatorsFor(column.type);
    const operator = allowed.includes(wanted) ? wanted : defaultOperatorFor(column.type);

    const updated: Filter = {
      id: existing.id,
      columnId,
      operator,
      value: (changes.value ?? existing.value).slice(0, CELL_MAX_LENGTH),
    };

    return { ...table, filters: table.filters.map((filter) => (filter.id === filterId ? updated : filter)) };
  });
}

export function removeFilter(tableId: string, filterId: string): boolean {
  return editTable(tableId, (table) => {
    if (!table.filters.some((filter) => filter.id === filterId)) return null;
    return { ...table, filters: table.filters.filter((filter) => filter.id !== filterId) };
  });
}

export function clearFilters(tableId: string): boolean {
  return editTable(tableId, (table) => (table.filters.length === 0 ? null : { ...table, filters: [] }));
}

/* -------------------------------------------------------------------------- */
/*  Sorting                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The three states a header cycles through: up, down, and back to the order the
 * rows were actually written in. Sorting a table is a way of reading it, not a
 * way of rearranging it, so there is always a way back to the paper order.
 */
export function cycleSort(tableId: string, columnId: string): boolean {
  return editTable(tableId, (table) => {
    if (!table.columns.some((column) => column.id === columnId)) return null;

    if (table.sort?.columnId !== columnId) {
      return { ...table, sort: { columnId, direction: 'asc' } };
    }

    return { ...table, sort: table.sort.direction === 'asc' ? { columnId, direction: 'desc' } : null };
  });
}

/**
 * How two cells of a column order against each other. Empty cells go last
 * whichever way round the sort is — a blank is not a small value, it is a row
 * nobody has filled in yet, and it belongs at the bottom either way.
 */
function compareCells(a: string, b: string, column: Column): number {
  const type = column.type;
  const left = readable(a, type).trim();
  const right = readable(b, type).trim();

  // A tick box is answered either way round, so an empty one is not a blank to
  // be pushed to the bottom — it is the "no" half of the column, and sorting is
  // how the two halves are put side by side.
  if (type === 'check') return Number(isTicked(left)) - Number(isTicked(right));

  if (!left || !right) return left ? -1 : right ? 1 : 0;

  // A list is in the order somebody put it in, and that order is the answer to
  // "sort by this column": To do, then Doing, then Done. Alphabetically that
  // reads Doing, Done, To do, which is not a state of anything. Two cells the
  // list does not offer rank the same and fall through to reading as text.
  if (type === 'select') {
    const first = optionRank(column, left);
    const second = optionRank(column, right);
    if (first !== second) return first - second;
  }

  if (type === 'number') {
    const first = toNumber(left);
    const second = toNumber(right);
    if (first === null || second === null) return first === null ? (second === null ? 0 : 1) : -1;
    return first - second;
  }

  // Dates are YYYY-MM-DD and sort as text; anything else reads with numbers in
  // it counted as numbers, so "Item 2" comes before "Item 10".
  return left.localeCompare(right, undefined, { numeric: type !== 'date', sensitivity: 'base' });
}

/**
 * The rows as the grid shows them: everything that passes every filter, in the
 * sort order if there is one. The stored order is never touched — this is the
 * view, and the table underneath it stays as it was typed.
 */
export function visibleRows(table: TableDoc): Row[] {
  const columns = new Map(table.columns.map((column) => [column.id, column]));

  const rows = table.rows.filter((row) =>
    table.filters.every((filter) => {
      const column = columns.get(filter.columnId);
      return column ? matchesFilter(row, column, filter) : true;
    })
  );

  const sort = table.sort;
  if (!sort) return rows;

  const column = columns.get(sort.columnId);
  if (!column) return rows;

  const direction = sort.direction === 'asc' ? 1 : -1;

  return [...rows].sort(
    (a, b) => direction * compareCells(cellValue(a, column.id), cellValue(b, column.id), column)
  );
}

/** "3 of 12 rows" once a filter is on, and plain "12 rows" when it is not. */
export function describeCount(shown: number, total: number): string {
  const rows = `${total} row${total === 1 ? '' : 's'}`;
  return shown === total ? rows : `${shown} of ${rows}`;
}
