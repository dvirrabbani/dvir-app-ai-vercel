'use client';

/**
 * Showing a picture that lives in the author's own folder, from React.
 *
 * The blog reaches its images through `use-local-images.ts`, which patches
 * `src` attributes inside HTML the editor produced. A table has no HTML — a
 * cell is a React element — so this is the same idea said the other way round:
 * give it a file name, get back a blob URL to put on an `<img>`.
 *
 * The URLs are cached for the life of the page and shared by every cell asking
 * for the same file. Two things follow from that. A file is read once however
 * many cells show it, which matters when a duplicated row points at the same
 * screenshot; and nothing revokes a URL when one cell unmounts, because another
 * may still be showing it — they go when the folder changes, and otherwise when
 * the page does.
 */

import { useEffect, useSyncExternalStore } from 'react';
import { DRIVE_IMAGES_EVENT } from '@/lib/drive-images';
import { IMAGE_FOLDER_EVENT, readImage } from '@/lib/image-folder';

/** File name → the blob URL standing in for it. */
const urls = new Map<string, string>();

/** Names already looked for and not found, so a missing file is not re-read for ever. */
const missing = new Set<string>();

/** Names being read right now, so two cells asking at once make one read. */
const reading = new Set<string>();

/** File name → how many mounted cells are showing it, so a folder change knows
 *  which files are worth reading again and which are nobody's business now. */
const wanted = new Map<string, number>();

const listeners = new Set<() => void>();

/**
 * Bumped on every change to the maps above. The snapshot has to be a value that
 * changes, and the URL alone is not enough: a file that was missing and is now
 * readable goes from null to null as far as one cell can see.
 */
let version = 0;

function announce() {
  version += 1;
  for (const listener of listeners) listener();
}

/**
 * A different folder means different files, so everything is read afresh. Drive
 * being connected counts as one: every name that came back `missing` because
 * there was nowhere to read it from is worth another try, and on a phone that
 * is every picture on the page.
 */
function refresh() {
  for (const url of urls.values()) URL.revokeObjectURL(url);
  urls.clear();
  missing.clear();
  announce();

  for (const name of wanted.keys()) void load(name);
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);

  // Only the first subscriber wires this up; the last one takes it down again.
  if (listeners.size === 1 && typeof window !== 'undefined') {
    window.addEventListener(IMAGE_FOLDER_EVENT, refresh);
    window.addEventListener(DRIVE_IMAGES_EVENT, refresh);
  }

  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && typeof window !== 'undefined') {
      window.removeEventListener(IMAGE_FOLDER_EVENT, refresh);
      window.removeEventListener(DRIVE_IMAGES_EVENT, refresh);
    }
  };
}

async function load(name: string) {
  if (urls.has(name) || missing.has(name) || reading.has(name)) return;

  reading.add(name);
  try {
    const file = await readImage(name);
    if (file) urls.set(name, URL.createObjectURL(file));
    else missing.add(name);
  } finally {
    reading.delete(name);
  }

  announce();
}

export type FolderImageState = 'loading' | 'ready' | 'missing';

export interface FolderImage {
  /** The blob URL to hand to an `<img>`, or null until there is one. */
  url: string | null;
  state: FolderImageState;
}

/**
 * One picture out of the folder. A name that cannot be read comes back as
 * `missing` rather than as nothing at all — the cell still says a picture
 * belongs there, which is the honest thing to show when the folder has been
 * moved or the permission has lapsed.
 */
export function useFolderImage(name: string | null): FolderImage {
  // Subscribed for the counter rather than the URL: what is read below is the
  // map itself, and this is what says the map has moved.
  useSyncExternalStore(
    subscribe,
    () => version,
    () => 0
  );

  useEffect(() => {
    if (!name) return;

    wanted.set(name, (wanted.get(name) ?? 0) + 1);
    void load(name);

    return () => {
      const held = (wanted.get(name) ?? 1) - 1;
      if (held > 0) wanted.set(name, held);
      else wanted.delete(name);
    };
  }, [name]);

  const url = name ? (urls.get(name) ?? null) : null;
  if (url) return { url, state: 'ready' };

  return { url: null, state: name && missing.has(name) ? 'missing' : 'loading' };
}
