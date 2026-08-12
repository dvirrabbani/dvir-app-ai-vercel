'use client';

/**
 * The table itself: the grid you type into.
 *
 * It is built to be used the way a spreadsheet is, because that is what anybody
 * meeting a grid of cells already knows. One click puts the cursor on a cell,
 * arrows move it, and simply starting to type replaces what is there — there is
 * no "edit" button anywhere, because reaching for one every cell is the thing
 * that makes a table tiring to fill in. Enter goes down, Tab goes across, Escape
 * puts back what was there before you started.
 *
 * Nothing here decides what a table *is* — `lib/documents.ts` owns the records
 * and every write goes through it. This is only the surface.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUp,
  ArrowUpToLine,
  ChevronLeft,
  ChevronRight,
  Copy,
  Filter as FilterIcon,
  List,
  MoreVertical,
  Plus,
  Trash2,
} from 'lucide-react';
import { fromDateKey, isValidDateKey } from '@/lib/calendar';
import {
  CELL_MAX_LENGTH,
  COLUMN_NAME_MAX_LENGTH,
  COLUMN_TYPES,
  COLUMN_TYPE_LABELS,
  Column,
  ColumnType,
  MAX_CELL_IMAGES,
  MAX_CELL_TAGS,
  MAX_COLUMNS,
  MAX_ROWS,
  MIN_COLUMN_WIDTH,
  MAX_COLUMN_WIDTH,
  Row,
  TableDoc,
  addCellImage,
  addColumn,
  addFilter,
  addRow,
  cellImages,
  cellValue,
  cycleSort,
  isTicked,
  toggleTick,
  deleteColumn,
  deleteRow,
  duplicateRow,
  imageNamesIn,
  moveColumn,
  picksFromList,
  setCell,
  updateColumn,
  visibleRows,
} from '@/lib/documents';
import { discardTableImages } from '@/lib/image-folder';
import { shortcutCommand } from '@/lib/rich-text';
import { NoteCellBody, NoteEditor } from '@/components/document/cell-note';
import {
  CellNotePanel,
  OptionListPanel,
  OptionPicker,
  SelectCellBody,
} from '@/components/document/cell-select';
import { PictureViewer } from '@/components/document/picture-viewer';
import {
  FormatToolbar,
  RichCellEditor,
  RichCellHandle,
  RichText,
} from '@/components/document/rich-text';
import { imageFrom, keepPicture } from '@/components/document/picture-folder';

/** Literal greys: `text-muted-foreground` resolves to nothing in this project. */
const MUTED = 'text-[#4B5563] dark:text-[#9CA3AF]';
const SOLID = 'text-[#171717] dark:text-[#FAFAFA]';
const LINE = 'border-black/10 dark:border-white/10';

/** Where the cursor is. By id rather than by index: a sort or a filter can move
 *  a row out from under the cursor, and it should follow the row it was on. */
interface Cursor {
  rowId: string;
  columnId: string;
}

/** The cell whose panel is open, and where on the screen to open it against. */
interface OpenNote extends Cursor {
  anchor: DOMRect;
}

/** The same, for the menu a `select` cell opens — plus the character that
 *  opened it, when it was opened by typing straight over the cell. */
interface OpenPick extends OpenNote {
  initial?: string;
}

/** The column whose list of choices is being edited, and where to open it. */
interface OpenList {
  columnId: string;
  anchor: DOMRect;
}

/**
 * The two columns that are not data: the row numbers, and the one at the end
 * holding the + and the slack.
 *
 * The number column is sized for everything in it at once rather than for the
 * number: 16px of padding, 24 for a row number of up to three digits — a table
 * holds 500 rows and "500" does not fit in the 16 this used to give it — 4 of
 * gap, and 34 for the ⋮ and the bin beside it. That comes to 78, and the rest
 * of the 84 is air: the slack falls between the number and the buttons, which
 * `justify-between` puts at either end.
 *
 * At 48 the two buttons ran out past the cell's own edge and sat on the border.
 * At 68 they fitted and still touched it, which reads as the same mistake —
 * what a person sees is the bin against the line, not the two pixels of it that
 * are on the right side of the line. The padding is what buys that, so it is
 * `px-2` rather than the `px-1` the number alone wanted.
 */
const NUMBER_COLUMN_WIDTH = 84;
const FILLER_COLUMN_WIDTH = 40;

/** A date shown as a day rather than as its key; anything else exactly as typed. */
function displayCell(value: string, type: ColumnType): string {
  if (type !== 'date' || !isValidDateKey(value)) return value;

  return fromDateKey(value).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/* -------------------------------------------------------------------------- */
/*  The menu on a column                                                      */
/* -------------------------------------------------------------------------- */

function HeaderMenu({
  table,
  column,
  index,
  onFilter,
  onEditList,
}: {
  table: TableDoc;
  column: Column;
  index: number;
  onFilter: () => void;
  /** Opens the column's list of choices, against the menu it was asked from. */
  onEditList: (anchor: DOMRect) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const close = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const full = table.columns.length >= MAX_COLUMNS;

  const item =
    'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/10';

  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        title={`Options for ${column.name}`}
        aria-label={`Options for ${column.name}`}
        aria-expanded={open}
        className={`rounded p-0.5 transition-colors hover:bg-black/10 dark:hover:bg-white/10 ${MUTED}`}
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div
          className={`absolute right-0 top-6 z-30 w-48 rounded-xl border bg-white p-1 shadow-lg dark:bg-[#26262A] ${LINE}`}
        >
          <p className={`px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide ${MUTED}`}>
            Holds
          </p>
          {COLUMN_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => {
                updateColumn(table.id, column.id, { type });
                setOpen(false);

                // A column that has just been told it holds choices off a list,
                // and has no list, is a column of nothing you can pick — so the
                // list opens rather than leaving somebody to find it.
                if (picksFromList(type) && column.options.length === 0) {
                  const anchor = box.current?.getBoundingClientRect();
                  if (anchor) onEditList(anchor);
                }
              }}
              className={`${item} ${column.type === type ? 'font-semibold text-[#D81B60] dark:text-[#FF9EC1]' : SOLID}`}
            >
              {COLUMN_TYPE_LABELS[type]}
            </button>
          ))}

          <div className={`my-1 border-t ${LINE}`} />

          {picksFromList(column.type) && (
            <button
              type="button"
              onClick={() => {
                const anchor = box.current?.getBoundingClientRect();
                setOpen(false);
                if (anchor) onEditList(anchor);
              }}
              className={`${item} ${SOLID}`}
            >
              <List className="h-3.5 w-3.5 shrink-0" />
              Edit the list
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              onFilter();
              setOpen(false);
            }}
            className={`${item} ${SOLID}`}
          >
            <FilterIcon className="h-3.5 w-3.5 shrink-0" />
            Filter by this column
          </button>

          {/* A new column beside this one rather than at the far end. The + in
              the corner still adds at the end, which is where a column is
              usually wanted; this is for the one that belongs next to
              something. */}
          <button
            type="button"
            disabled={full}
            onClick={() => {
              addColumn(table.id, { at: index });
              setOpen(false);
            }}
            title={full ? `A table holds ${MAX_COLUMNS} columns` : `Add a column before ${column.name}`}
            className={`${item} ${SOLID}`}
          >
            <ArrowLeftToLine className="h-3.5 w-3.5 shrink-0" />
            Insert column left
          </button>
          <button
            type="button"
            disabled={full}
            onClick={() => {
              addColumn(table.id, { at: index + 1 });
              setOpen(false);
            }}
            title={full ? `A table holds ${MAX_COLUMNS} columns` : `Add a column after ${column.name}`}
            className={`${item} ${SOLID}`}
          >
            <ArrowRightToLine className="h-3.5 w-3.5 shrink-0" />
            Insert column right
          </button>

          <button
            type="button"
            disabled={index === 0}
            onClick={() => {
              moveColumn(table.id, column.id, -1);
              setOpen(false);
            }}
            className={`${item} ${SOLID}`}
          >
            <ChevronLeft className="h-3.5 w-3.5 shrink-0" />
            Move left
          </button>
          <button
            type="button"
            disabled={index === table.columns.length - 1}
            onClick={() => {
              moveColumn(table.id, column.id, 1);
              setOpen(false);
            }}
            className={`${item} ${SOLID}`}
          >
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            Move right
          </button>

          <div className={`my-1 border-t ${LINE}`} />

          <button
            type="button"
            disabled={table.columns.length <= 1}
            onClick={() => {
              // What was under this column, gathered before it goes: afterwards
              // there is nothing left to say which files it was holding.
              const names = imageNamesIn(table.rows, column.id);
              deleteColumn(table.id, column.id);
              if (names.length > 0) void discardTableImages(names);
              setOpen(false);
            }}
            title={
              table.columns.length <= 1
                ? 'A table keeps at least one column'
                : `Delete ${column.name} and everything in it`
            }
            className={`${item} text-[#B3261E] dark:text-[#FFB4AB]`}
          >
            <Trash2 className="h-3.5 w-3.5 shrink-0" />
            Delete column
          </button>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  A column heading                                                          */
/* -------------------------------------------------------------------------- */

function HeaderCell({
  table,
  column,
  index,
  width,
  onResize,
  onFilter,
  onEditList,
}: {
  table: TableDoc;
  column: Column;
  index: number;
  /** What to draw at — the live width while this one is being dragged. */
  width: number;
  /** A width to show and not yet store, or null when the pointer lifts. */
  onResize: (width: number | null) => void;
  onFilter: () => void;
  onEditList: (anchor: DOMRect) => void;
}) {
  const [draft, setDraft] = useState(column.name);

  // The stored name can move without this header touching it — another tab, or
  // a rename being refused — so the draft follows it when it does.
  const [known, setKnown] = useState(column.name);
  if (known !== column.name) {
    setKnown(column.name);
    setDraft(column.name);
  }

  const sorted = table.sort?.columnId === column.id ? table.sort.direction : null;

  /* The drag handle on the right edge. The width is shown while the pointer is
     down and only written once it lifts — a write per pixel would be a few
     hundred trips to storage for one drag. It is held by the grid rather than
     here because the table has to state its own total for any of these widths
     to be honoured, and that total has to move as the handle does. */
  const startResize = useCallback(
    (event: React.PointerEvent<HTMLSpanElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = column.width;
      const handle = event.currentTarget;
      handle.setPointerCapture(event.pointerId);

      const widthAt = (moveEvent: PointerEvent) =>
        Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, startWidth + moveEvent.clientX - startX));

      const onMove = (moveEvent: PointerEvent) => onResize(widthAt(moveEvent));

      const onUp = (upEvent: PointerEvent) => {
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        handle.removeEventListener('pointercancel', onUp);
        onResize(null);
        updateColumn(table.id, column.id, { width: widthAt(upEvent) });
      };

      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
      handle.addEventListener('pointercancel', onUp);
    },
    [column.id, column.width, onResize, table.id]
  );

  return (
    <th
      scope="col"
      style={{ width }}
      className={`relative border-b border-r p-0 text-left align-middle ${LINE}`}
    >
      <div className="flex items-center gap-1 px-1.5 py-1.5">
        <button
          type="button"
          onClick={() => cycleSort(table.id, column.id)}
          title={
            sorted === 'asc'
              ? `Sort ${column.name} the other way`
              : sorted === 'desc'
                ? `Stop sorting by ${column.name}`
                : `Sort by ${column.name}`
          }
          className={`shrink-0 rounded p-0.5 transition-colors hover:bg-black/10 dark:hover:bg-white/10 ${
            sorted ? 'text-[#D81B60] dark:text-[#FF9EC1]' : MUTED
          }`}
        >
          {sorted === 'desc' ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />}
        </button>

        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (!draft.trim() || !updateColumn(table.id, column.id, { name: draft })) setDraft(column.name);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') {
              setDraft(column.name);
              event.currentTarget.blur();
            }
          }}
          dir="auto"
          maxLength={COLUMN_NAME_MAX_LENGTH}
          aria-label={`Rename ${column.name}`}
          title={`${column.name} — ${COLUMN_TYPE_LABELS[column.type].toLowerCase()}`}
          className={`min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs font-semibold outline-none transition-colors hover:border-black/10 focus:border-[#FF4D8E]/50 focus:bg-white/70 dark:hover:border-white/10 dark:focus:bg-white/10 ${SOLID}`}
        />

        <HeaderMenu
          table={table}
          column={column}
          index={index}
          onFilter={onFilter}
          onEditList={onEditList}
        />
      </div>

      {/* Sat over the border itself, so the whole line between two columns is
          what you reach for rather than a few pixels beside it. */}
      <span
        onPointerDown={startResize}
        onDoubleClick={() => updateColumn(table.id, column.id, { width: 180 })}
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${column.name}`}
        title="Drag to resize"
        className="absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize touch-none hover:bg-[#FF4D8E]/40"
      />
    </th>
  );
}

/* -------------------------------------------------------------------------- */
/*  One cell                                                                  */
/* -------------------------------------------------------------------------- */

function GridCell({
  row,
  column,
  active,
  draft,
  panelOpen,
  onSelect,
  onBeginEdit,
  onDraft,
  onKeyDown,
  onCommit,
  onPasteImage,
  onViewImage,
  onToggleTick,
  onOpenNote,
  label,
}: {
  row: Row;
  column: Column;
  active: boolean;
  /** Non-null while this cell is the one being typed into. */
  draft: string | null;
  /** Whether this cell's own panel — the note editor, the list of choices —
   *  is open over the page, which is where the keyboard is while it is. */
  panelOpen: boolean;
  onSelect: () => void;
  /** The rect goes with it: a picture cell opens a panel against itself. */
  onBeginEdit: (initial: string | undefined, rect: DOMRect | null) => void;
  onDraft: (next: string) => void;
  /** `read` is how the grid gets at what is in the cell: a text cell is written
   *  in a surface with no `value` on it, so the box has to be asked. */
  onKeyDown: (event: React.KeyboardEvent, read: () => string) => void;
  onCommit: (value: string) => void;
  onPasteImage: (blob: Blob) => void;
  onViewImage: (names: string[], at: number) => void;
  onToggleTick: () => void;
  /** Opens what is written about this cell, against the tag that asked. */
  onOpenNote: (anchor: DOMRect) => void;
  label: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  /** The surface being typed in, so the formatting buttons have something to
   *  act on and the grid has something to read the cell out of. */
  const field = useRef<RichCellHandle>(null);
  const type = column.type;
  const value = cellValue(row, column.id);
  const editing = draft !== null;

  // The cursor is where the keyboard is, so the cell under it takes focus —
  // that is what makes the arrow keys reach this handler at all. Not while a
  // panel of its own is open: the keyboard is in there. It comes back the
  // moment the panel closes, which is what keeps a column of choices quick to
  // fill in — pick one, then straight down to the next row with an arrow.
  useEffect(() => {
    if (active && !editing && !panelOpen) box.current?.focus({ preventScroll: false });
  }, [active, editing, panelOpen]);

  if (editing) {
    return (
      <td className={`border-b border-r p-0 ${LINE}`}>
        {type === 'text' ? (
          // The ring and the background are on the wrapper rather than the box
          // itself, so the formatting buttons sit inside the cell being written
          // in rather than looking like something floating over the next row.
          <div className={`bg-white ring-2 ring-inset ring-[#FF4D8E] dark:bg-[#26262A]`}>
            {/* Written as it will be read: the bold word is bold while it is
                being typed and the markers never appear at all. The surface
                grows with what is in it — a cell can hold a paragraph, and the
                whole of it should be visible rather than scrolling past a slot
                one line tall. */}
            <RichCellEditor
              ref={field}
              value={draft}
              max={CELL_MAX_LENGTH}
              label={label}
              onKeyDown={(event) => {
                const command = shortcutCommand(event);

                if (command) {
                  event.preventDefault();
                  field.current?.run(command);
                  return;
                }

                /* A break inside the cell is Enter with **any** of Alt, Shift,
                   Ctrl or Cmd held — Alt+Enter as in Excel, Shift+Enter as in
                   most chat boxes, Ctrl+Enter for the people who reach for
                   that. Which one a person tries first is a habit and none of
                   them is wrong. Plain Enter means "done, next row down", which
                   is what makes a column of a hundred rows quick, and it
                   belongs to the grid below. */
                if (event.key === 'Enter' && (event.altKey || event.shiftKey || event.ctrlKey || event.metaKey)) {
                  event.preventDefault();
                  field.current?.breakLine();
                  return;
                }

                onKeyDown(event, () => field.current?.read() ?? draft);
              }}
              onBlur={() => {
                // Only while the surface is still there. A blur arriving as the
                // cell closes would otherwise commit whatever an absent box
                // reads as, which is nothing at all.
                const handle = field.current;
                if (handle) onCommit(handle.read());
              }}
              className={`block w-full whitespace-pre-wrap break-words px-2 py-1.5 text-sm leading-snug ${SOLID}`}
            />

            {/* Under the writing rather than over it: a cell is as narrow as it
                has been dragged to, and a row of buttons above would have to
                cover the heading or the row before. They wrap when there is no
                room, and every one of them has a keystroke as well. */}
            <FormatToolbar editor={field} className={`border-t px-1 py-0.5 ${LINE}`} />
          </div>
        ) : (
          <input
            autoFocus
            value={draft}
            maxLength={CELL_MAX_LENGTH}
            dir="auto"
            aria-label={label}
            onKeyDown={(event) => onKeyDown(event, () => event.currentTarget.value)}
            onBlur={(event) => onCommit(event.target.value)}
            type={type === 'date' ? 'date' : 'text'}
            inputMode={type === 'number' ? 'decimal' : undefined}
            onChange={(event) => onDraft(event.target.value)}
            className={`w-full bg-white px-2 py-1.5 text-sm outline-none ring-2 ring-inset ring-[#FF4D8E] dark:bg-[#26262A] ${SOLID} ${
              type === 'date' ? '[color-scheme:light] dark:[color-scheme:dark]' : ''
            } ${type === 'number' ? 'text-right tabular-nums' : ''}`}
          />
        )}
      </td>
    );
  }

  return (
    <td className={`border-b border-r p-0 align-top ${LINE}`}>
      <div
        ref={box}
        tabIndex={active ? 0 : -1}
        aria-label={label}
        // Each cell reads in its own direction, taken from what is written in
        // it: a Hebrew line sits to the right and its full stop lands on the
        // left, in the same column as an English one that does neither. The
        // table itself does not turn round — the columns stay in the order they
        // were made, and the row numbers stay where they were.
        dir="auto"
        onClick={onSelect}
        onDoubleClick={() => onBeginEdit(undefined, box.current?.getBoundingClientRect() ?? null)}
        onKeyDown={(event) => onKeyDown(event, () => value)}
        // A snip can go straight onto the cell it belongs in without opening
        // anything first, which is rather the point of having snipped it.
        onPaste={
          type === 'note'
            ? (event) => {
                const blob = imageFrom(event.clipboardData);
                if (!blob) return;
                event.preventDefault();
                onPasteImage(blob);
              }
            : undefined
        }
        // Writing is shown as it was written, line breaks and all, and the row
        // grows to hold it — the same way a cell in a post's table does. A
        // number or a date is one line by nature and keeps its ellipsis.
        // Named so the tag on a cell of choices can come up under the pointer
        // without every other cell in the row coming up with it: the row is
        // already a `group`, and the row is not what is being reached for.
        className={`group/cell cursor-cell px-2 py-1.5 text-sm outline-none ${SOLID} ${
          type === 'text' || type === 'note'
            ? 'whitespace-pre-wrap break-words leading-snug'
            : picksFromList(type)
              ? 'leading-snug'
              : 'truncate'
        } ${type === 'number' ? 'text-right tabular-nums' : ''} ${type === 'check' ? 'text-center' : ''} ${
          active
            ? 'bg-[#FF4D8E]/[0.06] ring-2 ring-inset ring-[#FF4D8E]'
            : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.05]'
        }`}
      >
        {/* A non-breaking space so an empty cell is still a full line tall and
            can be clicked on at all. */}
        {type === 'check' ? (
          <input
            type="checkbox"
            checked={isTicked(value)}
            onChange={onToggleTick}
            // The grid moves by cell, so the box is not its own stop on the way
            // round with Tab — the cell it sits in is, and Space ticks it from
            // there. Reached with the mouse it works as any box does.
            tabIndex={-1}
            aria-label={label}
            className="h-4 w-4 cursor-pointer accent-[#D81B60] align-middle"
          />
        ) : type === 'note' ? (
          <NoteCellBody row={row} column={column} onView={onViewImage} />
        ) : picksFromList(type) ? (
          // The choices as chips — one of them, or every tag between the commas
          // — and anything the list does not offer still shown as what somebody
          // wrote, a type saying how a string is read. The ⓘ beside them opens
          // what has been written about this cell.
          <SelectCellBody row={row} column={column} onOpenNote={onOpenNote} />
        ) : type === 'text' ? (
          // Drawn rather than printed out: `**a**` is a bold a and a line
          // opening with `# ` is a title. Every marker is still a character
          // somebody typed — see `lib/rich-text.ts` — so retyping this column
          // as a number and back brings all of it round again. An empty cell
          // comes back from here as a line of its own, and stays clickable.
          <RichText value={value} />
        ) : (
          displayCell(value, type) || ' '
        )}
      </div>
    </td>
  );
}

/* -------------------------------------------------------------------------- */
/*  The menu on a row                                                         */
/* -------------------------------------------------------------------------- */

/** Measured rather than guessed: this is only what the menu is *placed* by, so
 *  it opens upwards near the bottom of the window instead of off the edge. */
const ROW_MENU_WIDTH = 184;
const ROW_MENU_HEIGHT = 112;

/** On the button that opens a row's menu, so the menu can tell that button
 *  apart from a click anywhere else. */
const ROW_MENU_TRIGGER = 'data-row-menu';

/**
 * What can be done to one row: a blank one put in over or under it, or a copy
 * of it. It is a menu rather than three more icons beside the number because
 * that column is `NUMBER_COLUMN_WIDTH` across and everything in it has to stay
 * legible on every row of a long table — the two that are there already are
 * what it is sized for; the bin stays out in the open, being the one of them
 * anybody reaches for in a hurry.
 *
 * Rendered by the grid rather than inside the row, and `position: fixed`
 * against the button that asked for it — the same rule the note panel and the
 * list of choices follow, since a menu drawn inside the scrolling box is cut
 * off by its edge on every row near the bottom.
 */
function RowMenu({
  anchor,
  full,
  number,
  onInsert,
  onDuplicate,
  onClose,
}: {
  anchor: DOMRect;
  /** No room for another row: inserting and duplicating are both off. */
  full: boolean;
  /** Which row it belongs to as the screen has it, for what it says out loud. */
  number: number;
  onInsert: (where: 'above' | 'below') => void;
  onDuplicate: () => void;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const away = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      // The button that opens one is not "away": it closes the menu itself, by
      // being a toggle, and closing here first would only have it opened again
      // by the click that follows.
      if (box.current?.contains(target) || target?.closest(`[${ROW_MENU_TRIGGER}]`)) return;
      onClose();
    };

    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [onClose]);

  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - ROW_MENU_WIDTH - 8));
  const below = anchor.bottom + 4;
  const top =
    below + ROW_MENU_HEIGHT > window.innerHeight
      ? Math.max(8, anchor.top - ROW_MENU_HEIGHT - 4)
      : below;

  const item =
    'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/10';

  const title = full ? `A table holds ${MAX_ROWS} rows` : undefined;

  return (
    <div
      ref={box}
      style={{ left, top, width: ROW_MENU_WIDTH }}
      className={`fixed z-50 rounded-xl border bg-white p-1 shadow-lg dark:bg-[#26262A] ${LINE}`}
    >
      <button
        type="button"
        disabled={full}
        onClick={() => onInsert('above')}
        title={title}
        className={`${item} ${SOLID}`}
      >
        <ArrowUpToLine className="h-3.5 w-3.5 shrink-0" />
        Insert row above
      </button>
      <button
        type="button"
        disabled={full}
        onClick={() => onInsert('below')}
        title={title}
        className={`${item} ${SOLID}`}
      >
        <ArrowDownToLine className="h-3.5 w-3.5 shrink-0" />
        Insert row below
      </button>

      <div className={`my-1 border-t ${LINE}`} />

      <button
        type="button"
        disabled={full}
        onClick={onDuplicate}
        title={title ?? `Copy row ${number} into a new row under it`}
        className={`${item} ${SOLID}`}
      >
        <Copy className="h-3.5 w-3.5 shrink-0" />
        Duplicate row
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  The grid                                                                  */
/* -------------------------------------------------------------------------- */

export function TableGrid({
  table,
  fill,
  onFilterColumn,
}: {
  table: TableDoc;
  /** True in full screen, where the grid takes whatever height is left. */
  fill?: boolean;
  /** Opens the filter bar on the page, having added one for this column. */
  onFilterColumn: () => void;
}) {
  const rows = useMemo(() => visibleRows(table), [table]);
  const columns = table.columns;

  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [note, setNote] = useState<OpenNote | null>(null);
  /** The cell whose choices are open, and the column whose list is. */
  const [pick, setPick] = useState<OpenPick | null>(null);
  const [list, setList] = useState<OpenList | null>(null);
  /** The cell whose writing is open — the page behind a chip, not the cell. */
  const [about, setAbout] = useState<OpenNote | null>(null);
  /** The row whose menu is open, and where on the screen to open it against. */
  const [rowMenu, setRowMenu] = useState<{ rowId: string; anchor: DOMRect } | null>(null);
  /** The cell's pictures being read over the page, and which of them is up. */
  const [viewing, setViewing] = useState<{ names: string[]; at: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resizing, setResizing] = useState<{ columnId: string; width: number } | null>(null);

  /** What a column is being drawn at: the width under the pointer, or its own. */
  const widthOf = useCallback(
    (column: Column) => (resizing?.columnId === column.id ? resizing.width : column.width),
    [resizing]
  );

  /**
   * The width the table itself declares, which is the whole reason the columns
   * come out at the sizes they were dragged to.
   *
   * `table-fixed` only honours a column's stated width if the table has a width
   * of its own. Left to size itself the browser falls back to measuring the
   * content first, and a column set to 130px comes out at whatever its heading
   * happens to need — every column quietly widened, and the drag handle a lie.
   * With this stated, `min-w-full` still stretches the table to fill a wide
   * screen, and the empty column at the end takes all of the slack.
   */
  const declaredWidth = useMemo(
    () => NUMBER_COLUMN_WIDTH + columns.reduce((total, column) => total + widthOf(column), 0) + FILLER_COLUMN_WIDTH,
    [columns, widthOf]
  );

  const at = useCallback(
    (rowIndex: number, columnIndex: number) => {
      const row = rows[rowIndex];
      const column = columns[columnIndex];
      if (!row || !column) return;

      setDraft(null);
      setCursor({ rowId: row.id, columnId: column.id });
    },
    [columns, rows]
  );

  /** Where the cursor is in the grid as it is currently shown. */
  const position = useMemo(() => {
    if (!cursor) return null;

    const rowIndex = rows.findIndex((row) => row.id === cursor.rowId);
    const columnIndex = columns.findIndex((column) => column.id === cursor.columnId);
    return rowIndex === -1 || columnIndex === -1 ? null : { rowIndex, columnIndex };
  }, [columns, cursor, rows]);

  /**
   * The cell whose panel is open, looked up afresh every render. The panel is
   * held open by an id rather than by the row itself, so what it shows is
   * always the stored row — a picture added to it appears under the panel
   * rather than behind a copy taken when it opened.
   */
  const openNote = useMemo(() => {
    if (!note) return null;

    const row = table.rows.find((each) => each.id === note.rowId);
    const column = columns.find((each) => each.id === note.columnId);
    return row && column ? { row, column, anchor: note.anchor } : null;
  }, [columns, note, table.rows]);

  /** The same, for the choices a cell is being picked from: looked up afresh
   *  so a choice added from inside the menu appears in it straight away. */
  const openPick = useMemo(() => {
    if (!pick) return null;

    const row = table.rows.find((each) => each.id === pick.rowId);
    const column = columns.find((each) => each.id === pick.columnId);
    return row && column ? { row, column, anchor: pick.anchor, initial: pick.initial } : null;
  }, [columns, pick, table.rows]);

  /** And for the writing behind a chip, looked up afresh for the same reason:
   *  the panel shows the stored row rather than a copy taken when it opened. */
  const openAbout = useMemo(() => {
    if (!about) return null;

    const row = table.rows.find((each) => each.id === about.rowId);
    const column = columns.find((each) => each.id === about.columnId);
    return row && column ? { row, column, anchor: about.anchor } : null;
  }, [about, columns, table.rows]);

  const openList = useMemo(() => {
    if (!list) return null;

    const column = columns.find((each) => each.id === list.columnId);
    return column ? { column, anchor: list.anchor } : null;
  }, [columns, list]);

  const move = useCallback(
    (downBy: number, acrossBy: number) => {
      if (!position) return;

      // Across the end of a row and on to the start of the next, the way Tab
      // reads a form: a table filled in left to right should not stop at the
      // right-hand edge and make you reach for the mouse.
      let rowIndex = position.rowIndex + downBy;
      let columnIndex = position.columnIndex + acrossBy;

      if (columnIndex < 0) {
        columnIndex = columns.length - 1;
        rowIndex -= 1;
      } else if (columnIndex >= columns.length) {
        columnIndex = 0;
        rowIndex += 1;
      }

      at(Math.max(0, Math.min(rows.length - 1, rowIndex)), Math.max(0, Math.min(columns.length - 1, columnIndex)));
    },
    [at, columns.length, position, rows.length]
  );

  /**
   * Opening a cell to be changed. A picture cell is a panel against the cell
   * rather than a line inside it — a screenshot and a paragraph do not fit on
   * one line of a grid — and anything typed at it is added to the end of what
   * is already there rather than replacing it, since a note is written in
   * sittings and one keystroke should not take the last one away.
   */
  const beginEdit = useCallback(
    (rowId: string, columnId: string, initial: string | undefined, rect: DOMRect | null) => {
      const row = rows.find((each) => each.id === rowId);
      const stored = row ? cellValue(row, columnId) : '';
      const column = columns.find((each) => each.id === columnId);

      setCursor({ rowId, columnId });

      // A tick box has nothing to open: the box is the whole of the cell, and
      // the thing you would want from "edit" is the tick itself.
      if (column?.type === 'check') {
        toggleTick(table.id, rowId, columnId);
        return;
      }

      if (column?.type === 'note') {
        if (initial !== undefined) setCell(table.id, rowId, columnId, `${stored}${initial}`);
        if (rect) setNote({ rowId, columnId, anchor: rect });
        return;
      }

      // A cell picked off a list is not typed into either: it opens the list. A
      // character that opened it goes into the box at the top, which finds the
      // choice it begins — so typing "d" and Enter is how "Done" gets picked
      // without the mouse. On a cell holding several the menu stays open after
      // each, and the box clears itself for the next.
      if (column && picksFromList(column.type)) {
        if (rect) setPick({ rowId, columnId, anchor: rect, initial });
        return;
      }

      setDraft(initial ?? stored);
    },
    [columns, rows, table.id]
  );

  const commit = useCallback(
    (rowId: string, columnId: string, value: string) => {
      setCell(table.id, rowId, columnId, value);
      setDraft(null);
    },
    [table.id]
  );

  /** Enter at the bottom of the table adds a row, which is how one is normally
   *  wanted: you get to the end of the list and carry on typing. */
  const enterFromLastRow = useCallback(() => {
    const id = addRow(table.id);
    if (id) setCursor((was) => (was ? { ...was, rowId: id } : was));
  }, [table.id]);

  const keysWhileSelected = useCallback(
    (event: React.KeyboardEvent, rowId: string, column: Column, active: boolean) => {
      const key = event.key;

      if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight') {
        event.preventDefault();
        move(key === 'ArrowDown' ? 1 : key === 'ArrowUp' ? -1 : 0, key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0);
        return;
      }

      if (key === 'Tab') {
        event.preventDefault();
        move(0, event.shiftKey ? -1 : 1);
        return;
      }

      // Enter opens the choices; Alt+Enter opens what is written about the
      // cell. The tag that does the same with the mouse is not its own stop on
      // the way round with Tab — the grid moves by cell — so this is the way
      // to it without the hand leaving the keyboard.
      if (key === 'Enter' && event.altKey && picksFromList(column.type)) {
        event.preventDefault();
        setAbout({ rowId, columnId: column.id, anchor: event.currentTarget.getBoundingClientRect() });
        return;
      }

      if (key === 'Enter' || key === 'F2') {
        event.preventDefault();
        beginEdit(rowId, column.id, undefined, event.currentTarget.getBoundingClientRect());
        return;
      }

      if (key === 'Backspace' || key === 'Delete') {
        event.preventDefault();
        setCell(table.id, rowId, column.id, '');
        return;
      }

      if (key === 'Escape') {
        // One thing at a time: this Escape lets go of the cell, and only the
        // next one reaches the page and leaves full screen. The cell gives up
        // the keyboard as it goes — a cell still holding focus after being let
        // go of would swallow every Escape after this one.
        if (!active) return;

        event.stopPropagation();
        (event.currentTarget as HTMLElement).blur();
        setCursor(null);
        return;
      }

      // Space turns a tick box over, as it does anywhere else a box is focused.
      if (column.type === 'check') {
        if (key === ' ') {
          event.preventDefault();
          toggleTick(table.id, rowId, column.id);
        }
        return;
      }

      // And Space opens a list, as it does on any other menu — a space typed
      // over the cell would otherwise open it looking for a choice beginning
      // with one, which is nothing.
      if (picksFromList(column.type) && key === ' ') {
        event.preventDefault();
        beginEdit(rowId, column.id, undefined, event.currentTarget.getBoundingClientRect());
        return;
      }

      // Typing straight over a cell, which is how a grid is filled in fast. A
      // date has a picker rather than characters, so it waits for Enter.
      if (column.type !== 'date' && key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        beginEdit(rowId, column.id, key, event.currentTarget.getBoundingClientRect());
      }
    },
    [beginEdit, move, table.id]
  );

  /**
   * The keys that end an edit rather than take part in one. The marks and the
   * line break are the cell's own business — a date and a number have neither,
   * and a text cell can only answer them against the surface it is written in —
   * so both are dealt with there and never reach this.
   */
  const keysWhileEditing = useCallback(
    (event: React.KeyboardEvent, read: () => string, rowId: string, columnId: string, rowIndex: number) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        // Straight back to what was stored: an Escape that kept the typing
        // would not be an undo.
        setDraft(null);
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        commit(rowId, columnId, read());
        if (rowIndex === rows.length - 1) enterFromLastRow();
        else move(1, 0);
        return;
      }

      if (event.key === 'Tab') {
        event.preventDefault();
        commit(rowId, columnId, read());
        move(0, event.shiftKey ? -1 : 1);
      }
    },
    [commit, enterFromLastRow, move, rows.length]
  );

  const handleAddRow = useCallback(() => {
    const id = addRow(table.id);
    if (id && columns[0]) setCursor({ rowId: id, columnId: columns[0].id });
  }, [columns, table.id]);

  /** A blank row put in beside another, the cursor going straight into it: the
   *  reason for putting one there is to type in it. */
  const insertRow = useCallback(
    (rowId: string, where: 'above' | 'below') => {
      const id = addRow(table.id, rowId, where);
      if (id && columns[0]) setCursor({ rowId: id, columnId: columns[0].id });
      setRowMenu(null);
    },
    [columns, table.id]
  );

  /**
   * A snip pasted onto a cell without opening it first. It is written to the
   * folder and only its name comes back — nothing about a picture is ever put
   * into storage — and if it cannot be written the reason is said out loud
   * under the table rather than swallowed.
   */
  const pasteImage = useCallback(
    async (row: Row, columnId: string, blob: Blob) => {
      if (cellImages(row, columnId).length >= MAX_CELL_IMAGES) {
        setNotice(`A cell holds ${MAX_CELL_IMAGES} pictures.`);
        return;
      }

      const result = await keepPicture(blob);
      if (!result.ok) {
        setNotice(result.error);
        return;
      }

      addCellImage(table.id, row.id, columnId, result.name);
      setNotice(null);
    },
    [table.id]
  );

  /**
   * Deleting anything that had pictures under it. The rows go first and the
   * files are swept afterwards, so a name another cell still points at — the
   * duplicate of this row, say — is seen to be wanted and left alone.
   */
  const removeRow = useCallback(
    (row: Row) => {
      const names = imageNamesIn([row]);
      deleteRow(table.id, row.id);
      if (names.length > 0) void discardTableImages(names);
    },
    [table.id]
  );

  const full = table.rows.length >= MAX_ROWS;
  const hidden = table.rows.length - rows.length;

  return (
    <div className={fill ? 'flex min-h-0 flex-1 flex-col' : ''}>
      <div
        className={`overflow-auto rounded-xl border ${LINE} bg-white/70 dark:bg-white/[0.03] ${
          fill ? 'min-h-0 flex-1' : 'max-h-[65vh]'
        }`}
      >
        <table style={{ width: declaredWidth }} className="min-w-full table-fixed border-collapse">
          {/* The headings, held at the top of the box while the rows go by
              under them — unless this table has been told not to.

              The line under them is drawn with a shadow rather than the border
              the class list asks for: `border-collapse` hands a cell's borders
              to the table to paint, and the table does not come along for the
              ride when the row is stuck, so the border goes missing at exactly
              the moment it is doing the work of separating the headings from
              the rows sliding beneath. */}
          <thead
            className={`bg-[#F5F5F7] dark:bg-[#2A2A2E] ${
              table.stickyHeader
                ? 'sticky top-0 z-20 [&>tr>th]:shadow-[inset_0_-1px_0_rgba(0,0,0,0.1)] dark:[&>tr>th]:shadow-[inset_0_-1px_0_rgba(255,255,255,0.1)]'
                : ''
            }`}
          >
            <tr>
              {/* The row numbers, which stay put as the table is scrolled across. */}
              <th
                scope="col"
                // Stated from the constant rather than beside it: the width the
                // table declares and the width this column takes have to be the
                // same number, and two of them drift.
                style={{ width: NUMBER_COLUMN_WIDTH }}
                className={`sticky left-0 z-10 border-b border-r bg-[#F5F5F7] p-0 text-center text-[10px] font-semibold uppercase tracking-wide dark:bg-[#2A2A2E] ${LINE} ${MUTED}`}
              >
                #
              </th>

              {columns.map((column, index) => (
                <HeaderCell
                  key={column.id}
                  table={table}
                  column={column}
                  index={index}
                  width={widthOf(column)}
                  onResize={(width) => setResizing(width === null ? null : { columnId: column.id, width })}
                  onFilter={() => {
                    addFilter(table.id, column.id);
                    onFilterColumn();
                  }}
                  onEditList={(anchor) => setList({ columnId: column.id, anchor })}
                />
              ))}

              {/* No width of its own, which is what makes it the one that takes
                  up the slack. Under `table-fixed` the columns that state a
                  width get it and whatever is left over goes to the ones that
                  do not — so on a wide screen this empty column stretches and a
                  column dragged to 150px stays at 150px, instead of every
                  column being quietly widened to fill the room. */}
              <th scope="col" className={`border-b p-0 ${LINE}`}>
                <button
                  type="button"
                  onClick={() => addColumn(table.id)}
                  disabled={columns.length >= MAX_COLUMNS}
                  title={
                    columns.length >= MAX_COLUMNS
                      ? `A table holds ${MAX_COLUMNS} columns`
                      : 'Add a column'
                  }
                  aria-label="Add a column"
                  className={`flex h-full w-10 items-center justify-center py-2 transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-white/10 ${MUTED}`}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={row.id} className="group">
                <td
                  // Top, not middle: a row holding a paragraph is tall, and its
                  // number belongs beside the first line of it.
                  className={`sticky left-0 z-10 border-b border-r bg-[#FAFAFA] p-0 align-top dark:bg-[#232326] ${LINE}`}
                >
                  <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                    {/* Wide enough for the last row of the longest table there
                        can be: "500" in 16px was four pixels of it hanging over
                        whatever came next. */}
                    <span className={`w-6 shrink-0 text-center text-[11px] tabular-nums ${MUTED}`}>
                      {rowIndex + 1}
                    </span>

                    {/* Only on the row under the pointer or the cursor: a bin
                        on every line at once is a page of bins. The row whose
                        menu is open is held visible too — the pointer has to
                        leave the row to reach the menu. */}
                    <span
                      // A gap between the two: hard against each other they
                      // read as one control with two halves, which is how a bin
                      // gets pressed by somebody reaching for the menu.
                      className={`flex shrink-0 gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 ${
                        cursor?.rowId === row.id || rowMenu?.rowId === row.id ? 'opacity-100' : ''
                      }`}
                    >
                      <button
                        type="button"
                        {...{ [ROW_MENU_TRIGGER]: '' }}
                        onClick={(event) => {
                          // Measured here rather than inside the update: React
                          // runs that later, by which time the event has been
                          // let go of and `currentTarget` is null.
                          const anchor = event.currentTarget.getBoundingClientRect();
                          setRowMenu((was) => (was?.rowId === row.id ? null : { rowId: row.id, anchor }));
                        }}
                        title="What can be done to this row"
                        aria-label={`Options for row ${rowIndex + 1}`}
                        aria-expanded={rowMenu?.rowId === row.id}
                        className={`rounded p-0.5 transition-colors hover:bg-black/10 dark:hover:bg-white/10 ${MUTED}`}
                      >
                        <MoreVertical className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeRow(row)}
                        title="Delete this row"
                        aria-label={`Delete row ${rowIndex + 1}`}
                        className={`rounded p-0.5 transition-colors hover:bg-[#B3261E]/10 hover:text-[#B3261E] dark:hover:text-[#FFB4AB] ${MUTED}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </span>
                  </div>
                </td>

                {columns.map((column) => {
                  const active = cursor?.rowId === row.id && cursor.columnId === column.id;

                  return (
                    <GridCell
                      key={column.id}
                      row={row}
                      column={column}
                      active={active}
                      draft={active ? draft : null}
                      panelOpen={
                        (note?.rowId === row.id && note.columnId === column.id) ||
                        (pick?.rowId === row.id && pick.columnId === column.id) ||
                        (about?.rowId === row.id && about.columnId === column.id)
                      }
                      label={`${column.name}, row ${rowIndex + 1}`}
                      onSelect={() => {
                        setDraft(null);
                        setCursor({ rowId: row.id, columnId: column.id });
                      }}
                      onPasteImage={(blob) => void pasteImage(row, column.id, blob)}
                      onViewImage={(names, at) => setViewing({ names, at })}
                      onToggleTick={() => toggleTick(table.id, row.id, column.id)}
                      onOpenNote={(anchor) => {
                        // The cursor follows: the panel is about this cell, and
                        // closing it should leave the keyboard where the writing
                        // was rather than wherever it was three rows ago.
                        setDraft(null);
                        setCursor({ rowId: row.id, columnId: column.id });
                        setAbout({ rowId: row.id, columnId: column.id, anchor });
                      }}
                      onBeginEdit={(initial, rect) => beginEdit(row.id, column.id, initial, rect)}
                      onDraft={setDraft}
                      onCommit={(next) => commit(row.id, column.id, next)}
                      onKeyDown={(event, read) =>
                        active && draft !== null
                          ? keysWhileEditing(event, read, row.id, column.id, rowIndex)
                          : keysWhileSelected(event, row.id, column, active)
                      }
                    />
                  );
                })}

                <td className={`border-b ${LINE}`} />
              </tr>
            ))}

            <tr>
              <td colSpan={columns.length + 2} className="p-0">
                <button
                  type="button"
                  onClick={handleAddRow}
                  disabled={full}
                  className={`flex w-full items-center gap-1.5 px-2 py-2 text-xs transition-colors hover:bg-black/[0.04] disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/[0.06] ${MUTED}`}
                >
                  <Plus className="h-3.5 w-3.5 shrink-0" />
                  {full ? `A table holds ${MAX_ROWS} rows` : 'New row'}
                </button>
              </td>
            </tr>
          </tbody>
        </table>

        {rows.length === 0 && (
          <p className={`px-3 py-6 text-center text-sm ${MUTED}`}>
            {table.rows.length === 0
              ? 'No rows yet. Add one above and start typing.'
              : 'Every row is hidden by the filter.'}
          </p>
        )}
      </div>

      {/* The cell being written in, opened against itself. Rendered out here
          rather than inside the row: a panel inside the scrolling box would be
          cut off by its edge on every cell near the bottom. */}
      {openNote && (
        <NoteEditor
          table={table}
          row={openNote.row}
          column={openNote.column}
          anchor={openNote.anchor}
          onView={(names, at) => setViewing({ names, at })}
          onClose={() => setNote(null)}
        />
      )}

      {/* The choices a cell is picked from, and the list they come off — both
          out here for the same reason the note panel is: inside the scrolling
          box they would be cut off by its edge on every cell near the bottom. */}
      {openPick && (
        <OptionPicker
          table={table}
          row={openPick.row}
          column={openPick.column}
          anchor={openPick.anchor}
          initial={openPick.initial}
          onClose={() => setPick(null)}
        />
      )}

      {/* The page behind a chip, out here for the same reason: a panel inside
          the scrolling box is cut off by its edge on every row near the
          bottom. It leaves the cell alone — the chip is still the one word the
          column sorts and filters by. */}
      {openAbout && (
        <CellNotePanel
          table={table}
          row={openAbout.row}
          column={openAbout.column}
          anchor={openAbout.anchor}
          onClose={() => setAbout(null)}
        />
      )}

      {rowMenu && (
        <RowMenu
          anchor={rowMenu.anchor}
          full={full}
          number={rows.findIndex((row) => row.id === rowMenu.rowId) + 1}
          onInsert={(where) => insertRow(rowMenu.rowId, where)}
          onDuplicate={() => {
            duplicateRow(table.id, rowMenu.rowId);
            setRowMenu(null);
          }}
          onClose={() => setRowMenu(null)}
        />
      )}

      {openList && (
        <OptionListPanel
          table={table}
          column={openList.column}
          anchor={openList.anchor}
          onClose={() => setList(null)}
        />
      )}

      {/* Over everything, including the page's own full screen. Keyed by the
          picture it was opened on, so opening a second one starts it afresh
          rather than leaving it where the last one was left. */}
      {viewing && (
        <PictureViewer
          key={viewing.names[viewing.at]}
          names={viewing.names}
          start={viewing.at}
          onClose={() => setViewing(null)}
        />
      )}

      {notice && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-[#B3261E] dark:text-[#FFB4AB]">
          <span className="flex-1">{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="shrink-0 underline">
            Dismiss
          </button>
        </p>
      )}

      <p className={`mt-2 text-xs ${MUTED}`}>
        Click a cell and type. <strong className="font-medium">Enter</strong> goes down and adds a row at the
        bottom, <strong className="font-medium">Alt+Enter</strong> (or Shift+Enter) breaks the line inside the
        cell, <strong className="font-medium">Tab</strong> goes across, arrows move,{' '}
        <strong className="font-medium">Esc</strong> puts back what was there. Drag the line between two
        headings to resize a column. A <strong className="font-medium">Pick from a list</strong> column opens
        its choices instead — type to find one, or type a new one and press Enter to add it to the list, and
        the column sorts in the order the list is in. A{' '}
        <strong className="font-medium">Pick several from a list</strong> column is the same list with the
        menu left open: click a choice to put it on the cell or take it off, up to {MAX_CELL_TAGS} of them,
        and Esc when you are done. The tags are kept in the cell itself, separated by commas, so a column
        already filled in that way becomes chips the moment it is retyped — and filters ask whether a cell{' '}
        <em>has</em> one tag rather than which one it is. Every cell in either carries an{' '}
        <strong className="font-medium">ⓘ</strong> beside its chips: it opens a page you can write about that
        cell on, as long as a post and with the same formatting, and the chips themselves are untouched so
        the column still sorts and filters by what was picked. It is marked pink once something is written
        there, and <strong className="font-medium">Alt+Enter</strong> on the cell opens it. A{' '}
        <strong className="font-medium">Text &amp; pictures</strong> column opens a panel instead, and takes a
        snip pasted straight onto the cell; click a picture in one to read
        it over the whole page, where it can be shown at full size. Text cells take formatting:{' '}
        <strong className="font-medium">Ctrl+B</strong> for bold, <strong className="font-medium">Ctrl+I</strong>{' '}
        for italic, <strong className="font-medium">Ctrl+Alt+1</strong> for a title, or the buttons under the
        cell — which write <code className="font-mono">**bold**</code> and{' '}
        <code className="font-mono"># Title</code> into the cell itself, so nothing is lost by retyping the
        column. A row goes in beside another one from the{' '}
        <strong className="font-medium">⋮</strong> beside its number, and a column from the{' '}
        <strong className="font-medium">⋮</strong> in its heading.
        {table.sort &&
          ' While a sort is on, the rows are only shown in that order — a row inserted above or below another goes in beside it in the stored order, and may appear elsewhere on the screen.'}
        {hidden > 0 && ` A filter is hiding ${hidden} row${hidden === 1 ? '' : 's'}, and a new row starts empty, so it may be hidden the moment it is added.`}
      </p>
    </div>
  );
}
