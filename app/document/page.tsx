'use client';

/**
 * Documents: tables you keep for yourself.
 *
 * The page is one workspace shown two ways. Normally it sits under the navbar
 * with the rest of the site around it; in full screen the same workspace takes
 * the whole window, because a table with eight columns and a filter on it is
 * mostly ruined by a 3xl container. It is the *page* that goes full screen
 * rather than the browser — the browser's own full screen hides the tabs and
 * the clock too, which is more than anybody asked for while filling in a table.
 *
 * Full screen itself comes two ways, because the room it wins can be spent
 * twice. Ordinarily it keeps the tables, the name and the tools above the grid.
 * Asked for *just the table*, it drops all of that and gives the grid every row
 * the window will hold — the tools are for setting a table up, and once it is
 * set up they are three inches of screen spent on buttons nobody is pressing.
 * Two icons stay in the corner so the way back is never a guess, and the
 * choice is held for the visit — full screen re-opens the way it was left.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Check,
  Copy,
  Filter as FilterIcon,
  Maximize2,
  Minimize2,
  PanelTopClose,
  PanelTopOpen,
  Pin,
  PinOff,
  Plus,
  Table2,
  Trash2,
  X,
} from 'lucide-react';
import { FilterBar } from '@/components/document/filter-bar';
import { PictureFolderButton } from '@/components/document/picture-folder';
import { TableGrid } from '@/components/document/table-grid';
import {
  DEFAULT_TABLE_COLUMNS,
  DEFAULT_TABLE_ROWS,
  MAX_COLUMNS,
  MAX_ROWS,
  MAX_TABLES,
  TABLE_NAME_MAX_LENGTH,
  TableDoc,
  addTable,
  deleteTable,
  describeCount,
  duplicateTable,
  imageNamesIn,
  renameTable,
  toggleStickyHeader,
  visibleRows,
} from '@/lib/documents';
import { discardTableImages } from '@/lib/image-folder';
import { useDocuments } from '@/lib/use-documents';

/** Literal greys: `text-muted-foreground` resolves to nothing in this project. */
const MUTED = 'text-[#4B5563] dark:text-[#9CA3AF]';
const SOLID = 'text-[#171717] dark:text-[#FAFAFA]';

const TOOL_BUTTON =
  'inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-black/10 px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10';

const SIZE_FIELD =
  'w-16 rounded-lg border border-black/10 bg-white/70 px-2 py-1 text-sm tabular-nums outline-none transition-colors focus:border-[#FF4D8E]/50 dark:border-white/10 dark:bg-white/5';

/**
 * How big the table about to be made is, as two numbers you type.
 *
 * Kept as the strings that are in the boxes rather than as numbers, so a box
 * being cleared to type "12" is an empty box for that moment instead of
 * snapping back to a 0 the cursor then has to be got past. What they mean is
 * settled by `addTable`, which clamps them to a size a table can be and takes
 * the usual three of either when the box says nothing at all.
 */
function SizeFields({
  rows,
  columns,
  onRows,
  onColumns,
  onSubmit,
}: {
  rows: string;
  columns: string;
  onRows: (value: string) => void;
  onColumns: (value: string) => void;
  /** Enter in either box makes the table, the way Enter in a form does. */
  onSubmit: () => void;
}) {
  const keys = (event: React.KeyboardEvent) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    onSubmit();
  };

  return (
    <>
      <label className={`flex shrink-0 items-center gap-1.5 text-xs font-medium ${MUTED}`}>
        Rows
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_ROWS}
          value={rows}
          onChange={(event) => onRows(event.target.value)}
          onKeyDown={keys}
          aria-label="How many rows"
          className={SIZE_FIELD}
        />
      </label>

      <label className={`flex shrink-0 items-center gap-1.5 text-xs font-medium ${MUTED}`}>
        Columns
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_COLUMNS}
          value={columns}
          onChange={(event) => onColumns(event.target.value)}
          onKeyDown={keys}
          aria-label="How many columns"
          className={SIZE_FIELD}
        />
      </label>
    </>
  );
}

/** What the size boxes come to once a table has been made of them, said in the
 *  same words in both places the boxes appear. */
function describeSize(rows: string, columns: string): string {
  const within = (value: string, most: number, fallback: number) => {
    const asked = Math.round(Number(value));
    return !Number.isFinite(asked) || asked < 1 ? fallback : Math.min(most, asked);
  };

  const madeRows = within(rows, MAX_ROWS, DEFAULT_TABLE_ROWS);
  const madeColumns = within(columns, MAX_COLUMNS, DEFAULT_TABLE_COLUMNS);

  return `${madeRows} row${madeRows === 1 ? '' : 's'} and ${madeColumns} column${
    madeColumns === 1 ? '' : 's'
  }`;
}

/** The table's name, edited where it is written. */
function TableName({ table }: { table: TableDoc }) {
  const [draft, setDraft] = useState(table.name);

  // The stored name can move without this field touching it — another tab, or
  // a rename being refused — so the draft follows it when it does.
  const [known, setKnown] = useState(table.name);
  if (known !== table.name) {
    setKnown(table.name);
    setDraft(table.name);
  }

  return (
    <input
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (!draft.trim() || !renameTable(table.id, draft)) setDraft(table.name);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          setDraft(table.name);
          event.currentTarget.blur();
        }
      }}
      dir="auto"
      maxLength={TABLE_NAME_MAX_LENGTH}
      aria-label="Name of this table"
      className={`min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-base font-semibold outline-none transition-colors hover:border-black/10 focus:border-[#FF4D8E]/50 focus:bg-white/70 dark:hover:border-white/10 dark:focus:bg-white/10 ${SOLID} md:text-lg`}
    />
  );
}

export default function DocumentPage() {
  const { tables, hydrated } = useDocuments();

  const [wantedId, setWantedId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  /** In full screen, whether the grid is on its own with nothing above it. */
  const [justTable, setJustTable] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  /** Whether the size of a new table is being asked for, and what it says. */
  const [sizing, setSizing] = useState(false);
  const [newRows, setNewRows] = useState(String(DEFAULT_TABLE_ROWS));
  const [newColumns, setNewColumns] = useState(String(DEFAULT_TABLE_COLUMNS));

  /** Whether the tables, the name and the tools are on the screen at all. */
  const tools = !(fullscreen && justTable);

  // The table asked for, or the first one — a table can be deleted in another
  // tab, and landing on nothing at all would be a blank page with no way out.
  const table = tables.find((each) => each.id === wantedId) ?? tables[0] ?? null;

  const shown = useMemo(() => (table ? visibleRows(table).length : 0), [table]);

  const select = useCallback((id: string) => {
    setWantedId(id);
    setConfirmDelete(false);
  }, []);

  const handleAddTable = useCallback(() => {
    const made = addTable(undefined, { rows: Number(newRows), columns: Number(newColumns) });
    if (!made) return;

    select(made.id);
    setSizing(false);
  }, [newColumns, newRows, select]);

  /** The whole table again, columns, cells and view alike, and opened on it —
   *  the copy is the one about to be changed, or there would be no reason to
   *  have made it. */
  const handleDuplicate = useCallback(() => {
    if (!table) return;

    const made = duplicateTable(table.id);
    if (made) select(made.id);
  }, [select, table]);

  const handleDelete = useCallback(() => {
    if (!table) return;

    // Gathered before the table goes, swept after: a picture another table is
    // still pointing at is left in the folder.
    const names = imageNamesIn(table.rows);

    deleteTable(table.id);
    setConfirmDelete(false);
    setWantedId(null);

    if (names.length > 0) void discardTableImages(names);
  }, [table]);

  // Full screen holds the whole window, so the page behind it must not scroll
  // under it on a phone.
  useEffect(() => {
    if (!fullscreen) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [fullscreen]);

  // Escape leaves full screen — but not while a cell or a field is being typed
  // into, where it means "put back what was there".
  useEffect(() => {
    if (!fullscreen) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;

      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      setFullscreen(false);
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  /* ------------------------------------------------------------------------ */

  const full = tables.length >= MAX_TABLES;

  const tabs = (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {tables.map((each) => (
          <button
            key={each.id}
            type="button"
            onClick={() => select(each.id)}
            aria-pressed={each.id === table?.id}
            dir="auto"
            className={`inline-flex max-w-48 shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${
              each.id === table?.id
                ? 'bg-[#D81B60] text-white'
                : `border border-black/10 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10 ${SOLID}`
            }`}
          >
            <Table2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">{each.name}</span>
          </button>
        ))}

        {/* The size is asked for rather than assumed: this opens the two boxes
            below instead of making a 3×3 there and then. */}
        <button
          type="button"
          onClick={() => setSizing((was) => !was)}
          disabled={full}
          aria-expanded={sizing}
          title={full ? `${MAX_TABLES} tables is the lot` : 'Start another table'}
          className={`${TOOL_BUTTON} disabled:cursor-not-allowed disabled:opacity-40 ${
            sizing ? 'text-[#D81B60] dark:text-[#FF9EC1]' : MUTED
          }`}
        >
          <Plus className="h-3.5 w-3.5" />
          New table
        </button>
      </div>

      {sizing && !full && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-black/10 bg-white/70 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
          <Table2 className="h-4 w-4 shrink-0 text-[#FF4D8E]" aria-hidden />

          <SizeFields
            rows={newRows}
            columns={newColumns}
            onRows={setNewRows}
            onColumns={setNewColumns}
            onSubmit={handleAddTable}
          />

          <button
            type="button"
            onClick={handleAddTable}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#D81B60] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#C2185B]"
          >
            <Check className="h-3.5 w-3.5" />
            Make table
          </button>

          <button
            type="button"
            onClick={() => setSizing(false)}
            className={`${TOOL_BUTTON} ${MUTED}`}
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </button>

          <p className={`w-full text-xs ${MUTED}`}>
            {describeSize(newRows, newColumns)} — a name, a number and a date to start with, and any past
            those three plain text you can retype from the heading. Rows go up to {MAX_ROWS}, columns to{' '}
            {MAX_COLUMNS}.
          </p>
        </div>
      )}
    </div>
  );

  const workspace = table && (
    <div className={`flex flex-col gap-3 ${fullscreen ? 'min-h-0 flex-1' : ''}`}>
      {/* Put away rather than taken away: `hidden` keeps a half-typed rename in
          the name field, so a trip through "just the table" and back does not
          quietly throw it away. Nothing in here is reachable while it is off —
          `display: none` cannot be clicked, tabbed to or read out. */}
      <div className={`flex flex-wrap items-center gap-1.5 ${tools ? '' : 'hidden'}`}>
        <TableName table={table} />

        <span
          className={`shrink-0 rounded-full bg-black/[0.06] px-2.5 py-1 text-xs font-medium tabular-nums dark:bg-white/10 ${MUTED}`}
        >
          {describeCount(shown, table.rows.length)}
        </span>

        <button
          type="button"
          onClick={() => setShowFilters((was) => !was)}
          aria-pressed={showFilters}
          className={`${TOOL_BUTTON} ${
            table.filters.length > 0 ? 'text-[#D81B60] dark:text-[#FF9EC1]' : MUTED
          }`}
        >
          <FilterIcon className="h-3.5 w-3.5" />
          {table.filters.length > 0 ? `Filters · ${table.filters.length}` : 'Filters'}
        </button>

        <button
          type="button"
          onClick={() => toggleStickyHeader(table.id)}
          aria-pressed={table.stickyHeader}
          title={
            table.stickyHeader
              ? 'The headings stay at the top as the rows scroll. Click to let them scroll away.'
              : 'The headings scroll away with the rows. Click to hold them at the top.'
          }
          className={`${TOOL_BUTTON} ${table.stickyHeader ? 'text-[#D81B60] dark:text-[#FF9EC1]' : MUTED}`}
        >
          {table.stickyHeader ? <Pin className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5" />}
          Sticky header
        </button>

        <PictureFolderButton className={TOOL_BUTTON} />

        <button
          type="button"
          onClick={() => setFullscreen((was) => !was)}
          className={`${TOOL_BUTTON} ${MUTED}`}
          title={fullscreen ? 'Back to the page (Esc)' : 'Give the table the whole window'}
        >
          {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          {fullscreen ? 'Exit full screen' : 'Full screen'}
        </button>

        {/* Only in full screen: on the page there is nothing above the table
            worth hiding, and a header the site's own navbar sits over. */}
        {fullscreen && (
          <button
            type="button"
            onClick={() => {
              setJustTable(true);
              setConfirmDelete(false);
            }}
            title="Give the grid the window on its own — nothing above it but the way back"
            className={`${TOOL_BUTTON} ${MUTED}`}
          >
            <PanelTopClose className="h-3.5 w-3.5" />
            Just the table
          </button>
        )}

        {/* Disabled with the reason on it rather than hidden when there is no
            room for another table: a control that is simply absent tells the one
            person who could make room nothing. */}
        <button
          type="button"
          onClick={handleDuplicate}
          disabled={full}
          title={
            full
              ? `${MAX_TABLES} tables is the lot — delete one to copy this`
              : `Make a copy of ${table.name}, filters and all`
          }
          className={`${TOOL_BUTTON} disabled:cursor-not-allowed disabled:opacity-40 ${MUTED}`}
        >
          <Copy className="h-3.5 w-3.5" />
          Duplicate
        </button>

        {confirmDelete ? (
          <span className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={handleDelete}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#B3261E] px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#8E1D18]"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete for good
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className={`${TOOL_BUTTON} ${MUTED}`}
            >
              <X className="h-3.5 w-3.5" />
              Keep it
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            title={`Delete ${table.name}`}
            className={`${TOOL_BUTTON} ${MUTED}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete table
          </button>
        )}
      </div>

      {tools && (showFilters || table.filters.length > 0) && <FilterBar table={table} />}

      {/* The whole of the chrome, in full screen with the tools put away: the
          way back to them, and the way out. Icons on a line of their own rather
          than floating over the grid — a pill in the corner would sit on the
          last column's heading, which is a menu and a drag handle. */}
      {!tools && (
        <div className="flex shrink-0 items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => setJustTable(false)}
            title="Bring back the tables, the name and the tools"
            className={`${TOOL_BUTTON} ${MUTED}`}
          >
            <PanelTopOpen className="h-3.5 w-3.5" />
            <span className="sr-only">Show the tools</span>
          </button>

          <button
            type="button"
            onClick={() => setFullscreen(false)}
            title="Back to the page (Esc)"
            className={`${TOOL_BUTTON} ${MUTED}`}
          >
            <Minimize2 className="h-3.5 w-3.5" />
            <span className="sr-only">Exit full screen</span>
          </button>
        </div>
      )}

      <TableGrid table={table} fill={fullscreen} onFilterColumn={() => setShowFilters(true)} />
    </div>
  );

  /* ------------------------------------------------------------------------ */

  if (fullscreen && table) {
    return (
      <div
        className={`fixed inset-0 z-[60] flex flex-col gap-3 overflow-auto bg-[#FAFAFA] dark:bg-[#1C1C1E] ${
          tools ? 'p-3 md:p-5' : 'p-2 md:p-3'
        }`}
      >
        {tools && tabs}
        {workspace}
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#FFF5F8] via-[#FAFAFA] to-[#FAFAFA] dark:from-[#1C1C1E] dark:via-[#1C1C1E] dark:to-[#1C1C1E]">
      {/* The whole width of the window rather than the site's reading column: a
          table with eight columns in it is the widest thing on this site, and
          boxing it to the width of a paragraph wastes the half of the screen it
          most needs. The writing on the page keeps a measure of its own. */}
      <div className="w-full px-4 pt-24 pb-16 md:px-6 md:pt-28">
        <motion.header
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-6 md:mb-8"
        >
          <h1 className={`mb-3 text-3xl font-bold ${SOLID} md:text-4xl lg:text-5xl`}>Documents</h1>
          <p className="max-w-2xl text-base text-black/60 dark:text-white/60 md:text-lg">
            Tables you rule yourself: a column for each thing you want to keep, a filter to see only the rows
            that matter, and the whole window when it gets wide. It is all in this browser and nowhere else.
          </p>
        </motion.header>

        {!hydrated ? (
          <div className="space-y-3" aria-hidden>
            <div className="h-8 w-64 animate-pulse rounded-xl bg-black/5 dark:bg-white/10" />
            <div className="h-64 animate-pulse rounded-xl bg-black/5 dark:bg-white/10" />
          </div>
        ) : tables.length === 0 ? (
          <section className="glass-card mx-auto max-w-3xl rounded-2xl p-6 text-center md:p-10">
            <Table2 className="mx-auto mb-3 h-8 w-8 text-[#FF4D8E]" aria-hidden />
            <h2 className={`mb-2 text-xl font-semibold ${SOLID}`}>No tables yet</h2>
            <p className={`mx-auto mb-5 max-w-md text-sm ${MUTED}`}>
              Say how big it is and it is made that size. The first three columns are a name, a number and a
              date, anything past them is plain text, and you rename, retype or throw away any of them from
              the menu on its heading — as you add and remove rows and columns later.
            </p>

            <div className="mb-4 flex flex-wrap items-center justify-center gap-3">
              <SizeFields
                rows={newRows}
                columns={newColumns}
                onRows={setNewRows}
                onColumns={setNewColumns}
                onSubmit={handleAddTable}
              />
            </div>

            <button
              type="button"
              onClick={handleAddTable}
              className="inline-flex items-center gap-2 rounded-xl bg-[#D81B60] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#C2185B]"
            >
              <Plus className="h-4 w-4" />
              Make your first table
            </button>

            <p className={`mt-3 text-xs ${MUTED}`}>{describeSize(newRows, newColumns)}</p>
          </section>
        ) : (
          <section className="glass-card rounded-2xl p-3 md:p-5">
            <div className="mb-3">{tabs}</div>
            {workspace}
          </section>
        )}

        <p className={`mt-6 max-w-3xl text-sm ${MUTED}`}>
          Nothing here is sent anywhere — the tables are in this browser&rsquo;s storage, so they are not on
          your phone and they go with the browser if it is cleared. Take a copy from{' '}
          <Link
            href="/backup"
            className="underline underline-offset-2 hover:text-[#D81B60] dark:hover:text-[#FF9EC1]"
          >
            Your data
          </Link>{' '}
          to carry them to another device.
        </p>
      </div>
    </main>
  );
}
