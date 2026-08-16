'use client';

import { useEffect } from 'react';
import { DRIVE_IMAGES_EVENT } from '@/lib/drive-images';
import { IMAGE_FOLDER_EVENT, readImage } from '@/lib/image-folder';
import { LOCAL_IMAGE_PREFIX, localImageName } from '@/lib/local-posts';

/** Marks the element as carrying a folder-backed image, so its src can be restored. */
export const LOCAL_IMAGE_ATTR = 'data-local-image';
const MISSING_ATTR = 'data-local-image-missing';

/**
 * Moves every `local:` reference off `src` and onto a data attribute, ready to
 * be rendered.
 *
 * Nothing may hand a `local:` src to the DOM. The browser cannot fetch that
 * scheme and reports `ERR_UNKNOWN_URL_SCHEME`, and React re-applies the HTML it
 * was given on any commit that touches the container — so a resolved blob URL
 * put there afterwards is overwritten again and again, which is what made the
 * pictures blink and re-request themselves. Rendering the reference as an
 * attribute instead means React only ever writes something inert, and the hook
 * below fills in the src.
 */
export function prepareLocalImages(html: string): string {
  if (typeof window === 'undefined' || !html || !html.includes(LOCAL_IMAGE_PREFIX)) return html;

  const doc = new DOMParser().parseFromString(`<body><div id="prepare-root">${html}</div></body>`, 'text/html');
  const root = doc.getElementById('prepare-root');
  if (!root) return html;

  for (const image of Array.from(root.querySelectorAll('img'))) {
    const name = localImageName(image.getAttribute('src') ?? '');
    if (!name) continue;

    image.removeAttribute('src');
    image.setAttribute(LOCAL_IMAGE_ATTR, name);
  }

  return root.innerHTML;
}

/** Long enough to collect a burst of typing, short enough not to be seen. */
const SETTLE_MS = 50;

/**
 * Swaps every `local:` image inside `container` for a blob URL read out of the
 * author's image folder.
 *
 * The substitution happens in the DOM rather than in the stored HTML: a blob URL
 * is only good for this page's lifetime, so it must never be written to a post.
 * The file name is left behind on the element, which is both what a later pass
 * looks up and what the editor uses to put `local:` back before saving.
 *
 * Content set through `dangerouslySetInnerHTML` is replaced wholesale whenever
 * React re-applies it, taking these edits with it — so the container is watched
 * and anything new is resolved again.
 *
 * Each file is read once and its URL reused: reassigning a src makes the browser
 * decode and repaint the image, so re-resolving on every keystroke showed up as
 * the picture flickering while the page was edited or scrolled. For the same
 * reason a src is only ever written when it actually differs, passes are never
 * run concurrently, and a file already known to be unreadable is not retried
 * until the folder changes.
 *
 * An image that cannot be read keeps its alt text and is marked, rather than
 * being dropped: the post still says a picture belongs there.
 */
export function useLocalImages(container: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = container.current;
    if (!root) return;

    let cancelled = false;
    let running = false;
    let rerun = false;
    let timer: number | undefined;

    const urls = new Map<string, string>();
    const unreadable = new Set<string>();

    /**
     * Puts already-known URLs back, without waiting. React re-applying the HTML
     * hands back images with no src at all, and going through the debounced pass
     * below would leave them blank for long enough to see.
     */
    const applyCached = () => {
      for (const image of Array.from(root.querySelectorAll('img'))) {
        const name = image.getAttribute(LOCAL_IMAGE_ATTR);
        if (!name) continue;

        const known = urls.get(name);
        if (known && image.getAttribute('src') !== known) image.src = known;
      }
    };

    const resolve = async () => {
      // One pass at a time; anything that arrives mid-pass gets the next one.
      if (running) {
        rerun = true;
        return;
      }
      running = true;

      try {
        do {
          rerun = false;

          for (const image of Array.from(root.querySelectorAll('img'))) {
            if (cancelled) return;

            const name = image.getAttribute(LOCAL_IMAGE_ATTR) ?? localImageName(image.getAttribute('src') ?? '');
            if (!name) continue;
            if (image.getAttribute(LOCAL_IMAGE_ATTR) !== name) image.setAttribute(LOCAL_IMAGE_ATTR, name);

            const known = urls.get(name);
            if (known) {
              if (image.getAttribute('src') !== known) image.src = known;
              image.removeAttribute(MISSING_ATTR);
              continue;
            }

            if (unreadable.has(name)) {
              if (image.hasAttribute('src')) image.removeAttribute('src');
              image.setAttribute(MISSING_ATTR, 'true');
              continue;
            }

            const file = await readImage(name);
            if (cancelled) return;

            if (!file) {
              unreadable.add(name);
              image.removeAttribute('src');
              image.setAttribute(MISSING_ATTR, 'true');
              continue;
            }

            const url = URL.createObjectURL(file);
            urls.set(name, url);
            image.removeAttribute(MISSING_ATTR);
            image.src = url;
          }
        } while (rerun);
      } finally {
        running = false;
      }
    };

    const schedule = () => {
      if (timer !== undefined) return;
      timer = window.setTimeout(() => {
        timer = undefined;
        void resolve();
      }, SETTLE_MS);
    };

    void resolve();

    // Only childList: the src and marker edits above are this effect's own work,
    // and watching attributes would feed the observer back into itself.
    const observer = new MutationObserver((records) => {
      if (!records.some((record) => record.addedNodes.length > 0)) return;
      applyCached();
      schedule();
    });
    observer.observe(root, { childList: true, subtree: true });

    // A different folder means different files, so everything is read afresh.
    // Drive connecting is the same event in every way that matters here: a
    // picture that was unreadable a moment ago has just become readable.
    const onFolderChange = () => {
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
      unreadable.clear();
      schedule();
    };
    window.addEventListener(IMAGE_FOLDER_EVENT, onFolderChange);
    window.addEventListener(DRIVE_IMAGES_EVENT, onFolderChange);

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener(IMAGE_FOLDER_EVENT, onFolderChange);
      window.removeEventListener(DRIVE_IMAGES_EVENT, onFolderChange);
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
    };
    // Deliberately mount-only. Anything that arrives later comes through the
    // observer or the folder event; taking a changing value as a dependency
    // would tear this down and revoke every URL the images are still showing,
    // which reads as the pictures blinking and being fetched all over again.
  }, [container]);
}

/**
 * A copy of the container's HTML with every resolved image put back to its
 * `local:` reference. Everything read out of the editor goes through this, so a
 * blob URL — which means nothing once the page is gone — can never reach a
 * saved post.
 */
export function restoreLocalImages(root: HTMLElement): string {
  const clone = root.cloneNode(true) as HTMLElement;

  for (const image of Array.from(clone.querySelectorAll('img'))) {
    const name = image.getAttribute(LOCAL_IMAGE_ATTR);
    image.removeAttribute(LOCAL_IMAGE_ATTR);
    image.removeAttribute(MISSING_ATTR);
    if (name) image.setAttribute('src', `local:${name}`);
  }

  return clone.innerHTML;
}
