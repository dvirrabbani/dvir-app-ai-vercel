'use client';

/**
 * One picture out of a cell, given the whole window.
 *
 * A cell in a table can only ever be a thumbnail's worth of a screenshot — the
 * column is as wide as it has been dragged and the row has to stay a row — so
 * the picture in the grid is there to be recognised rather than read. This is
 * where it is read: the same file, at the size it actually is.
 *
 * Two sizes, because they answer different questions. **Fit** puts the whole of
 * it on the screen, which is how you find the part you want. **Full size** draws
 * one image pixel per screen pixel and lets the window scroll, which is how you
 * read six-point text in a screenshot — anything smaller is the browser throwing
 * pixels away. The picture's real measurements are on the bar, so it is never a
 * guess which of the two you are looking at.
 *
 * Nothing here reads a file itself: `useFolderImage` hands back the same cached
 * blob URL the cell behind it is already showing, so opening this is not a
 * second read off the disk.
 */

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ImageOff, Loader2, Maximize2, Minimize2, X } from 'lucide-react';
import { useFolderImage } from '@/lib/use-folder-image';
import { Floating } from '@/components/document/floating';

/** Literal greys are used everywhere else; on this backdrop it is white on black. */
const BAR_BUTTON =
  'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-white/80 transition-colors hover:bg-white/15 hover:text-white disabled:cursor-not-allowed disabled:opacity-30';

/**
 * Marks every part of the viewer, so the note panel underneath can tell a click
 * in here from a click away from itself and stay open behind it.
 */
export const VIEWER_MARK = 'data-picture-viewer';

export function PictureViewer({
  names,
  start,
  onClose,
}: {
  /** Every picture in the cell it was opened from, so they can be stepped through. */
  names: string[];
  start: number;
  onClose: () => void;
}) {
  const [at, setAt] = useState(start);
  const [actual, setActual] = useState(false);
  /** What the file really measures, read off the image once it has loaded. */
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  const name = names[Math.min(at, names.length - 1)] ?? names[0];
  const { url, state } = useFolderImage(name);

  const step = useCallback(
    (by: number) => {
      setAt((was) => (was + by + names.length) % names.length);
      setSize(null);
      setActual(false);
    },
    [names.length]
  );

  /**
   * Escape closes this and nothing else, and the arrows move between the
   * pictures in the cell.
   *
   * Taken in the capture phase on purpose: the page's own Escape leaves full
   * screen from a listener on the very same window, and a bubbling one here
   * could not get in front of it. Stopping it here is what makes Escape unwind
   * one layer at a time rather than throwing away the workspace as well.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }

      if (names.length < 2) return;

      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        event.stopPropagation();
        step(event.key === 'ArrowRight' ? 1 : -1);
      }
    };

    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [names.length, onClose, step]);

  // The page behind must not scroll under the picture while it is up.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const measured = size ? `${size.width} × ${size.height}` : null;

  return (
    // Above the page's own full screen, which is z-[60]: this is the layer over
    // everything, and a picture opened from a full-screen table has to clear it.
    // Through the body, or `inset-0` would mean the glass card it was opened
    // inside rather than the window — a picture over a corner of the page.
    <Floating>
      <div
        {...{ [VIEWER_MARK]: '' }}
        role="dialog"
        aria-modal="true"
        aria-label={`Picture ${name}`}
        className="fixed inset-0 z-[70] flex flex-col bg-black/85 backdrop-blur-sm"
      >
        <div className="flex shrink-0 items-center gap-1 border-b border-white/10 px-2 py-1.5">
          <span className="min-w-0 flex-1 truncate text-xs text-white/70" title={name}>
            {name}
            {measured && <span className="ml-2 tabular-nums text-white/50">{measured}</span>}
            {names.length > 1 && (
              <span className="ml-2 tabular-nums text-white/50">
                {at + 1} of {names.length}
              </span>
            )}
          </span>

          {names.length > 1 && (
            <>
              <button type="button" onClick={() => step(-1)} title="Previous picture (←)" className={BAR_BUTTON}>
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => step(1)} title="Next picture (→)" className={BAR_BUTTON}>
                <ChevronRight className="h-4 w-4" />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => setActual((was) => !was)}
            disabled={state !== 'ready'}
            title={
              actual
                ? 'Fit the whole picture on the screen'
                : 'Show it at full size — one image pixel per screen pixel'
            }
            className={BAR_BUTTON}
          >
            {actual ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            {actual ? 'Fit' : 'Full size'}
          </button>

          <button type="button" onClick={onClose} title="Close (Esc)" aria-label="Close" className={BAR_BUTTON}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* The scroll box. At full size the picture is wider and taller than the
            window, and a flex box that only centres would put the top of it out
            of reach — the inner box being at least the full size of this one is
            what keeps a small picture centred and a large one reachable. */}
        <div
          className="min-h-0 flex-1 overflow-auto"
          // A click on the space around the picture closes it — but only a first
          // click. Double-clicking a thumbnail is a reasonable thing to try, and
          // the second half of it lands on this backdrop the instant the first
          // half has opened it; without this, the picture would flash and vanish.
          onClick={(event) => {
            if (event.detail > 1) return;
            onClose();
          }}
        >
          <div className="flex min-h-full min-w-full items-center justify-center p-3">
            {state === 'ready' && url ? (
              // A plain <img>: a blob URL out of a folder on this machine, which
              // `next/image` has no host to optimise and no way to reach.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={url}
                alt={name}
                onLoad={(event) =>
                  setSize({
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight,
                  })
                }
                onClick={(event) => {
                  // The backdrop closes; the picture itself is the other way to
                  // swap between the two sizes, which is what a picture opened
                  // full screen is expected to do.
                  event.stopPropagation();
                  setActual((was) => !was);
                }}
                style={actual && size ? { width: size.width, maxWidth: 'none' } : undefined}
                className={`rounded shadow-2xl ${
                  actual ? 'cursor-zoom-out' : 'max-h-[calc(100vh-6rem)] max-w-full cursor-zoom-in'
                }`}
              />
            ) : (
              <span className="inline-flex items-center gap-2 text-sm text-white/70">
                {state === 'missing' ? (
                  <>
                    <ImageOff className="h-4 w-4" />
                    {name} is not in the folder any more.
                  </>
                ) : (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Reading it out of the folder…
                  </>
                )}
              </span>
            )}
          </div>
        </div>

        <p className="shrink-0 border-t border-white/10 px-3 py-1.5 text-center text-[11px] text-white/50">
          Click the picture to swap between fitting the window and full size.
          {names.length > 1 && ' The arrow keys move between the pictures in this cell.'} Esc closes it.
        </p>
      </div>
    </Floating>
  );
}
