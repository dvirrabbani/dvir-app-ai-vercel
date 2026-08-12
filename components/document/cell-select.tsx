'use client';

/**
 * A cell that holds choices off a list — one of them, or several.
 *
 * The column keeps the list — "To do, Doing, Done" — and the cell keeps the
 * name of what was picked, as the plain string it always keeps, so a column of
 * choices retyped as text is still every word somebody chose. What the type
 * adds is that the words come off a menu instead of being typed out forty
 * times, and that they come out in the order the list is in rather than
 * alphabetically.
 *
 * Two types share all of this. **Pick from a list** (`select`) holds one, and
 * the cell is that word. **Pick several from a list** (`tags`) holds as many as
 * belong there, separated by commas in the very same string — a comma being
 * what somebody types when they mean several things, which is what lets a
 * column filled in by hand become chips the moment it is retyped, and lets
 * retyping it back give the line return exactly as it was written. Everything
 * here reads a cell through `cellChoices`, so neither half has to ask which
 * type it is looking at more than once.
 *
 * All of it lives here, the way the diet menu keeps its chips and its editor
 * together: `OptionPicker` is what a cell opens, and `OptionListPanel` is the
 * list itself, opened from the column's own menu. A choice is added from
 * either, because the moment you want one is usually the moment you are
 * filling a cell in.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Info, Plus, Trash2, X } from 'lucide-react';
import {
  CELL_NOTE_MAX_LENGTH,
  Column,
  MAX_CELL_TAGS,
  MAX_COLUMN_OPTIONS,
  OPTION_MAX_LENGTH,
  Row,
  TableDoc,
  addOption,
  cellChoices,
  cellNote,
  moveOption,
  optionIndex,
  optionName,
  removeOption,
  renameOption,
  sameOption,
  setCell,
  setCellNote,
  toggleTag,
  unlistedValues,
} from '@/lib/documents';
import { plainRichText, shortcutCommand } from '@/lib/rich-text';
import {
  FormatToolbar,
  RichCellEditor,
  RichCellHandle,
} from '@/components/document/rich-text';

/** Literal greys: `text-muted-foreground` resolves to nothing in this project. */
const MUTED = 'text-[#4B5563] dark:text-[#9CA3AF]';
const SOLID = 'text-[#171717] dark:text-[#FAFAFA]';
const LINE = 'border-black/10 dark:border-white/10';

/* -------------------------------------------------------------------------- */
/*  What a choice looks like                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The colours a chip can come in. Each is a pale tint with its own dark ink in
 * the light theme and the same hue the other way round in the dark one, so a
 * chip is legible in both — a brand pink chip with pink writing on it measures
 * 2.3:1 and is exactly the trap this project has been caught by before.
 *
 * Which colour a choice gets is its **place on the list** rather than anything
 * stored or anything hashed out of its name. Nothing to pick when adding a
 * choice and nothing to carry through a backup either way, but a place is the
 * one that guarantees the first eight choices are eight different colours: a
 * hash of the name puts "To do" and "In progress" on the same tint about as
 * often as not, and a status column where every chip is the same colour is a
 * column you have to read rather than glance at.
 */
const TONES = [
  'bg-[#E0E7FF] text-[#312E81] dark:bg-[#312E81] dark:text-[#C7D2FE]',
  'bg-[#DCFCE7] text-[#14532D] dark:bg-[#14532D] dark:text-[#BBF7D0]',
  'bg-[#FEF3C7] text-[#78350F] dark:bg-[#78350F] dark:text-[#FDE68A]',
  'bg-[#FCE7F3] text-[#831843] dark:bg-[#831843] dark:text-[#FBCFE8]',
  'bg-[#CFFAFE] text-[#164E63] dark:bg-[#164E63] dark:text-[#A5F3FC]',
  'bg-[#F3E8FF] text-[#581C87] dark:bg-[#581C87] dark:text-[#E9D5FF]',
  'bg-[#FFE4E6] text-[#881337] dark:bg-[#881337] dark:text-[#FECDD3]',
  'bg-[#E2E8F0] text-[#1E293B] dark:bg-[#334155] dark:text-[#E2E8F0]',
];

/** A list longer than the palette starts it again, which only puts two of a
 *  colour on a list of nine — and they are eight apart. */
function toneFor(place: number): string {
  return TONES[place % TONES.length];
}

/**
 * One choice, drawn. A value the list does not offer — `place` of -1 — is
 * still shown, because it is what somebody wrote, but dressed as what it is
 * rather than given a colour of its own: a column half filled in before the
 * list existed reads at a glance as a column half filled in.
 */
export function OptionChip({
  name,
  place,
  className = '',
}: {
  name: string;
  /** Where it sits on the column's list, or -1 for something not on it. */
  place: number;
  className?: string;
}) {
  return (
    <span
      dir="auto"
      title={place === -1 ? `${name} — not on this column's list` : name}
      className={`inline-block max-w-full truncate rounded-full px-2 py-0.5 text-xs font-medium ${
        place === -1 ? `border border-dashed ${LINE} ${MUTED}` : toneFor(place)
      } ${className}`}
    >
      {name}
    </span>
  );
}

/**
 * One choice drawn in the column's own spelling, so a cell filled in by hand
 * stops looking like three different answers the moment the list catches up
 * with it — and anything the list does not offer drawn as what somebody wrote.
 */
function ChoiceChip({ column, name }: { column: Column; name: string }) {
  const place = optionIndex(column, name);
  return <OptionChip name={place === -1 ? name : column.options[place]} place={place} className="min-w-0" />;
}

/** How much of the writing is put on the tag's tooltip: enough to know which
 *  cell you are about to open, not enough to be read standing up. */
const PEEK_LENGTH = 140;

/**
 * The cell as it sits in the table: what has been picked, and the tag that
 * opens what has been written about it.
 *
 * A `tags` cell wraps its chips onto as many lines as it takes rather than
 * running them off the edge — the row already grows to hold a text cell's line
 * breaks, and half a chip is worse than a taller row. They are shown in the
 * order they are stored, which a pick puts in the list's order: the same tag in
 * the same relative place on every row is what makes a column of them readable
 * at a glance instead of one cell at a time.
 *
 * The tag is only fully out when there *is* something written — a column of a
 * hundred rows with an icon burning on every one of them is a column you have
 * to look past to read the chips. On the rest it comes up under the pointer and
 * when the cursor is on the cell, the same way the bin beside a row number
 * does, so it is found by reaching for the cell rather than by being told.
 */
export function SelectCellBody({
  row,
  column,
  onOpenNote,
}: {
  row: Row;
  column: Column;
  /** Opens the writing behind this cell, against the tag that asked for it. */
  onOpenNote: (anchor: DOMRect) => void;
}) {
  const note = cellNote(row, column.id);
  const written = note.trim() !== '';

  const held = cellChoices(row, column);

  const peek = written ? plainRichText(note).replace(/\s+/g, ' ').trim().slice(0, PEEK_LENGTH) : '';

  return (
    <span className="flex items-start justify-between gap-1">
      {/* A non-breaking space so an empty cell is still a full line tall and
          can be clicked on at all. */}
      {held.length > 0 ? (
        <span className="flex min-w-0 flex-1 flex-wrap items-start gap-1">
          {held.map((name) => (
            <ChoiceChip key={name.toLowerCase()} column={column} name={name} />
          ))}
        </span>
      ) : (
        <span>{' '}</span>
      )}

      <button
        type="button"
        // The grid moves by cell, so the tag is not its own stop on the way
        // round with Tab — the cell it sits in is, and Alt+Enter opens it from
        // there without the hand leaving the keyboard.
        tabIndex={-1}
        // The click is the tag's own: letting it through would put the cursor
        // on the cell, and the double click behind it would open the list of
        // choices over the writing just asked for.
        onClick={(event) => {
          event.stopPropagation();
          onOpenNote(event.currentTarget.getBoundingClientRect());
        }}
        onDoubleClick={(event) => event.stopPropagation()}
        title={written ? `${peek}${peek.length === PEEK_LENGTH ? '…' : ''}` : 'Write about this cell (Alt+Enter)'}
        aria-label={written ? `Read what is written about this cell` : 'Write about this cell'}
        className={`shrink-0 rounded p-0.5 transition-all hover:bg-black/10 dark:hover:bg-white/10 ${
          written
            ? 'text-[#D81B60] dark:text-[#FF9EC1]'
            : `opacity-0 group-hover/cell:opacity-100 group-focus-within/cell:opacity-100 ${MUTED}`
        }`}
      >
        <Info className="h-3.5 w-3.5" aria-hidden />
      </button>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Where a panel opens                                                       */
/* -------------------------------------------------------------------------- */

const PANEL_WIDTH = 260;
const PANEL_HEIGHT = 320;

/** Under whatever opened it if it fits, above it if it does not, never off the
 *  edge. The same rule the note panel follows, and for the same reason: these
 *  are `position: fixed` so the scroll box they belong to cannot clip them. */
function placePanel(
  anchor: DOMRect,
  width = PANEL_WIDTH,
  height = PANEL_HEIGHT
): { left: number; top: number } {
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8));

  const below = anchor.bottom + 4;
  const top = below + height > window.innerHeight ? Math.max(8, anchor.top - height - 4) : below;

  return { left, top };
}

/** Closing on a click anywhere else, which is how both of these panels end. */
function useCloseOnClickAway(box: React.RefObject<HTMLDivElement | null>, onClose: () => void) {
  useEffect(() => {
    const away = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) onClose();
    };

    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [box, onClose]);
}

const PANEL =
  'fixed z-50 flex flex-col gap-1.5 rounded-xl border bg-white p-2 shadow-xl dark:bg-[#26262A]';

const FIELD =
  'w-full min-w-0 rounded-lg border bg-white/70 px-2 py-1.5 text-xs outline-none transition-colors focus:border-[#FF4D8E]/50 focus:ring-2 focus:ring-[#FF4D8E]/20 dark:bg-white/5';

/* -------------------------------------------------------------------------- */
/*  Picking one                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The menu a cell opens: the choices, and a box that finds one by typing and
 * makes one when there is nothing to find.
 *
 * Adding from in here is the whole reason a column can be turned into a list
 * and filled in straight away — the moment you want a choice that is not on
 * the list is almost always the moment you are looking at the cell that wants
 * it, and sending somebody to the column's menu and back to add "Blocked" is
 * how a list ends up with three spellings of it typed into cells instead.
 *
 * A cell holding several is the same menu that **stays open**: one choice is an
 * answer and the menu has done its job, but several are picked in one go, and a
 * menu that shut after each would be reopened four times to say "Design,
 * Urgent, Waiting". The box clears itself after each so the next one can just
 * be typed, and Escape — or a click anywhere else — is what says you are done.
 */
export function OptionPicker({
  table,
  row,
  column,
  anchor,
  initial,
  onClose,
}: {
  table: TableDoc;
  row: Row;
  column: Column;
  /** Where the cell is on the screen, so the menu opens against it. */
  anchor: DOMRect;
  /** The character that opened it, when it was opened by typing over the cell. */
  initial?: string;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(initial ?? '');
  const [at, setAt] = useState(0);

  const box = useRef<HTMLDivElement>(null);
  useCloseOnClickAway(box, onClose);

  const several = column.type === 'tags';

  /** What the cell is holding: one choice, or every tag between the commas. */
  const held = useMemo(() => cellChoices(row, column), [column, row]);
  const holding = useCallback(
    (name: string) => held.some((each) => sameOption(each, name)),
    [held]
  );

  /** No room for another tag. Nothing is dropped to make one — which tag went
   *  would be nobody's decision — so the list simply stops answering. */
  const full = several && held.length >= MAX_CELL_TAGS;

  const matches = useMemo(() => {
    const wanted = query.trim().toLowerCase();
    if (!wanted) return column.options;
    return column.options.filter((option) => option.toLowerCase().includes(wanted));
  }, [column.options, query]);

  // The highlight follows the list rather than sitting past the end of it: a
  // query narrowing to two choices must not leave Enter pointing at nothing.
  const highlighted = matches.length === 0 ? -1 : Math.min(at, matches.length - 1);

  // As the list would store it, not as it was typed: this is going onto the
  // list *and* into the cell, and two spellings of it would put the choice in
  // dashed — as something the list does not offer — the moment it was added.
  const typed = optionName(query);
  const canAdd =
    typed !== '' &&
    column.options.length < MAX_COLUMN_OPTIONS &&
    !column.options.some((option) => sameOption(option, typed));

  const pick = useCallback(
    (choice: string) => {
      // One choice is an answer, so the menu has finished. Several are picked
      // in one sitting, so it stays and clears itself for the next.
      if (!several) {
        setCell(table.id, row.id, column.id, choice);
        onClose();
        return;
      }

      toggleTag(table.id, row.id, column.id, choice);
      setQuery('');
      setAt(0);
    },
    [column.id, onClose, row.id, several, table.id]
  );

  const add = useCallback(() => {
    if (!canAdd || full) return;
    // Onto the list and into the cell in one go: a choice made up on the spot
    // is being made because this row needs it.
    if (addOption(table.id, column.id, typed)) pick(typed);
  }, [canAdd, column.id, full, pick, table.id, typed]);

  /** Anything in this cell the list is not offering, which is the one thing
   *  that would otherwise mean retyping it into the column's own menu. */
  const unlistedHere = useMemo(
    () => held.filter((name) => optionIndex(column, name) === -1),
    [column, held]
  );

  return (
    <div
      ref={box}
      style={{ ...placePanel(anchor), width: Math.max(PANEL_WIDTH, Math.min(anchor.width, 360)) }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          // Held here: this Escape closes the menu and nothing else. It must
          // not also let go of the cell behind it or leave full screen.
          event.stopPropagation();
          onClose();
          return;
        }

        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          if (matches.length === 0) return;
          const next = highlighted + (event.key === 'ArrowDown' ? 1 : -1);
          setAt((next + matches.length) % matches.length);
          return;
        }

        if (event.key === 'Enter') {
          event.preventDefault();
          // What is under the highlight, or what has just been typed when the
          // list has nothing like it — which is how a list is written in the
          // first place, one choice at a time as the rows need them.
          if (highlighted !== -1) pick(matches[highlighted]);
          else add();
        }
      }}
      className={`${PANEL} ${LINE}`}
    >
      <div className="flex items-center gap-1.5">
        <span className={`min-w-0 flex-1 truncate text-xs font-semibold ${SOLID}`} dir="auto">
          {column.name}
        </span>
        {/* How many are on, on a cell that can hold several — the chips are
            behind the panel as often as not, and "3 of 12" is what says
            whether there is room for the one you came to add. */}
        {several && held.length > 0 && (
          <span className={`shrink-0 text-[11px] tabular-nums ${MUTED}`}>
            {held.length} of {MAX_CELL_TAGS}
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          title="Close (Esc)"
          aria-label="Close"
          className={`shrink-0 rounded p-1 transition-colors hover:bg-black/5 dark:hover:bg-white/10 ${MUTED}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <input
        autoFocus
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setAt(0);
        }}
        dir="auto"
        maxLength={OPTION_MAX_LENGTH}
        placeholder={
          column.options.length === 0
            ? 'Type the first choice'
            : several
              ? 'Find or add — the menu stays open'
              : 'Find or add a choice'
        }
        aria-label={`Find or add a choice for ${column.name}`}
        className={`${FIELD} ${LINE} ${SOLID} placeholder:text-gray-500 dark:placeholder:text-gray-400`}
      />

      <ul className="max-h-52 overflow-auto">
        {matches.map((option, index) => {
          // Its place on the *column's* list, not in what the box has narrowed
          // it to: a choice must not change colour while you type its name.
          const place = column.options.indexOf(option);
          const on = holding(option);

          return (
            <li key={option}>
              <button
                type="button"
                onMouseEnter={() => setAt(index)}
                onClick={() => pick(option)}
                // Every one already on stays pressable, since that is how it
                // comes off again; only adding a thirteenth is refused.
                disabled={full && !on}
                className={`flex w-full items-center gap-1.5 rounded-lg px-1.5 py-1 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  index === highlighted ? 'bg-black/[0.06] dark:bg-white/10' : ''
                }`}
              >
                <OptionChip name={option} place={place} className="min-w-0" />
                {on && (
                  <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-[#D81B60] dark:text-[#FF9EC1]" />
                )}
              </button>
            </li>
          );
        })}

        {matches.length === 0 && (
          <li className={`px-1.5 py-1 text-[11px] ${MUTED}`}>
            {column.options.length === 0
              ? 'No choices yet.'
              : `Nothing on the list matches “${query.trim()}”.`}
          </li>
        )}
      </ul>

      {canAdd && !full && (
        <button
          type="button"
          onClick={add}
          className={`flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-left text-xs transition-colors hover:bg-black/5 dark:hover:bg-white/10 ${SOLID}`}
        >
          <Plus className="h-3.5 w-3.5 shrink-0 text-[#D81B60] dark:text-[#FF9EC1]" />
          <span className="min-w-0 truncate">
            Add <span className="font-semibold">{typed}</span> to the list
          </span>
        </button>
      )}

      {full && (
        <p className={`px-1.5 text-[11px] ${MUTED}`}>
          {MAX_CELL_TAGS} tags is the lot for one cell. Take one off to make room.
        </p>
      )}

      {/* Only what this cell is holding that the list is not offering: the
          words stay where they are either way, and the button is the one thing
          that would otherwise mean retyping them into the column's own menu. */}
      {unlistedHere.length > 0 && (
        <div className={`flex flex-col gap-1 border-t pt-1.5 ${LINE}`}>
          {unlistedHere.map((name) => (
            <div key={name.toLowerCase()} className="flex items-center gap-1.5">
              <OptionChip name={name} place={-1} className="min-w-0" />
              <button
                type="button"
                disabled={column.options.length >= MAX_COLUMN_OPTIONS}
                onClick={() => {
                  addOption(table.id, column.id, name);

                  // A cell holding one *is* the choice, so it is made to say
                  // what the list now offers when the two differ — a comma
                  // cannot be part of a name, and a button reading "add to the
                  // list" that leaves the chip dashed has not done what it
                  // says. A tag can never differ: `readTags` reads one exactly
                  // as a name is written. Then there is nothing left to do
                  // here, on a cell that holds only the one.
                  if (!several) {
                    setCell(table.id, row.id, column.id, optionName(name));
                    onClose();
                  }
                }}
                className={`ml-auto shrink-0 rounded-lg px-1.5 py-1 text-[11px] underline transition-colors hover:bg-black/5 disabled:no-underline disabled:opacity-40 dark:hover:bg-white/10 ${MUTED}`}
              >
                Add to the list
              </button>
            </div>
          ))}
        </div>
      )}

      {held.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setCell(table.id, row.id, column.id, '');
            onClose();
          }}
          className={`rounded-lg px-1.5 py-1 text-left text-xs transition-colors hover:bg-black/5 dark:hover:bg-white/10 ${MUTED}`}
        >
          Empty this cell
        </button>
      )}

      {several && (
        <p className={`px-1.5 text-[11px] ${MUTED}`}>
          Click a choice to put it on or take it off. Esc when you are done.
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Writing about one cell                                                    */
/* -------------------------------------------------------------------------- */

/** Wider and taller than the other two: this one is written into rather than
 *  picked from, and a paragraph in a 260px box is a paragraph nobody writes. */
const NOTE_WIDTH = 380;
const NOTE_HEIGHT = 440;

/**
 * The page behind a chip.
 *
 * A choice says what state a row is in and nothing else — "Blocked" cannot say
 * what by, or who was asked, or what happens when the answer comes. That is
 * what this holds: the same writing a blog post is made of, in the same markers
 * (`lib/rich-text.ts`), kept against this one cell.
 *
 * Not to be confused with `NoteEditor` in `cell-note.tsx`, which is a **Text &
 * pictures** cell being written — a cell that *is* writing. This is writing
 * behind a cell that is a choice, and it leaves the cell alone: the chip is
 * still the one word the column sorts and filters by.
 *
 * Written to the same rules as the note panel, for the same reasons. A write
 * per keystroke would reach storage forty times for one sentence, so the
 * writing is held here and committed on the way out — and the way out is three
 * different things, only one of which is the unmount, so what it needs is kept
 * where the cleanup can still reach it.
 */
export function CellNotePanel({
  table,
  row,
  column,
  anchor,
  onClose,
}: {
  table: TableDoc;
  row: Row;
  column: Column;
  /** Where the tag is on the screen, so the panel opens against it. */
  anchor: DOMRect;
  onClose: () => void;
}) {
  const stored = cellNote(row, column.id);
  const held = cellChoices(row, column);

  const [draft, setDraft] = useState(stored);

  const box = useRef<HTMLDivElement>(null);
  /** The writing surface, so the formatting buttons have something to act on. */
  const field = useRef<RichCellHandle>(null);
  useCloseOnClickAway(box, onClose);

  const latest = useRef(draft);
  const target = useRef({ tableId: table.id, rowId: row.id, columnId: column.id, stored });

  useEffect(() => {
    latest.current = draft;
    target.current = { tableId: table.id, rowId: row.id, columnId: column.id, stored };
  });

  const commit = useCallback(() => {
    const { tableId, rowId, columnId, stored: was } = target.current;
    if (latest.current !== was) setCellNote(tableId, rowId, columnId, latest.current);
  }, []);

  // `commit` never changes, so this runs on the way out and nowhere else.
  useEffect(() => commit, [commit]);

  const left = CELL_NOTE_MAX_LENGTH - draft.length;

  return (
    <div
      ref={box}
      style={{ ...placePanel(anchor, NOTE_WIDTH, NOTE_HEIGHT), width: NOTE_WIDTH, maxHeight: NOTE_HEIGHT }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          // Held here: this Escape closes the panel and nothing else. It must
          // not also let go of the cell behind it or leave full screen.
          event.stopPropagation();
          onClose();
        }
        // Enter makes a new line in here, so there has to be another way out
        // that keeps your hands where they are.
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) onClose();
      }}
      className={`${PANEL} ${LINE} overflow-auto`}
    >
      <div className="flex items-start gap-1.5">
        <span className={`min-w-0 shrink truncate text-xs font-semibold leading-6 ${SOLID}`} dir="auto">
          {column.name}
        </span>

        {/* Which cell this is about, said the way the cell itself says it —
            every chip of it, on a cell holding several. A panel over a scrolled
            grid can easily be the only thing on the screen, and "about this
            cell" is no use once the cell is hidden behind it. */}
        {held.length > 0 && (
          <span className="flex min-w-0 shrink flex-wrap items-center gap-1 py-0.5">
            {held.map((name) => (
              <ChoiceChip key={name.toLowerCase()} column={column} name={name} />
            ))}
          </span>
        )}

        <button
          type="button"
          onClick={onClose}
          title="Close (Esc)"
          aria-label="Close"
          className={`ml-auto shrink-0 rounded p-1 transition-colors hover:bg-black/5 dark:hover:bg-white/10 ${MUTED}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Written as it will be read — the same surface every other piece of
          writing on this page uses, showing the bold word bold and never the
          markers that make it. */}
      <RichCellEditor
        ref={field}
        value={stored}
        max={CELL_NOTE_MAX_LENGTH}
        onChange={setDraft}
        label={`What is written about this ${column.name} cell`}
        onKeyDown={(event) => {
          const command = shortcutCommand(event);

          if (command) {
            event.preventDefault();
            field.current?.run(command);
            return;
          }

          // Plain Enter is a new line rather than "done": this is a page of
          // writing, not a cell being filled in on the way down a column.
          if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
            event.preventDefault();
            field.current?.breakLine();
          }
        }}
        className={`min-h-40 w-full flex-1 overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-white/70 px-2 py-1.5 text-sm leading-relaxed transition-colors focus:border-[#FF4D8E]/50 focus:ring-2 focus:ring-[#FF4D8E]/20 dark:bg-white/5 ${LINE} ${SOLID}`}
      />

      <FormatToolbar editor={field} />

      {/* The room left is only worth saying when it is nearly gone; up to then
          it is a number in the corner telling somebody writing a paragraph
          that they are being counted. */}
      <p className={`text-[11px] ${left < 500 ? 'text-[#B3261E] dark:text-[#FFB4AB]' : MUTED}`}>
        {left < 500
          ? `${left} characters left.`
          : `Ctrl+B is bold and Ctrl+Alt+1 a title. Ctrl+Enter closes. ${
              column.type === 'tags'
                ? 'The tags themselves are untouched, so the column still sorts and filters by what was picked.'
                : 'The chip itself is untouched, so the column still sorts and filters by the choice.'
            }`}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  The list itself                                                           */
/* -------------------------------------------------------------------------- */

/** One row of the list: its name, editable where it is written, and its place. */
function OptionRow({
  table,
  column,
  option,
  index,
  count,
}: {
  table: TableDoc;
  column: Column;
  option: string;
  index: number;
  count: number;
}) {
  const [draft, setDraft] = useState(option);

  // The stored name can move without this row touching it — another tab, or a
  // rename being refused for a name already on the list — so it follows.
  const [known, setKnown] = useState(option);
  if (known !== option) {
    setKnown(option);
    setDraft(option);
  }

  const move = 'rounded p-0.5 transition-colors hover:bg-black/10 disabled:opacity-30 dark:hover:bg-white/10';

  return (
    <li className="flex items-center gap-1">
      {/* The colour this choice comes out in, which is its place on the list —
          so dragging one up the order is visibly a change of colour too. */}
      <span className={`h-4 w-4 shrink-0 rounded-full ${toneFor(index)}`} aria-hidden />

      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (!draft.trim() || !renameOption(table.id, column.id, option, draft)) setDraft(option);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') {
            setDraft(option);
            event.currentTarget.blur();
          }
        }}
        dir="auto"
        maxLength={OPTION_MAX_LENGTH}
        aria-label={`Rename ${option}`}
        className={`${FIELD} ${LINE} ${SOLID} flex-1`}
      />

      <button
        type="button"
        disabled={index === 0}
        onClick={() => moveOption(table.id, column.id, option, -1)}
        title="Move up"
        aria-label={`Move ${option} up`}
        className={`${move} ${MUTED}`}
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        disabled={index === count - 1}
        onClick={() => moveOption(table.id, column.id, option, 1)}
        title="Move down"
        aria-label={`Move ${option} down`}
        className={`${move} ${MUTED}`}
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => removeOption(table.id, column.id, option)}
        title={`Take ${option} off the list — cells already holding it keep it`}
        aria-label={`Take ${option} off the list`}
        className={`${move} ${MUTED} hover:text-[#B3261E] dark:hover:text-[#FFB4AB]`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

/**
 * The column's list, opened from its menu: what it offers, in the order it
 * offers it — which is the order the column sorts in, so moving "Blocked"
 * above "Done" is a real edit and not a tidy-up.
 *
 * Anything already written down the column that the list does not offer is
 * gathered at the bottom, because a column somebody has been filling in by
 * hand for a month is the most likely thing to be retyped into a list, and
 * typing the same twelve words out again is the reason they would not bother.
 */
export function OptionListPanel({
  table,
  column,
  anchor,
  onClose,
}: {
  table: TableDoc;
  column: Column;
  /** Where the heading is on the screen, so the panel opens under it. */
  anchor: DOMRect;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState('');

  const box = useRef<HTMLDivElement>(null);
  useCloseOnClickAway(box, onClose);

  const options = column.options;
  const full = options.length >= MAX_COLUMN_OPTIONS;
  const unlisted = useMemo(() => unlistedValues(table, column), [column, table]);
  const room = MAX_COLUMN_OPTIONS - options.length;

  const add = useCallback(() => {
    if (addOption(table.id, column.id, draft)) setDraft('');
  }, [column.id, draft, table.id]);

  return (
    <div
      ref={box}
      style={{ ...placePanel(anchor), width: PANEL_WIDTH, maxHeight: PANEL_HEIGHT }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
      className={`${PANEL} ${LINE} overflow-auto`}
    >
      <div className="flex items-center gap-1.5">
        <span className={`min-w-0 flex-1 truncate text-xs font-semibold ${SOLID}`} dir="auto">
          {column.name} — the list
        </span>
        <button
          type="button"
          onClick={onClose}
          title="Close (Esc)"
          aria-label="Close"
          className={`shrink-0 rounded p-1 transition-colors hover:bg-black/5 dark:hover:bg-white/10 ${MUTED}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {options.length === 0 ? (
        <p className={`text-[11px] ${MUTED}`}>
          Nothing on the list yet. Add the choices here, or type one straight into any cell in this column.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {options.map((option, index) => (
            <OptionRow
              key={option}
              table={table}
              column={column}
              option={option}
              index={index}
              count={options.length}
            />
          ))}
        </ul>
      )}

      <div className="flex items-center gap-1">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            add();
          }}
          dir="auto"
          disabled={full}
          maxLength={OPTION_MAX_LENGTH}
          placeholder={full ? `${MAX_COLUMN_OPTIONS} choices is the lot` : 'Another choice'}
          aria-label={`Add a choice to ${column.name}`}
          className={`${FIELD} ${LINE} ${SOLID} flex-1 placeholder:text-gray-500 disabled:opacity-60 dark:placeholder:text-gray-400`}
        />
        <button
          type="button"
          onClick={add}
          disabled={full || !draft.trim()}
          title="Add this choice"
          aria-label="Add this choice"
          className="shrink-0 rounded-lg bg-[#D81B60] p-1.5 text-white transition-colors hover:bg-[#B0154E] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {unlisted.length > 0 && (
        <div className={`flex flex-col gap-1.5 border-t pt-1.5 ${LINE}`}>
          <p className={`text-[11px] ${MUTED}`}>
            {unlisted.length === 1
              ? 'One value down this column is not on the list:'
              : `${unlisted.length} values down this column are not on the list:`}
          </p>
          <div className="flex flex-wrap gap-1">
            {unlisted.map((value) => (
              <OptionChip key={value} name={value} place={-1} />
            ))}
          </div>
          <button
            type="button"
            disabled={full}
            onClick={() => {
              // As many as there is room for, in the order they appear down the
              // column — which is nearer to the order they were thought of than
              // anything alphabetical would be.
              for (const value of unlisted.slice(0, room)) addOption(table.id, column.id, value);
            }}
            className={`self-start rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/10 ${LINE} ${SOLID}`}
          >
            {full
              ? `${MAX_COLUMN_OPTIONS} choices is the lot`
              : unlisted.length > room
                ? `Add the first ${room} to the list`
                : unlisted.length === 1
                  ? 'Add it to the list'
                  : 'Add them all to the list'}
          </button>
        </div>
      )}
    </div>
  );
}
