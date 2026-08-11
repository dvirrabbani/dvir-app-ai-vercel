'use client';

/**
 * A cell that holds writing and pictures together.
 *
 * The other three column types are one value each and are edited in place, in
 * the cell, the way a spreadsheet does it. This one cannot be: a screenshot and
 * a paragraph about it do not fit on one line of a grid, and a single-line input
 * has nowhere to put a thumbnail or the cross that takes it away. So the cell
 * shows what is there — the pictures across the top, the writing under them —
 * and opens a panel against itself to be changed.
 *
 * The pictures are file names in the folder picked in `picture-folder.tsx`.
 * Nothing here holds bytes: `useFolderImage` reads each file back out of the
 * folder when it is shown, and a file that has gone says so rather than
 * disappearing.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ImageOff, ImagePlus, Loader2, Trash2, X } from 'lucide-react';
import {
  CELL_MAX_LENGTH,
  Column,
  MAX_CELL_IMAGES,
  Row,
  TableDoc,
  addCellImage,
  cellImages,
  cellValue,
  removeCellImage,
  setCell,
} from '@/lib/documents';
import { discardTableImages } from '@/lib/image-folder';
import { plainRichText, shortcutEdit } from '@/lib/rich-text';
import { useFolderImage } from '@/lib/use-folder-image';
import { VIEWER_MARK } from '@/components/document/picture-viewer';
import { FormatToolbar, RichText, applyEdit } from '@/components/document/rich-text';
import {
  PictureFolderButton,
  folderMessage,
  imageFrom,
  keepPicture,
  useFolderState,
} from '@/components/document/picture-folder';

/** Literal greys: `text-muted-foreground` resolves to nothing in this project. */
const MUTED = 'text-[#4B5563] dark:text-[#9CA3AF]';
const SOLID = 'text-[#171717] dark:text-[#FAFAFA]';
const LINE = 'border-black/10 dark:border-white/10';

/* -------------------------------------------------------------------------- */
/*  One picture                                                               */
/* -------------------------------------------------------------------------- */

/**
 * A picture out of the folder, at the size it deserves.
 *
 * No height is forced on it: it is drawn at its own measurements, shrunk only
 * by whichever cap it meets first — the width of the cell it is in, or the
 * height a row can reasonably give it. A snip of a dialog box small enough to
 * fit comes out at exactly one image pixel per screen pixel, which is the only
 * way it is properly readable; a full-window screenshot comes down to fit and
 * is opened in `PictureViewer` to be read. Forcing a height, as this used to,
 * made the second case of everything — a 36-pixel strip of a screenshot tells
 * you nothing except that a screenshot is there.
 *
 * Three states, and the two that are not a picture take a square of their own
 * so the cell does not jump about: reading it, showing it, and not finding it.
 * A picture moved out of the folder from under the table leaves its frame
 * behind, because the cell still says a picture belongs there.
 */
function Thumb({ name, maxHeight, alt }: { name: string; maxHeight: number; alt: string }) {
  const { url, state } = useFolderImage(name);

  if (state === 'ready' && url) {
    return (
      // A plain <img>: the bytes are a blob URL out of a folder on this machine,
      // which `next/image` has no host to optimise and no way to reach.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={alt}
        style={{ maxHeight }}
        className={`block max-w-full rounded border ${LINE}`}
      />
    );
  }

  const side = Math.min(maxHeight, 56);

  return (
    <span
      style={{ height: side, width: side }}
      title={state === 'missing' ? `${name} is not in the folder any more` : name}
      className={`inline-flex items-center justify-center rounded border bg-black/[0.03] dark:bg-white/[0.05] ${LINE} ${MUTED}`}
    >
      {state === 'missing' ? (
        <ImageOff className="h-3.5 w-3.5" />
      ) : (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      )}
    </span>
  );
}

/**
 * How much height a cell gives a picture. One on its own gets room to be read
 * where it sits; several are a contact sheet, and the one you want is opened.
 */
function capFor(count: number): number {
  return count === 1 ? 280 : 130;
}

/* -------------------------------------------------------------------------- */
/*  What the grid shows                                                       */
/* -------------------------------------------------------------------------- */

/** The cell as it sits in the table: pictures along the top, writing beneath. */
export function NoteCellBody({
  row,
  column,
  onView,
}: {
  row: Row;
  column: Column;
  /** Opens the cell's pictures over the page, starting at the one clicked. */
  onView: (names: string[], at: number) => void;
}) {
  const text = cellValue(row, column.id);
  const images = cellImages(row, column.id);

  // A non-breaking space so an empty cell is still a full line tall and can be
  // clicked on at all.
  if (!text && images.length === 0) return <>{' '}</>;

  return (
    // The direction is on the outside so the pictures follow the writing: a
    // Hebrew note keeps its thumbnails against the right-hand edge with the
    // text, rather than stranded across the cell from it.
    <span dir="auto" className="flex flex-col items-start gap-1">
      {images.length > 0 && (
        <span className="flex max-w-full flex-wrap items-start gap-1">
          {images.map((name, index) => (
            <button
              key={name}
              type="button"
              // The grid moves by cell, so a picture is not its own stop on the
              // way round with Tab — the cell it sits in is, and the panel
              // behind Enter has the same pictures as proper buttons.
              tabIndex={-1}
              title="Open this picture over the page"
              // The click is this picture's own: letting it through would put
              // the cursor on the cell instead, and the double click behind it
              // would open the writing panel over the picture just asked for.
              onClick={(event) => {
                event.stopPropagation();
                onView(images, index);
              }}
              onDoubleClick={(event) => event.stopPropagation()}
              className="block max-w-full cursor-zoom-in rounded transition-opacity hover:opacity-80"
            >
              {/* The markers are how the line looks rather than part of what it
                  says, so the picture beside it is described by the words. */}
              <Thumb name={name} maxHeight={capFor(images.length)} alt={plainRichText(text) || column.name} />
            </button>
          ))}
        </span>
      )}
      {text && (
        // Shown whole, line breaks and formatting and all, and the row grows to
        // hold it — the same as a plain text cell, so which type a column is
        // does not change how much of what you wrote you can see.
        //
        // No `dir` of its own, deliberately: a `dir="auto"` here would hide this
        // text from the one on the wrapper — the direction is read from the
        // first strong character *outside* any descendant that sets its own —
        // and the pictures above would be left facing the other way. Nothing
        // `RichText` draws sets one either, for the same reason.
        <span className="whitespace-pre-wrap break-words leading-snug">
          <RichText value={text} />
        </span>
      )}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  The panel it is edited in                                                 */
/* -------------------------------------------------------------------------- */

const PANEL_WIDTH = 340;
/** Room for a picture worth looking at above the writing, and no more. */
const PANEL_HEIGHT = 460;

/** Under the cell if it fits, above it if it does not, and never off the edge. */
function placePanel(anchor: DOMRect): { left: number; top: number } {
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - PANEL_WIDTH - 8));

  const below = anchor.bottom + 4;
  const top = below + PANEL_HEIGHT > window.innerHeight ? Math.max(8, anchor.top - PANEL_HEIGHT - 4) : below;

  return { left, top };
}

export function NoteEditor({
  table,
  row,
  column,
  anchor,
  onView,
  onClose,
}: {
  table: TableDoc;
  row: Row;
  column: Column;
  /** Where the cell is on the screen, so the panel opens against it. */
  anchor: DOMRect;
  /** Opens the cell's pictures over the page, starting at the one clicked. */
  onView: (names: string[], at: number) => void;
  onClose: () => void;
}) {
  const stored = cellValue(row, column.id);
  const images = cellImages(row, column.id);
  const folder = useFolderState();

  const [draft, setDraft] = useState(stored);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const box = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  /** The writing box, so the formatting buttons have something to act on. */
  const field = useRef<HTMLTextAreaElement>(null);

  /**
   * What the writing is committed from, and where to.
   *
   * A write per keystroke would go to storage forty times for one sentence, so
   * the draft is held here and written when the panel closes — and it closes
   * three ways, by the button, by Escape and by a click somewhere else. Only
   * the unmount is common to all three, and by then the props this needs are
   * gone, so they are kept somewhere the cleanup can still reach them.
   *
   * A click away is why this cannot lean on the textarea's own blur: the mouse
   * closes the panel from a `mousedown` listener, and the blur that would have
   * followed never happens because there is nothing left to blur.
   */
  const latest = useRef(draft);
  const target = useRef({ tableId: table.id, rowId: row.id, columnId: column.id, stored });

  useEffect(() => {
    latest.current = draft;
    target.current = { tableId: table.id, rowId: row.id, columnId: column.id, stored };
  });

  const commit = useCallback(() => {
    const { tableId, rowId, columnId, stored: was } = target.current;
    if (latest.current !== was) setCell(tableId, rowId, columnId, latest.current);
  }, []);

  // `commit` never changes, so this runs on the way out and nowhere else.
  useEffect(() => commit, [commit]);

  useEffect(() => {
    const away = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;

      // A picture opened from in here is over the page rather than inside this
      // panel, and closing the panel out from under it would commit and shut
      // the very cell whose screenshot is being read.
      if (target?.closest(`[${VIEWER_MARK}]`)) return;

      if (!box.current?.contains(target)) onClose();
    };

    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [onClose]);

  const keep = useCallback(
    async (blob: Blob | null) => {
      if (!blob) return;

      if (images.length >= MAX_CELL_IMAGES) {
        setNotice(`A cell holds ${MAX_CELL_IMAGES} pictures.`);
        return;
      }

      setBusy(true);
      const result = await keepPicture(blob);
      setBusy(false);

      if (!result.ok) {
        setNotice(result.error);
        return;
      }

      // The writing goes in first: adding the picture rewrites the row, and a
      // sentence still sitting in the draft would be written over by it.
      commit();
      addCellImage(table.id, row.id, column.id, result.name);
      setNotice(null);
    },
    [column.id, commit, images.length, row.id, table.id]
  );

  const drop = useCallback(
    (name: string) => {
      removeCellImage(table.id, row.id, column.id, name);
      // Only after the removal is written, so the sweep can see that this cell
      // has stopped wanting it — and that another cell may not have.
      void discardTableImages([name]);
    },
    [column.id, row.id, table.id]
  );

  const { left, top } = placePanel(anchor);

  return (
    <div
      ref={box}
      style={{ left, top, width: PANEL_WIDTH, maxHeight: PANEL_HEIGHT }}
      onPaste={(event) => {
        const blob = imageFrom(event.clipboardData);
        if (!blob) return;
        event.preventDefault();
        void keep(blob);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        const blob = imageFrom(event.dataTransfer);
        if (!blob) return;
        event.preventDefault();
        void keep(blob);
      }}
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
      className={`fixed z-50 flex flex-col gap-2 overflow-auto rounded-xl border bg-white p-2.5 shadow-xl dark:bg-[#26262A] ${LINE}`}
    >
      <div className="flex items-center gap-1.5">
        <span className={`min-w-0 flex-1 truncate text-xs font-semibold ${SOLID}`} dir="auto">
          {column.name}
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

      {images.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {images.map((name, index) => (
            <li key={name} className="relative">
              {/* A real stop on the way round with Tab, unlike the copy in the
                  grid: in here there is no cell cursor to get in the way of. */}
              <button
                type="button"
                onClick={() => onView(images, index)}
                title="Open this picture over the page"
                className="block max-w-full cursor-zoom-in rounded transition-opacity hover:opacity-80"
              >
                <Thumb name={name} maxHeight={150} alt={plainRichText(draft) || column.name} />
              </button>
              <button
                type="button"
                onClick={() => drop(name)}
                title="Take this picture out of the cell"
                aria-label="Take this picture out of the cell"
                className="absolute -right-1.5 -top-1.5 rounded-full bg-[#B3261E] p-0.5 text-white shadow transition-colors hover:bg-[#8E1D18]"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <textarea
        autoFocus
        ref={field}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        // The same marks as a plain text cell, on the same keys. Handled here
        // rather than on the panel, which is only listening for the two ways
        // out of it.
        onKeyDown={(event) => {
          const shortcut = shortcutEdit(event);
          if (!shortcut || !field.current) return;

          event.preventDefault();
          applyEdit(field.current, shortcut, CELL_MAX_LENGTH, setDraft);
        }}
        maxLength={CELL_MAX_LENGTH}
        dir="auto"
        rows={4}
        placeholder="Write here, and paste a screenshot straight in"
        aria-label={`${column.name} — what this cell says`}
        className={`w-full resize-y rounded-lg border bg-white/70 px-2 py-1.5 text-sm outline-none transition-colors placeholder:text-gray-500 focus:border-[#FF4D8E]/50 focus:ring-2 focus:ring-[#FF4D8E]/20 dark:bg-white/5 dark:placeholder:text-gray-400 ${LINE} ${SOLID}`}
      />

      <FormatToolbar field={field} max={CELL_MAX_LENGTH} onChange={setDraft} />

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy || images.length >= MAX_CELL_IMAGES}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/10 ${LINE} ${SOLID}`}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
          Add a picture
        </button>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            void keep(file ?? null);
          }}
        />

        <PictureFolderButton
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/10 ${LINE}`}
        />
      </div>

      {notice ? (
        <p className="text-xs text-[#B3261E] dark:text-[#FFB4AB]">{notice}</p>
      ) : (
        <p className={`text-[11px] ${MUTED}`}>
          {folder.status === 'ready'
            ? `Ctrl+B is bold and Ctrl+Alt+1 a title. Ctrl+V drops a snip straight in. ${folderMessage(folder)}`
            : folderMessage(folder)}
        </p>
      )}
    </div>
  );
}
