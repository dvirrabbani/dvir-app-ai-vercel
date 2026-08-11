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

export type ColumnType = 'text' | 'number' | 'date' | 'note' | 'check';

export const COLUMN_TYPES: readonly ColumnType[] = ['text', 'number', 'date', 'note', 'check'];

export const COLUMN_TYPE_LABELS: Record<ColumnType, string> = {
  text: 'Text',
  number: 'Number',
  date: 'Date',
  note: 'Text & pictures',
  check: 'Tick box',
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

export interface Column {
  id: string;
  name: string;
  type: ColumnType;
  /** How wide it has been dragged, in pixels. */
  width: number;
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
/**
 * A cell holds a paragraph rather than a phrase — text cells take line breaks,
 * so what goes in one is often several lines. The same size a goal's notes are
 * given in `goals.ts`, which is the other free-writing field in this project.
 *
 * The formatting markers count towards it like every other character, because
 * they *are* other characters: see `lib/rich-text.ts`.
 */
export const CELL_MAX_LENGTH = 2_000;

export const MAX_TABLES = 20;
export const MAX_COLUMNS = 24;
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

function toColumn(value: unknown): Column | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Partial<Column>;
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string') return null;

  return {
    id: raw.id,
    name: raw.name.slice(0, COLUMN_NAME_MAX_LENGTH),
    type: COLUMN_TYPES.includes(raw.type as ColumnType) ? (raw.type as ColumnType) : 'text',
    width: clampWidth(raw.width),
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

  return { id: raw.id, cells, images };
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

/** A new table with somewhere to start typing: three columns and three rows. */
export function addTable(name = 'Untitled table'): TableDoc | null {
  const tables = getTables();
  if (tables.length >= MAX_TABLES) return null;

  const now = new Date().toISOString();
  const columns: Column[] = [
    { id: makeId('col'), name: 'Name', type: 'text', width: DEFAULT_COLUMN_WIDTH },
    { id: makeId('col'), name: 'Amount', type: 'number', width: 130 },
    { id: makeId('col'), name: 'Date', type: 'date', width: 150 },
  ];

  const table: TableDoc = {
    id: makeId('tbl'),
    name: name.trim().slice(0, TABLE_NAME_MAX_LENGTH) || 'Untitled table',
    columns,
    rows: Array.from({ length: 3 }, () => ({ id: makeId('row'), cells: {}, images: {} })),
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

/* -------------------------------------------------------------------------- */
/*  Columns                                                                   */
/* -------------------------------------------------------------------------- */

export function addColumn(tableId: string, input: { name?: string; type?: ColumnType } = {}): boolean {
  return editTable(tableId, (table) => {
    if (table.columns.length >= MAX_COLUMNS) return null;

    const column: Column = {
      id: makeId('col'),
      name: (input.name ?? `Column ${table.columns.length + 1}`).trim().slice(0, COLUMN_NAME_MAX_LENGTH),
      type: input.type ?? 'text',
      width: DEFAULT_COLUMN_WIDTH,
    };

    return { ...table, columns: [...table.columns, column] };
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
        delete cells[columnId];
        delete images[columnId];
        return { ...row, cells, images };
      }),
      filters: table.filters.filter((filter) => filter.columnId !== columnId),
      sort: table.sort?.columnId === columnId ? null : table.sort,
    };
  });
}

/* -------------------------------------------------------------------------- */
/*  Rows and cells                                                            */
/* -------------------------------------------------------------------------- */

/**
 * A blank row at the bottom, or under `afterRowId` when one is being inserted
 * mid-table. Returns the new row's id so the grid can put the cursor in it.
 */
export function addRow(tableId: string, afterRowId?: string): string | null {
  const table = getTable(tableId);
  if (!table || table.rows.length >= MAX_ROWS) return null;

  const row: Row = { id: makeId('row'), cells: {}, images: {} };

  const done = editTable(tableId, (current) => {
    if (current.rows.length >= MAX_ROWS) return null;

    const at = afterRowId ? current.rows.findIndex((each) => each.id === afterRowId) : -1;
    if (at === -1) return { ...current, rows: [...current.rows, row] };

    const rows = [...current.rows];
    rows.splice(at + 1, 0, row);
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
  const copy: Row = { id: makeId('row'), cells: {}, images: {} };

  const done = editTable(tableId, (table) => {
    const at = table.rows.findIndex((row) => row.id === rowId);
    if (at === -1 || table.rows.length >= MAX_ROWS) return null;

    copy.cells = { ...table.rows[at].cells };
    copy.images = { ...table.rows[at].images };

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
  // stays put while the value is still being typed.
  if (!filter.value.trim()) return true;

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
function compareCells(a: string, b: string, type: ColumnType): number {
  const left = readable(a, type).trim();
  const right = readable(b, type).trim();

  // A tick box is answered either way round, so an empty one is not a blank to
  // be pushed to the bottom — it is the "no" half of the column, and sorting is
  // how the two halves are put side by side.
  if (type === 'check') return Number(isTicked(left)) - Number(isTicked(right));

  if (!left || !right) return left ? -1 : right ? 1 : 0;

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
    (a, b) => direction * compareCells(cellValue(a, column.id), cellValue(b, column.id), column.type)
  );
}

/** "3 of 12 rows" once a filter is on, and plain "12 rows" when it is not. */
export function describeCount(shown: number, total: number): string {
  const rows = `${total} row${total === 1 ? '' : 's'}`;
  return shown === total ? rows : `${shown} of ${rows}`;
}
