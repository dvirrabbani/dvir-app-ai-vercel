'use client';

/**
 * The one door out of the glass.
 *
 * Everything the document feature places by hand — the heading's menu, the
 * row's, the list of choices, the page written about a cell, the picture over
 * the whole window — is `position: fixed` against the button or the cell that
 * asked for it, because a panel drawn inside the scroll box is cut off by that
 * box's edge. That arithmetic is done against the *viewport*: the room below
 * the button, the room above it, the window's own width and height.
 *
 * `position: fixed` only means the viewport while no ancestor has taken the
 * job. A `filter`, a `transform`, a `perspective` or a `backdrop-filter`
 * anywhere above makes that element the containing block instead, and every
 * `top` and `inset-0` underneath quietly starts counting from its top-left
 * corner. The grid sits inside `.glass-card`, which is `backdrop-filter:
 * blur(16px)` — that is the whole glass treatment, not an ornament to be taken
 * off — so the heading menu was landing 288px below where it had measured, and
 * its lower half hung past the bottom of any window under about 1200px with no
 * way to scroll to it: the page does not scroll, the grid scrolls in its own
 * box, and the menu had been capped at a height it was no longer at.
 *
 * So the panels are rendered into `document.body`, where nothing is above them
 * and `fixed` means what the measurements assume. Two things this keeps that
 * are easy to lose:
 *
 * - React events still bubble to whatever rendered the panel, since a portal
 *   moves the DOM node and not the React tree. A panel closing on Escape by
 *   stopping the key going up to the grid still does exactly that.
 * - The theme still reaches it. `next-themes` puts `.dark` on `<html>`, above
 *   the body, so every `dark:` class inside carries across unchanged.
 *
 * What it does *not* keep is `contains`: a click in a portalled panel is no
 * longer inside the wrapper its trigger sits in, so any close-on-click-away
 * that measured the wrapper has to hold a ref to the panel itself.
 */

import { ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function Floating({ children }: { children: ReactNode }) {
  // Nothing here is ever rendered on the server — every one of these panels is
  // opened by a click and starts closed — so there is no first paint to match
  // and no need to wait a frame for a mounted flag.
  if (typeof document === 'undefined') return null;

  return createPortal(children, document.body);
}
