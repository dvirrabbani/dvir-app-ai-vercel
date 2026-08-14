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

import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUp,
  ArrowUpToLine,
  ChevronLeft,
  ChevronRight,
  Copy,
  CornerUpLeft,
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
  CellContents,
  CellWrite,
  Column,
  ColumnType,
  MAX_CELL_IMAGES,
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
  cellContents,
  cellImages,
  cellValue,
  cycleSort,
  isTicked,
  toggleTick,
  deleteColumn,
  deleteRow,
  duplicateRow,
  getTable,
  imageNamesIn,
  moveColumn,
  moveColumnTo,
  picksFromList,
  reorderColumn,
  setCell,
  setCellsContents,
  updateColumn,
  visibleRows,
} from '@/lib/documents';
import { discardTableImages } from '@/lib/image-folder';
import { shortcutCommand } from '@/lib/rich-text';
import { Floating } from '@/components/document/floating';
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

/**
 * The rectangle of cells that is selected, as places in the grid **as it is
 * currently shown** rather than as ids.
 *
 * Ids are right for the cursor, which has to follow its row under a sort; a
 * block is the opposite. It is the shape on the screen — the six cells under
 * the pointer — and a sort that moves one of its rows away has not moved the
 * selection with it. Held as its two corners, worked out afresh every render
 * from the cursor and the corner it was drawn from.
 */
interface Block {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

/** How many cells a block covers. */
function blockSize(block: Block): number {
  return (block.bottom - block.top + 1) * (block.right - block.left + 1);
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

/**
 * Whether a keystroke is a given letter, asked of the key's **place** on the
 * board as well as of what it prints.
 *
 * `code` is the one that holds up: Alt+C types "ç" on a Mac and a Hebrew letter
 * on a Hebrew layout, and the key under the finger is the C key in all three
 * cases. What it prints is taken as well, because `code` is empty in a few
 * places a key event can come from — a browser being driven by a test, an
 * on-screen keyboard — and a shortcut that quietly does nothing there is worse
 * than one that answers a second name.
 */
function letterPressed(event: React.KeyboardEvent, code: string, letter: string): boolean {
  return event.code === code || event.key.toLowerCase() === letter;
}

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

/** On every column heading, so a drag can find them and the gaps between them. */
const COLUMN_MARK = 'data-column';

/** "the 3rd column", for the places a column can be moved to. English only, as
 *  the rest of this surface's own words are. */
function ordinal(place: number) {
  const teen = place % 100;
  if (teen >= 11 && teen <= 13) return `${place}th`;

  const last = place % 10;
  return `${place}${last === 1 ? 'st' : last === 2 ? 'nd' : last === 3 ? 'rd' : 'th'}`;
}

/** How far the pointer has to travel before pressing the ⋮ becomes dragging the
 *  column. Under this it is a press, and the menu opens as it always did. */
const COLUMN_DRAG_THRESHOLD = 5;

/** Within this of either end of the scroll box, a drag scrolls the table along
 *  with it, at this many pixels a frame — otherwise a column can only be moved
 *  as far as the window happens to show. */
const COLUMN_DRAG_EDGE = 56;
const COLUMN_DRAG_SPEED = 14;

/** `w-48` measured, since the menu is placed by hand rather than by `absolute`. */
const HEADER_MENU_WIDTH = 192;

/** Between the menu and the button it belongs to, and between it and the edge
 *  of the window. */
const HEADER_MENU_GAP = 4;
const HEADER_MENU_EDGE = 8;

function HeaderMenu({
  table,
  column,
  index,
  onFilter,
  onEditList,
  onGrab,
}: {
  table: TableDoc;
  column: Column;
  index: number;
  onFilter: () => void;
  /** Opens the column's list of choices, against the menu it was asked from. */
  onEditList: (anchor: DOMRect) => void;
  /**
   * The pointer gone down on the ⋮, which is the column's grab handle as much as
   * its menu. `moved` is called back if the gesture turns out to be a drag, so
   * the click that follows opens nothing.
   */
  onGrab: (event: React.PointerEvent<HTMLButtonElement>, moved: () => void) => void;
}) {
  // Where the button was when it was pressed. The menu is `position: fixed`
  // against it — the same rule the row menu, the note panel and the list of
  // choices follow — because this one is taller than the scroll box it is drawn
  // inside, and an `absolute` menu is simply cut off by that box's edge:
  // everything from the filter down was unreachable on a short window. Holding
  // the rect rather than a boolean is what says the menu is open.
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const open = anchor !== null;
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  // The menu is rendered through `Floating`, into the body, so it is no longer
  // inside `box` in the DOM and a click in it is no longer `contains`ed by the
  // wrapper. It needs a ref of its own for the click-away to tell it apart from
  // the page behind.
  const menu = useRef<HTMLDivElement>(null);

  /** Whether the gesture that is ending was a drag rather than a press. A
   *  pointer let go after a drag still fires a click on this button, and a menu
   *  opening at the end of every move would be one to close every time. */
  const dragged = useRef(false);

  /** The menu showing the places this column could go instead of its own
   *  contents. One panel rather than a menu flying out beside a menu: this one
   *  is already placed by hand against a button and capped at the room below
   *  it, and a second one hanging off its side would have to be placed against
   *  *that*, on the side the window happens to have room on. */
  const [placing, setPlacing] = useState(false);

  const close = useCallback(() => {
    setAnchor(null);
    setPlacing(false);
  }, []);

  const toggle = () => {
    setPlacing(false);
    setAnchor(open ? null : (trigger.current?.getBoundingClientRect() ?? null));
  };

  useEffect(() => {
    if (!open) return;

    const away = (event: MouseEvent) => {
      // Two boxes rather than one: the wrapper, which is how the trigger counts
      // as its own toggle rather than as a click away, and the menu itself,
      // which lives in the body now and is inside neither.
      const target = event.target as Node;
      if (box.current?.contains(target) || menu.current?.contains(target)) return;
      close();
    };

    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [close, open]);

  const full = table.columns.length >= MAX_COLUMNS;

  const item =
    'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/10';

  // Below the button by preference, above it when there is genuinely more room
  // that way, and capped either way at the room there actually is — so the menu
  // scrolls inside itself rather than running off the bottom of the window.
  // `overscroll-contain` stops the table underneath taking over the wheel once
  // the menu has reached its end.
  const roomBelow = anchor ? window.innerHeight - anchor.bottom - HEADER_MENU_GAP - HEADER_MENU_EDGE : 0;
  const roomAbove = anchor ? anchor.top - HEADER_MENU_GAP - HEADER_MENU_EDGE : 0;
  const upwards = roomBelow < roomAbove;

  const place: CSSProperties | undefined = anchor
    ? {
        left: Math.max(
          HEADER_MENU_EDGE,
          Math.min(anchor.right - HEADER_MENU_WIDTH, window.innerWidth - HEADER_MENU_WIDTH - HEADER_MENU_EDGE),
        ),
        width: HEADER_MENU_WIDTH,
        maxHeight: Math.max(upwards ? roomAbove : roomBelow, 0),
        ...(upwards
          ? { bottom: window.innerHeight - anchor.top + HEADER_MENU_GAP }
          : { top: anchor.bottom + HEADER_MENU_GAP }),
      }
    : undefined;

  return (
    <div ref={box} className="relative shrink-0">
      <button
        ref={trigger}
        type="button"
        onPointerDown={(event) => {
          dragged.current = false;
          onGrab(event, () => {
            dragged.current = true;
            close();
          });
        }}
        onClick={() => {
          if (!dragged.current) toggle();
        }}
        title={`Options for ${column.name} — or drag to move the column`}
        aria-label={`Options for ${column.name}`}
        aria-expanded={open}
        // `touch-none`, or a finger going down here would scroll the table
        // instead of picking the column up. A tap still presses the button.
        className={`cursor-grab touch-none rounded p-0.5 transition-colors hover:bg-black/10 active:cursor-grabbing dark:hover:bg-white/10 ${MUTED}`}
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </button>

      {open && (
        <Floating>
          <div
            ref={menu}
            style={place}
            className={`fixed z-50 overflow-y-auto overscroll-contain rounded-xl border bg-white p-1 shadow-lg dark:bg-[#26262A] ${LINE}`}
          >
            {/* The places this column could take, which is the drag done from a
                list: the numbers are where it would end up, and the name beside
                each is whatever is standing there now. Picking one is the same
                move — everything between shuffles along — so the column already
                at that place is not displaced, only pushed along by one. */}
            {placing ? (
              <>
                <button
                  type="button"
                  onClick={() => setPlacing(false)}
                  className={`${item} ${MUTED}`}
                >
                  <CornerUpLeft className="h-3.5 w-3.5 shrink-0" />
                  Back
                </button>

                <p className={`px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide ${MUTED}`}>
                  Move {column.name} to
                </p>

                {table.columns.map((other, place) => {
                  const here = place === index;

                  return (
                    <button
                      key={other.id}
                      type="button"
                      disabled={here}
                      onClick={() => {
                        moveColumnTo(table.id, column.id, place);
                        close();
                      }}
                      title={here ? `${column.name} is already the ${ordinal(place + 1)} column` : `Make ${column.name} the ${ordinal(place + 1)} column`}
                      className={`${item} ${here ? MUTED : SOLID}`}
                    >
                      <span className="w-4 shrink-0 text-right tabular-nums">{place + 1}</span>
                      <span className="truncate" dir="auto">
                        {other.name}
                      </span>
                      {here && <span className="ml-auto shrink-0 text-[10px]">this one</span>}
                    </button>
                  );
                })}
              </>
            ) : (
              <>
                <p className={`px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide ${MUTED}`}>
                  Holds
                </p>
                {COLUMN_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      updateColumn(table.id, column.id, { type });
                      close();

                      // A column that has just been told it holds choices off a
                      // list, and has no list, is a column of nothing you can
                      // pick — so the list opens rather than leaving somebody to
                      // find it.
                      if (picksFromList(type) && column.options.length === 0) {
                        const at = box.current?.getBoundingClientRect();
                        if (at) onEditList(at);
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
                      const at = box.current?.getBoundingClientRect();
                      close();
                      if (at) onEditList(at);
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
                    close();
                  }}
                  className={`${item} ${SOLID}`}
                >
                  <FilterIcon className="h-3.5 w-3.5 shrink-0" />
                  Filter by this column
                </button>

                {/* A new column beside this one rather than at the far end. The +
                    in the corner still adds at the end, which is where a column
                    is usually wanted; this is for the one that belongs next to
                    something. */}
                <button
                  type="button"
                  disabled={full}
                  onClick={() => {
                    addColumn(table.id, { at: index });
                    close();
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
                    close();
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
                    close();
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
                    close();
                  }}
                  className={`${item} ${SOLID}`}
                >
                  <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                  Move right
                </button>

                {/* Somewhere in particular, rather than one place at a time: on a
                    table of a dozen columns, moving the last one to the front is
                    eleven presses of Move left. */}
                <button
                  type="button"
                  disabled={table.columns.length < 2}
                  onClick={() => setPlacing(true)}
                  title={`Move ${column.name} to a place you pick`}
                  className={`${item} ${SOLID}`}
                >
                  <ArrowLeftRight className="h-3.5 w-3.5 shrink-0" />
                  Move to…
                </button>

                <div className={`my-1 border-t ${LINE}`} />

                <button
                  type="button"
                  disabled={table.columns.length <= 1}
                  onClick={() => {
                    // What was under this column, gathered before it goes:
                    // afterwards there is nothing left to say which files it was
                    // holding.
                    const names = imageNamesIn(table.rows, column.id);
                    deleteColumn(table.id, column.id);
                    if (names.length > 0) void discardTableImages(names);
                    close();
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
              </>
            )}
          </div>
        </Floating>
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
  marker,
  lifted,
  onResize,
  onFilter,
  onEditList,
  onGrab,
}: {
  table: TableDoc;
  column: Column;
  index: number;
  /** What to draw at — the live width while this one is being dragged. */
  width: number;
  /** Which edge of this heading the column being dragged would land against,
   *  drawn as a line: only ever one heading in the table has one. */
  marker: 'left' | 'right' | null;
  /** This is the column being dragged, and is drawn as having been picked up. */
  lifted: boolean;
  /** A width to show and not yet store, or null when the pointer lifts. */
  onResize: (width: number | null) => void;
  onFilter: () => void;
  onEditList: (anchor: DOMRect) => void;
  onGrab: (event: React.PointerEvent<HTMLButtonElement>, moved: () => void) => void;
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
      // The mark is what a column drag measures the gaps between the headings
      // off — the headings themselves rather than the stored widths, which are
      // only what each column asked for.
      {...{ [COLUMN_MARK]: column.id }}
      style={{ width }}
      className={`relative border-b border-r p-0 text-left align-middle ${LINE} ${
        lifted ? 'opacity-40' : ''
      }`}
    >
      {/* Where the column would land if it were put down now. Drawn on the
          heading either side of the gap rather than over the table, so it needs
          nothing measured and cannot drift from the columns it sits between. */}
      {marker && (
        <span
          aria-hidden
          className={`pointer-events-none absolute top-0 z-20 h-full w-0.5 bg-[#FF4D8E] ${
            marker === 'left' ? 'left-0' : 'right-0'
          }`}
        />
      )}

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
          onGrab={onGrab}
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
  selected,
  draft,
  panelOpen,
  onSelect,
  onDragFrom,
  onDragTo,
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
  /** In the selected block, but not the cell the cursor is on. */
  selected: boolean;
  /** Non-null while this cell is the one being typed into. */
  draft: string | null;
  /** Whether this cell's own panel — the note editor, the list of choices —
   *  is open over the page, which is where the keyboard is while it is. */
  panelOpen: boolean;
  /** `extend` is Shift held: the block reaches here rather than starting here. */
  onSelect: (extend: boolean) => void;
  /** The button gone down on this cell — where a block would be drawn from. */
  onDragFrom: () => void;
  /** The pointer arrived here with the button still down. */
  onDragTo: () => void;
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
        onClick={(event) => onSelect(event.shiftKey)}
        // Where a drag would be drawn from, and where one already going passes
        // through. Neither touches the words under the pointer: a drag that
        // stays inside this cell is somebody selecting a sentence, and only the
        // pointer *leaving* for another cell makes it a block — which is a
        // decision the grid makes, not this.
        onMouseDown={onDragFrom}
        onMouseEnter={(event) => {
          if (event.buttons === 1) onDragTo();
        }}
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
            : selected
              ? // The rest of the block is tinted and the cursor's cell is not,
                // which is the opposite way round from what it sounds: the
                // cursor has the ring, and a cell that is both ringed and
                // tinted is the one it is hardest to find in a filled block.
                'bg-[#FF4D8E]/[0.14]'
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
    <Floating>
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
    </Floating>
  );
}

/* -------------------------------------------------------------------------- */
/*  A cell copied onto another                                                */
/* -------------------------------------------------------------------------- */

/**
 * A rectangle of cells taken up together — one cell, or a hundred.
 *
 * One shape for both, rather than a cell and a block being two things that
 * behave nearly alike: a single cell is a rectangle one row tall and one column
 * wide, and everything from here down is written once.
 */
interface Copied {
  /** The type of each column of the block, left to right. The whole of the
   *  rule about where a copy may land is in this list. */
  columns: ColumnType[];
  /** The cells themselves — a row of them per row of the block. */
  cells: CellContents[][];
}

/**
 * The cells last copied with Ctrl+C, waiting to be put down with Ctrl+V.
 *
 * A module variable rather than state, and rather than storage. Not state
 * because this grid is mounted afresh on the way into full screen and on the
 * way out — the same workspace drawn in a different tree — and a copy taken on
 * the page should still be there inside it. Not storage because cells on their
 * way from one part of a table to another are not part of any table: they are
 * where the hand is, and they belong to this tab and this visit, exactly as the
 * Drive token does. Nothing renders from it, so nothing needs telling when it
 * changes.
 *
 * The types are held beside the cells because that is the whole of the rule: a
 * copy goes into columns of its own kinds or it goes nowhere. A `Text &
 * pictures` cell put into a plain `Text` column would leave its screenshots
 * behind with nothing on the screen to say so, and a paragraph put into a
 * `Number` column would be a cell nothing could sort. For a block that is asked
 * column by column, in order: the shapes have to line up, not just the cells.
 */
let copied: Copied | null = null;

/**
 * A cell on its way to the *system* clipboard, where it is one field of a
 * table rather than a string on its own.
 *
 * Tabs between the cells of a row and newlines between the rows is what every
 * spreadsheet reads, so a block copied here can be pasted straight into one —
 * but a text cell holds lines of its own, and a cell holding a newline would
 * arrive there as two rows. Quoting it, and doubling any quotes inside it, is
 * the same convention those spreadsheets write back out, so this is the rule
 * they already know how to undo.
 */
function quoteForClipboard(value: string): string {
  return /["\t\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * The whole block as the clipboard should have it. A single cell goes out as
 * the bare string it is — untouched, quotes and tabs and all — because a cell
 * copied into a text editor is a string somebody wants back exactly, and there
 * is no table around it for the quoting to be undone by.
 */
function asClipboardText(copy: Copied): string {
  const only = copy.cells.length === 1 && copy.columns.length === 1;
  if (only) return copy.cells[0][0].value;

  return copy.cells
    .map((line) => line.map((cell) => quoteForClipboard(cell.value)).join('\t'))
    .join('\n');
}

/** `3 rows`, `1 column`. */
function count(many: number, one: string): string {
  return `${many} ${one}${many === 1 ? '' : 's'}`;
}

/**
 * What a copy is said to be once it has been taken, since nothing else on the
 * screen changes when cells are copied — and the sentence carries the other
 * half of the keystroke, which is where anybody who has just found Ctrl+C
 * needs it.
 *
 * One cell says what came *with* it: its pictures and its writing are invisible
 * on the way across, and a person who does not know they were carried is a
 * person who will not know they were overwritten. A block says how big it is,
 * which is the thing you check before putting it down, and then says the same
 * about the pictures and the writing in one breath rather than per cell.
 */
function describeCopy(copy: Copied): string {
  const down = copy.cells.length;
  const across = copy.columns.length;

  if (down === 1 && across === 1) {
    const only = copy.cells[0][0];
    const pictures = only.images.length;
    const extras = [
      pictures === 0 ? '' : pictures === 1 ? 'its picture' : `its ${pictures} pictures`,
      only.note.trim() ? 'what is written about it' : '',
    ].filter(Boolean);

    const what =
      extras.length === 0
        ? 'this cell'
        : extras.length === 1
          ? `this cell and ${extras[0]}`
          : `this cell, ${extras[0]} and ${extras[1]}`;

    return `Copied ${what}. Ctrl+V puts it on another ${COLUMN_TYPE_LABELS[copy.columns[0]]} cell.`;
  }

  const flat = copy.cells.flat();
  const carried = [
    flat.some((cell) => cell.images.length > 0) ? 'the pictures' : '',
    flat.some((cell) => cell.note.trim() !== '') ? 'the writing' : '',
  ].filter(Boolean);

  // Whichever of the two is there leads the sentence, so the capital goes on
  // afterwards rather than being written into either.
  const said = carried.join(' and ');
  const also =
    carried.length === 0
      ? ''
      : ` ${said[0].toUpperCase()}${said.slice(1)} come${carried.length === 1 ? 's' : ''} with them.`;

  return (
    `Copied ${count(down * across, 'cell')} — ${count(down, 'row')} by ${count(across, 'column')}.` +
    ` Ctrl+V puts them down from the cell the cursor is on, across and down.${also}`
  );
}

/** A line under the table: something refused, or something done. Refusals are
 *  red; a copy taken is not a warning and should not be dressed as one. */
interface Notice {
  text: string;
  wrong?: boolean;
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
  /**
   * The far corner of the selection, when more than one cell is selected.
   *
   * The cursor is always the near one, so the two together are the block, and
   * `null` means the selection is the single cell the cursor is on. Keeping it
   * beside the cursor rather than replacing it is what lets everything else in
   * this file go on asking where the cursor is: typing, opening a panel and
   * moving all still happen at one cell, whatever is selected around it.
   */
  const [corner, setCorner] = useState<Cursor | null>(null);
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
  const [notice, setNotice] = useState<Notice | null>(null);
  const [resizing, setResizing] = useState<{ columnId: string; width: number } | null>(null);
  /** The column being dragged, and the gap it would be put down in. */
  const [moving, setMoving] = useState<{ columnId: string; to: number } | null>(null);

  /** The box the table scrolls inside, so a drag near either end can bring the
   *  rest of the columns into view rather than stopping at the edge. */
  const scrollBox = useRef<HTMLDivElement>(null);
  const headRow = useRef<HTMLTableRowElement>(null);

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

  /**
   * A column picked up by its ⋮ and put down in another gap.
   *
   * The gesture shares that button on purpose. A heading 90px across has room
   * for the sort arrow, the name and one control more; a handle of its own would
   * be a fourth thing, and the name is what a heading is for. So the pointer
   * going down here starts nothing at all — only once it has travelled
   * `COLUMN_DRAG_THRESHOLD` does the press become a drag, and a press that never
   * moves opens the menu exactly as it always did. The menu keeps Move left and
   * Move right, which is the same thing done from the keyboard.
   *
   * Where the column would land is measured off the headings **on the screen**
   * rather than off the stored widths: the last column is stretched by the
   * filler beside it, and a table scrolled halfway across has nothing to do with
   * either. It is a gap between two headings, so the same landing is described
   * whether the column is travelling left or right.
   */
  const startColumnDrag = useCallback(
    (columnId: string, event: React.PointerEvent<HTMLButtonElement>, moved: () => void) => {
      if (event.button !== 0 || table.columns.length < 2) return;

      // Read now: a synthetic event's `currentTarget` is null by the time any of
      // these listeners run.
      const grip = event.currentTarget;
      const startX = event.clientX;

      let dragging = false;
      let landing: number | null = null;
      let pointerX = startX;
      let frame = 0;

      /** Which gap the pointer is nearest: 0 in front of the first column. */
      const gapNearest = () => {
        const heads = headRow.current?.querySelectorAll<HTMLElement>(`[${COLUMN_MARK}]`);
        if (!heads || heads.length === 0) return null;

        for (let i = 0; i < heads.length; i += 1) {
          const rect = heads[i].getBoundingClientRect();
          if (pointerX < rect.left + rect.width / 2) return i;
        }
        return heads.length;
      };

      const settle = () => {
        const to = gapNearest();
        if (to === null) return;
        landing = to;
        setMoving({ columnId, to });
      };

      /* Held near either end of the box, the table scrolls under the drag —
         otherwise a column can only be moved as far as the window happens to
         show, which on a table of a dozen columns is not far. It stops asking
         for frames once the box has nothing left to scroll. */
      const creep = () => {
        frame = 0;
        const box = scrollBox.current;
        if (!box) return;

        const rect = box.getBoundingClientRect();
        const step =
          pointerX < rect.left + COLUMN_DRAG_EDGE
            ? -COLUMN_DRAG_SPEED
            : pointerX > rect.right - COLUMN_DRAG_EDGE
              ? COLUMN_DRAG_SPEED
              : 0;
        if (step === 0) return;

        const was = box.scrollLeft;
        box.scrollLeft += step;
        settle();
        if (box.scrollLeft !== was) frame = requestAnimationFrame(creep);
      };

      function finish(put: boolean) {
        grip.removeEventListener('pointermove', onMove);
        grip.removeEventListener('pointerup', onUp);
        grip.removeEventListener('pointercancel', onCancel);
        window.removeEventListener('keydown', onKey, true);
        if (frame) cancelAnimationFrame(frame);
        document.body.style.cursor = '';
        setMoving(null);
        if (put && landing !== null) reorderColumn(table.id, columnId, landing);
      }

      const onMove = (moveEvent: PointerEvent) => {
        pointerX = moveEvent.clientX;

        if (!dragging) {
          if (Math.abs(pointerX - startX) < COLUMN_DRAG_THRESHOLD) return;
          dragging = true;
          moved();
          // The pointer is captured by a small button, so nothing else on the
          // page would say a column is in hand.
          document.body.style.cursor = 'grabbing';
          // Whatever was highlighted before is not what this gesture is about.
          window.getSelection()?.removeAllRanges();
        }

        settle();
        if (!frame) frame = requestAnimationFrame(creep);
      };

      const onUp = () => finish(dragging);
      const onCancel = () => finish(false);

      // In the capture phase, so an Escape mid-drag puts the column back rather
      // than unwinding the cell the cursor happens to be sitting on.
      const onKey = (keyEvent: KeyboardEvent) => {
        if (keyEvent.key !== 'Escape' || !dragging) return;
        keyEvent.preventDefault();
        keyEvent.stopPropagation();
        finish(false);
      };

      grip.setPointerCapture(event.pointerId);
      grip.addEventListener('pointermove', onMove);
      grip.addEventListener('pointerup', onUp);
      grip.addEventListener('pointercancel', onCancel);
      window.addEventListener('keydown', onKey, true);
    },
    [table.columns.length, table.id]
  );

  /**
   * The cursor put on a cell. `extend` keeps the far corner where it is —
   * drawing a block out from wherever the cursor already was — and anything
   * else drops it, so the next block starts here.
   */
  const at = useCallback(
    (rowIndex: number, columnIndex: number, extend?: boolean) => {
      const row = rows[rowIndex];
      const column = columns[columnIndex];
      if (!row || !column) return;

      setDraft(null);
      setCorner((was) => (extend ? (was ?? cursor) : null));
      setCursor({ rowId: row.id, columnId: column.id });
    },
    [columns, cursor, rows]
  );

  /** Where the cursor is in the grid as it is currently shown. */
  const position = useMemo(() => {
    if (!cursor) return null;

    const rowIndex = rows.findIndex((row) => row.id === cursor.rowId);
    const columnIndex = columns.findIndex((column) => column.id === cursor.columnId);
    return rowIndex === -1 || columnIndex === -1 ? null : { rowIndex, columnIndex };
  }, [columns, cursor, rows]);

  /**
   * What is selected: the rectangle between the cursor and the far corner, or
   * the one cell the cursor is on when there is no corner.
   *
   * A corner whose row has been filtered away, or whose column has been
   * deleted, is no corner at all — the block falls back to the single cell
   * rather than to a rectangle reaching somewhere that is no longer on screen.
   */
  const block = useMemo<Block | null>(() => {
    if (!position) return null;

    const far = corner
      ? {
          rowIndex: rows.findIndex((row) => row.id === corner.rowId),
          columnIndex: columns.findIndex((column) => column.id === corner.columnId),
        }
      : null;
    const other = far && far.rowIndex !== -1 && far.columnIndex !== -1 ? far : position;

    return {
      top: Math.min(position.rowIndex, other.rowIndex),
      bottom: Math.max(position.rowIndex, other.rowIndex),
      left: Math.min(position.columnIndex, other.columnIndex),
      right: Math.max(position.columnIndex, other.columnIndex),
    };
  }, [columns, corner, position, rows]);

  /**
   * The cell a drag started on, held without touching state.
   *
   * A block is drawn by dragging across the cells, which is how anybody who has
   * met a spreadsheet expects to select several — but a drag that stays inside
   * one cell is somebody selecting *words*, and those are theirs: Ctrl+C on a
   * selection copies the selection, deliberately. So the drag only becomes a
   * block once the pointer has left the cell it went down on, and until then
   * nothing here has happened at all. That is also why this is a ref: setting
   * the cursor on `mousedown` would move focus mid-gesture and take the
   * half-made text selection with it.
   */
  const dragFrom = useRef<Cursor | null>(null);

  useEffect(() => {
    const stop = () => {
      dragFrom.current = null;
    };

    // On the window rather than on the cells: a drag very often ends with the
    // button let go outside the table, and a drag that never ends would make
    // the next pointer move across the grid draw a block out of nowhere.
    window.addEventListener('mouseup', stop);
    return () => window.removeEventListener('mouseup', stop);
  }, []);

  /** The pointer arriving on a cell with the button still down: the block
   *  follows it. */
  const dragTo = useCallback((rowId: string, columnId: string) => {
    const from = dragFrom.current;
    if (!from) return;
    if (from.rowId === rowId && from.columnId === columnId) return;

    // The words picked up on the way across are not what was meant — the
    // pointer has left the cell it went down on, so this is a block being drawn
    // rather than a sentence being selected, and leaving the highlight behind
    // would have Ctrl+C copy that instead.
    window.getSelection()?.removeAllRanges();

    setDraft(null);
    setCorner(from);
    setCursor({ rowId, columnId });
  }, []);

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
    (downBy: number, acrossBy: number, extend?: boolean) => {
      if (!position) return;

      let rowIndex = position.rowIndex + downBy;
      let columnIndex = position.columnIndex + acrossBy;

      // Across the end of a row and on to the start of the next, the way Tab
      // reads a form: a table filled in left to right should not stop at the
      // right-hand edge and make you reach for the mouse.
      //
      // Not while a block is being drawn out. A rectangle cannot wrap — there
      // is no such shape — so Shift+Right against the last column means "as far
      // as it goes" and stops there.
      if (!extend) {
        if (columnIndex < 0) {
          columnIndex = columns.length - 1;
          rowIndex -= 1;
        } else if (columnIndex >= columns.length) {
          columnIndex = 0;
          rowIndex += 1;
        }
      }

      at(
        Math.max(0, Math.min(rows.length - 1, rowIndex)),
        Math.max(0, Math.min(columns.length - 1, columnIndex)),
        extend
      );
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

      // Writing happens at one cell, so a block being written into is a block
      // no longer selected: the highlight would go on saying six cells were
      // about to be acted on while the keyboard was in one of them.
      setCorner(null);
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

  /**
   * Everything the selected block holds, taken up together: what each cell
   * says, the pictures under it and the page written about it. Only a copy of
   * the strings — the pictures are the file names, so nothing is written to the
   * folder until they are put down, and not even then.
   */
  const copyBlock = useCallback(
    (only?: Cursor) => {
      // Read afresh rather than from the rows this render was given: the button
      // in the note panel commits what has just been typed and asks for the
      // copy in the same breath, and the props here are one render behind that
      // write.
      const stored = getTable(table.id);
      if (!stored) return;

      // One named cell — the button in the note panel — or whatever is
      // selected. Both come out as a rectangle; the one cell is simply a
      // rectangle of one.
      const corners: Block | null = only
        ? (() => {
            const rowIndex = rows.findIndex((row) => row.id === only.rowId);
            const columnIndex = columns.findIndex((column) => column.id === only.columnId);
            return rowIndex === -1 || columnIndex === -1
              ? null
              : { top: rowIndex, bottom: rowIndex, left: columnIndex, right: columnIndex };
          })()
        : block;
      if (!corners) return;

      const within = columns.slice(corners.left, corners.right + 1);
      const cells: CellContents[][] = [];

      for (let down = corners.top; down <= corners.bottom; down += 1) {
        const shown = rows[down];
        const row = shown && stored.rows.find((each) => each.id === shown.id);
        if (!row) return;

        cells.push(within.map((column) => cellContents(row, column.id)));
      }

      const copy: Copied = { columns: within.map((column) => column.type), cells };
      copied = copy;

      // The words go to the system clipboard as well, so what is copied with
      // Ctrl+C can be put into anything else on the machine — a keystroke that
      // left the clipboard untouched would be a keystroke that had half
      // happened. The stored strings, markers and all, since that is what
      // another cell would want back. A refusal — an unfocused document, a
      // browser that will not — is not worth a word: the copy that matters is
      // the one above it, and it has already been taken.
      void navigator.clipboard?.writeText(asClipboardText(copy)).catch(() => {});

      setNotice({ text: describeCopy(copy) });
    },
    [block, columns, rows, table.id]
  );

  /**
   * The copy put down from the cursor, across and down, replacing what it
   * lands on.
   *
   * Only into columns of the same kinds, asked column by column. That is not
   * fussiness: a cell of screenshots dropped into a plain text column would
   * leave the pictures behind with nothing on the screen to say where they
   * went, and a paragraph dropped into a number column would be a cell the
   * column could not sort. It is all or nothing — half a block put down, the
   * columns that matched and not the ones that did not, is a table nobody could
   * put back. The refusal names the column and both types rather than doing
   * nothing, since a keystroke that quietly does nothing reads as a broken one.
   *
   * What runs past the last row or the last column is left off rather than
   * refused, and the footnote says so. Nothing is added to make room: a paste
   * that grew the table by forty rows because the copy was taken near the
   * bottom is a worse surprise than a paste that stopped at the edge.
   */
  const pasteBlock = useCallback(() => {
    const carried = copied;

    if (!carried) {
      setNotice({
        text: 'Nothing has been copied yet — Ctrl+C takes a copy of the cell the cursor is on, or of the block that is selected.',
        wrong: true,
      });
      return;
    }

    if (!block) return;

    const { top, left } = block;
    const down = Math.min(carried.cells.length, rows.length - top);
    const across = Math.min(carried.columns.length, columns.length - left);
    if (down <= 0 || across <= 0) return;

    for (let step = 0; step < across; step += 1) {
      const target = columns[left + step];
      if (target.type === carried.columns[step]) continue;

      setNotice({
        text: `That copy holds a ${COLUMN_TYPE_LABELS[carried.columns[step]]} column where “${
          target.name
        }” holds ${COLUMN_TYPE_LABELS[target.type]}. Cells go into columns of their own kind or nowhere${
          across > 1 ? ', and a block goes down whole or not at all' : ''
        }.`,
        wrong: true,
      });
      return;
    }

    const stored = getTable(table.id);
    if (!stored) return;

    const writes: CellWrite[] = [];
    // What the cells being written over were holding, gathered before the write
    // and swept after it, exactly as a deleted row's pictures are: a file the
    // copy itself still points at — or another cell, or a post — is seen to be
    // wanted and stays in the folder.
    const had: string[] = [];
    const kept = new Set<string>();

    for (let step = 0; step < down; step += 1) {
      const shown = rows[top + step];
      const row = shown && stored.rows.find((each) => each.id === shown.id);
      if (!row) continue;

      for (let sideways = 0; sideways < across; sideways += 1) {
        const column = columns[left + sideways];
        const contents = carried.cells[step][sideways];

        had.push(...cellImages(row, column.id));
        for (const name of contents.images) kept.add(name);

        writes.push({ rowId: row.id, columnId: column.id, contents });
      }
    }

    // The whole block in one write: several rows written one at a time would be
    // several events, and every view listening would draw the table half
    // pasted on the way through.
    if (!setCellsContents(table.id, writes)) {
      setNotice(null);
      return;
    }

    const dropped = had.filter((name) => !kept.has(name));
    if (dropped.length > 0) void discardTableImages(dropped);

    // What was put down is what is now selected, so it can be seen at a glance
    // and moved on again without being drawn out a second time.
    const last = rows[top + down - 1];
    setCorner(down > 1 || across > 1 ? { rowId: last.id, columnId: columns[left + across - 1].id } : null);
    setCursor({ rowId: rows[top].id, columnId: columns[left].id });

    const clipped = down < carried.cells.length || across < carried.columns.length;
    setNotice(
      clipped
        ? {
            text: `The copy reached past the edge of the table, so ${count(
              down * across,
              'cell'
            )} of it went down and the rest was left off.`,
          }
        : null
    );
  }, [block, columns, rows, table.id]);

  /**
   * The selected cells emptied. Only the words: the pictures under a cell and
   * the page written about it stay, which is what Delete on one cell has always
   * done — and a keystroke that swept away four screenshots without a word
   * would be a keystroke nobody could risk pressing.
   */
  const clearBlock = useCallback(() => {
    if (!block) return;

    const stored = getTable(table.id);
    if (!stored) return;

    const writes: CellWrite[] = [];

    for (let down = block.top; down <= block.bottom; down += 1) {
      const shown = rows[down];
      const row = shown && stored.rows.find((each) => each.id === shown.id);
      if (!row) continue;

      for (let across = block.left; across <= block.right; across += 1) {
        const column = columns[across];
        writes.push({
          rowId: row.id,
          columnId: column.id,
          contents: { ...cellContents(row, column.id), value: '' },
        });
      }
    }

    setCellsContents(table.id, writes);
  }, [block, columns, rows, table.id]);

  const keysWhileSelected = useCallback(
    (event: React.KeyboardEvent, rowId: string, column: Column, active: boolean) => {
      const key = event.key;

      if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight') {
        event.preventDefault();
        // With Shift held the cursor still moves and the far corner stays put,
        // which is what draws a block out from the keyboard — the same gesture
        // as dragging across the cells, for the hand that is not on the mouse.
        move(
          key === 'ArrowDown' ? 1 : key === 'ArrowUp' ? -1 : 0,
          key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0,
          event.shiftKey
        );
        return;
      }

      if (key === 'Tab') {
        event.preventDefault();
        move(0, event.shiftKey ? -1 : 1);
        return;
      }

      /* A whole cell copied and put down again.

         On **any** of Ctrl+C, Cmd+C, Alt+C and Ctrl+Shift+C, and the same
         four for V. Which one a person reaches for is a habit — the same
         reasoning that gives a line break inside a cell four modifiers — and
         the one anybody tries first is Ctrl+C, so binding this to Alt alone
         made a feature that was only there for whoever read about it.

         Which key is which is `letterPressed`'s business: on a Hebrew layout,
         and on a Mac where Alt+C types "ç", the C key does not report a "c" at
         all, and it is still the C key. */
      const held = event.ctrlKey || event.metaKey || event.altKey;

      if (held && letterPressed(event, 'KeyC', 'c')) {
        // Words dragged out with the mouse belong to the browser's own copy:
        // somebody who has selected half a sentence means that half, not the
        // cell around it. Only asked of a single cell — a block drawn across
        // several is unmistakably about the cells, and drawing one clears the
        // highlight anyway.
        if (!block || blockSize(block) === 1) {
          const selection = window.getSelection();
          if (selection && !selection.isCollapsed && selection.toString().trim() !== '') return;
        }

        event.preventDefault();
        copyBlock();
        return;
      }

      if (held && letterPressed(event, 'KeyV', 'v')) {
        /* A snip pasted straight onto a picture cell is Ctrl+V too, and that
           is the browser's `paste` event rather than this — so the keystroke
           is only taken when there is a copy the cell under the cursor could
           actually start taking. With none, it goes through untouched and the
           snip lands as it always did. Alt+V is answered either way, having no
           other meaning: it is how the refusal gets said out loud. */
        const canTake = copied?.columns[0] === column.type;
        if (!canTake && !event.altKey) return;

        event.preventDefault();
        pasteBlock();
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
        clearBlock();
        return;
      }

      if (key === 'Escape') {
        // One thing at a time: this Escape lets go of the block, the next lets
        // go of the cell, and only the one after that reaches the page and
        // leaves full screen.
        if (!active) return;

        if (block && blockSize(block) > 1) {
          event.stopPropagation();
          setCorner(null);
          return;
        }

        // The cell gives up the keyboard as it goes — a cell still holding
        // focus after being let go of would swallow every Escape after this
        // one.
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
    [beginEdit, block, clearBlock, copyBlock, move, pasteBlock, table.id]
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
        setNotice({ text: `A cell holds ${MAX_CELL_IMAGES} pictures.`, wrong: true });
        return;
      }

      const result = await keepPicture(blob);
      if (!result.ok) {
        setNotice({ text: result.error, wrong: true });
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
        ref={scrollBox}
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
            <tr ref={headRow}>
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
                  // The line goes on the left of the heading whose gap it is,
                  // and on the right of the last one when the landing is the
                  // gap past the end — there being no heading after it.
                  marker={
                    !moving
                      ? null
                      : moving.to === index
                        ? 'left'
                        : moving.to === columns.length && index === columns.length - 1
                          ? 'right'
                          : null
                  }
                  lifted={moving?.columnId === column.id}
                  onResize={(width) => setResizing(width === null ? null : { columnId: column.id, width })}
                  onGrab={(event, moved) => startColumnDrag(column.id, event, moved)}
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

                {columns.map((column, columnIndex) => {
                  const active = cursor?.rowId === row.id && cursor.columnId === column.id;

                  return (
                    <GridCell
                      key={column.id}
                      row={row}
                      column={column}
                      active={active}
                      selected={
                        !active &&
                        !!block &&
                        rowIndex >= block.top &&
                        rowIndex <= block.bottom &&
                        columnIndex >= block.left &&
                        columnIndex <= block.right
                      }
                      draft={active ? draft : null}
                      panelOpen={
                        (note?.rowId === row.id && note.columnId === column.id) ||
                        (pick?.rowId === row.id && pick.columnId === column.id) ||
                        (about?.rowId === row.id && about.columnId === column.id)
                      }
                      label={`${column.name}, row ${rowIndex + 1}`}
                      onSelect={(extend) => {
                        setDraft(null);
                        // Shift+click reaches from wherever the cursor already
                        // is to here, which is how a block of forty rows is
                        // selected without dragging the length of the table.
                        // The browser has meanwhile highlighted every word
                        // between the two, which is its own idea of what Shift
                        // means and would be what Ctrl+C copied.
                        if (extend) window.getSelection()?.removeAllRanges();
                        setCorner((was) => (extend ? (was ?? cursor) : null));
                        setCursor({ rowId: row.id, columnId: column.id });
                      }}
                      onDragFrom={() => {
                        dragFrom.current = { rowId: row.id, columnId: column.id };
                      }}
                      onDragTo={() => dragTo(row.id, column.id)}
                      onPasteImage={(blob) => void pasteImage(row, column.id, blob)}
                      onViewImage={(names, at) => setViewing({ names, at })}
                      onToggleTick={() => toggleTick(table.id, row.id, column.id)}
                      onOpenNote={(anchor) => {
                        // The cursor follows: the panel is about this cell, and
                        // closing it should leave the keyboard where the writing
                        // was rather than wherever it was three rows ago.
                        setDraft(null);
                        setCorner(null);
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
          onCopy={() => copyBlock({ rowId: openNote.row.id, columnId: openNote.column.id })}
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

      {/* The region itself is always here, empty or not: a live region put into
          the page at the same moment as its words is a region a screen reader
          has no reason to read out, and a cell copied says nothing on the
          screen otherwise. It is empty, so it takes no room. */}
      <div role="status" aria-live="polite">
        {notice && (
          <p
            className={`mt-2 flex items-start gap-1.5 text-xs ${
              notice.wrong ? 'text-[#B3261E] dark:text-[#FFB4AB]' : MUTED
            }`}
          >
            <span className="flex-1">{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)} className="shrink-0 underline">
              Dismiss
            </button>
          </p>
        )}
      </div>

      {/* Only what is true of *this* table right now. How the grid is worked is
          a page of its own further down (`HowToUse` in `app/document/page.tsx`):
          it is the same on every table and reading it again under each one is
          how a footnote stops being read at all. */}
      {(table.sort || hidden > 0) && (
        <p className={`mt-2 text-xs ${MUTED}`}>
          {table.sort &&
            'While a sort is on, the rows are only shown in that order — a row inserted above or below another goes in beside it in the stored order, and may appear elsewhere on the screen.'}
          {table.sort && hidden > 0 && ' '}
          {hidden > 0 && `A filter is hiding ${hidden} row${hidden === 1 ? '' : 's'}, and a new row starts empty, so it may be hidden the moment it is added.`}
        </p>
      )}
    </div>
  );
}
