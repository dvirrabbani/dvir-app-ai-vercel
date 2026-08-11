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
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Filter as FilterIcon, Maximize2, Minimize2, Pin, PinOff, Plus, Table2, Trash2, X } from 'lucide-react';
import { FilterBar } from '@/components/document/filter-bar';
import { PictureFolderButton } from '@/components/document/picture-folder';
import { TableGrid } from '@/components/document/table-grid';
import {
  MAX_TABLES,
  TABLE_NAME_MAX_LENGTH,
  TableDoc,
  addTable,
  deleteTable,
  describeCount,
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
  const [confirmDelete, setConfirmDelete] = useState(false);

  // The table asked for, or the first one — a table can be deleted in another
  // tab, and landing on nothing at all would be a blank page with no way out.
  const table = tables.find((each) => each.id === wantedId) ?? tables[0] ?? null;

  const shown = useMemo(() => (table ? visibleRows(table).length : 0), [table]);

  const select = useCallback((id: string) => {
    setWantedId(id);
    setConfirmDelete(false);
  }, []);

  const handleAddTable = useCallback(() => {
    const made = addTable();
    if (made) select(made.id);
  }, [select]);

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

  const tabs = (
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

      <button
        type="button"
        onClick={handleAddTable}
        disabled={tables.length >= MAX_TABLES}
        title={tables.length >= MAX_TABLES ? `${MAX_TABLES} tables is the lot` : 'Start another table'}
        className={`${TOOL_BUTTON} disabled:cursor-not-allowed disabled:opacity-40 ${MUTED}`}
      >
        <Plus className="h-3.5 w-3.5" />
        New table
      </button>
    </div>
  );

  const workspace = table && (
    <div className={`flex flex-col gap-3 ${fullscreen ? 'min-h-0 flex-1' : ''}`}>
      <div className="flex flex-wrap items-center gap-1.5">
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

      {(showFilters || table.filters.length > 0) && <FilterBar table={table} />}

      <TableGrid table={table} fill={fullscreen} onFilterColumn={() => setShowFilters(true)} />
    </div>
  );

  /* ------------------------------------------------------------------------ */

  if (fullscreen && table) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col gap-3 overflow-auto bg-[#FAFAFA] p-3 dark:bg-[#1C1C1E] md:p-5">
        {tabs}
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
              A new table starts with three columns — a name, a number and a date — and you rename, retype or
              throw away any of them from the menu on its heading.
            </p>
            <button
              type="button"
              onClick={handleAddTable}
              className="inline-flex items-center gap-2 rounded-xl bg-[#D81B60] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#C2185B]"
            >
              <Plus className="h-4 w-4" />
              Make your first table
            </button>
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
