/**
 * Where a pasted screenshot is kept: a folder on this machine, a folder in
 * Google Drive, or — the useful case — both at once.
 *
 * Posts and tables live in localStorage, which is far too small to hold image
 * bytes: a handful of screenshots would fill the quota and take the whole site
 * down with it. So the bytes go somewhere real and what is stored is only the
 * file name (see `localImageSrc` in `lib/local-posts.ts`).
 *
 * Most of this file is that first somewhere — a folder the author picks once,
 * through the File System Access API, which only Chromium on a desktop has.
 * The handle is kept in IndexedDB because, unlike localStorage, it can store
 * one; the browser still decides whether the permission that came with it
 * survives a restart, so every read path is prepared to ask for it again.
 *
 * The second is `lib/drive-images.ts`, and it exists because that first one can
 * only ever be reached by one browser on one computer — a phone has no File
 * System Access API and no filesystem to point it at, so a screenshot pasted on
 * a laptop could not be seen anywhere else.
 *
 * `saveImage`, `readImage` and `deleteImage` at the bottom are the one door
 * everything else in the site goes through, and each consults **both**. That is
 * what makes the arrangement worth having: the name is the only thing a post or
 * a cell ever holds, the same name means the same picture in both folders, and
 * so a picture written on the desktop is written to the local folder for speed
 * and to Drive so that the phone can have it. A read tries the local folder
 * first for the same reason — it is instant, offline and costs nobody a token —
 * and falls back to Drive, which on a phone is the only answer there ever is.
 */

import { allTableImageNames } from '@/lib/documents';
import {
  deleteDriveImage,
  driveImageNames,
  driveImagesReady,
  readDriveImage,
  saveDriveImage,
} from '@/lib/drive-images';
import { getLocalPosts, isLocalImageName, localImageNamesIn } from '@/lib/local-posts';

// TypeScript's DOM library types the handles but not the picker that hands them
// out, so it is declared here rather than reached for through `any`.
declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      mode?: 'read' | 'readwrite';
      id?: string;
      startIn?: string;
    }) => Promise<FileSystemDirectoryHandle>;
  }
}

const DB_NAME = 'dvir-blog';
const DB_VERSION = 1;
const STORE = 'handles';
const HANDLE_KEY = 'image-folder';

/** Fired on `window` after the folder is picked or forgotten. */
export const IMAGE_FOLDER_EVENT = 'image-folder-changed';

export type FolderStatus =
  /** No File System Access API in this browser. */
  | 'unsupported'
  /** Supported, but no folder has been picked yet. */
  | 'none'
  /** A folder is remembered, but the browser wants permission again. */
  | 'needs-permission'
  /** Ready to read and write. */
  | 'ready';

/** The extensions a pasted image can land as, keyed by what the clipboard offers. */
const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

export function folderSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

/* -------------------------------------------------------------------------- */
/*  Remembering the handle                                                    */
/* -------------------------------------------------------------------------- */

function openDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) return Promise.resolve(null);

  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = window.indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    // Private mode, or a blocked upgrade — behave as if there were no folder.
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

/**
 * The handle, once loaded, is kept here. Reading an image goes through this on
 * every pass, and opening IndexedDB each time was enough work to be visible —
 * `undefined` means "not looked up yet", `null` means "looked up, nothing there".
 */
let cachedHandle: FileSystemDirectoryHandle | null | undefined;

function loadHandle(): Promise<FileSystemDirectoryHandle | null> {
  return openDb().then(
    (db) =>
      new Promise((resolve) => {
        if (!db) return resolve(null);

        try {
          const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(HANDLE_KEY);
          request.onsuccess = () => resolve((request.result as FileSystemDirectoryHandle) ?? null);
          request.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      })
  );
}

async function readHandle(): Promise<FileSystemDirectoryHandle | null> {
  if (cachedHandle !== undefined) return cachedHandle;

  cachedHandle = await loadHandle();
  return cachedHandle;
}

function writeHandle(handle: FileSystemDirectoryHandle | null): Promise<void> {
  cachedHandle = handle;

  return openDb().then(
    (db) =>
      new Promise((resolve) => {
        if (!db) return resolve();

        try {
          const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
          const request = handle ? store.put(handle, HANDLE_KEY) : store.delete(HANDLE_KEY);
          request.onsuccess = () => resolve();
          request.onerror = () => resolve();
        } catch {
          resolve();
        }
      })
  );
}

/* -------------------------------------------------------------------------- */
/*  Permission                                                                */
/* -------------------------------------------------------------------------- */

interface PermissionCapableHandle extends FileSystemDirectoryHandle {
  queryPermission?: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
}

/**
 * Whether the handle may be written to. `request` may only be true inside a
 * click: the browser refuses to prompt for permission outside a user gesture.
 */
async function hasPermission(handle: FileSystemDirectoryHandle, request: boolean): Promise<boolean> {
  const capable = handle as PermissionCapableHandle;

  try {
    if (typeof capable.queryPermission === 'function') {
      if ((await capable.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
    }

    if (request && typeof capable.requestPermission === 'function') {
      return (await capable.requestPermission({ mode: 'readwrite' })) === 'granted';
    }

    // Old builds without the permission methods: assume the handle still works
    // and let the first read or write be the thing that fails.
    return typeof capable.queryPermission !== 'function';
  } catch {
    return false;
  }
}

/** The handle, but only once it is actually usable. */
async function usableFolder(request = false): Promise<FileSystemDirectoryHandle | null> {
  const handle = await readHandle();
  if (!handle) return null;
  return (await hasPermission(handle, request)) ? handle : null;
}

export async function folderStatus(): Promise<FolderStatus> {
  if (!folderSupported()) return 'unsupported';

  const handle = await readHandle();
  if (!handle) return 'none';

  return (await hasPermission(handle, false)) ? 'ready' : 'needs-permission';
}

/** The folder's display name, for showing which one is connected. */
export async function folderName(): Promise<string | null> {
  const handle = await readHandle();
  return handle?.name ?? null;
}

function announce() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(IMAGE_FOLDER_EVENT));
}

/** Opens the browser's folder picker. Must be called from a click. */
export async function pickFolder(): Promise<FolderStatus> {
  const picker = typeof window !== 'undefined' ? window.showDirectoryPicker : undefined;
  if (!picker) return 'unsupported';

  try {
    const handle = await picker.call(window, { mode: 'readwrite', id: 'dvir-blog-images' });
    if (!(await hasPermission(handle, true))) return 'needs-permission';

    await writeHandle(handle);
    announce();
    return 'ready';
  } catch {
    // The picker was dismissed, which is not an error worth reporting.
    return folderStatus();
  }
}

/** Asks again for a folder already chosen. Must be called from a click. */
export async function reconnectFolder(): Promise<FolderStatus> {
  const handle = await readHandle();
  if (!handle) return folderStatus();

  const granted = await hasPermission(handle, true);
  announce();
  return granted ? 'ready' : 'needs-permission';
}

/** Forgets the folder. Nothing inside it is touched. */
export async function forgetFolder(): Promise<void> {
  await writeHandle(null);
  announce();
}

/* -------------------------------------------------------------------------- */
/*  Files in the folder on this machine                                       */
/* -------------------------------------------------------------------------- */

function makeImageName(type: string): string {
  const extension = EXTENSION_BY_TYPE[type] ?? 'png';
  return `paste-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
}

async function writeLocalImage(name: string, blob: Blob): Promise<boolean> {
  const folder = await usableFolder();
  if (!folder) return false;

  try {
    const file = await folder.getFileHandle(name, { create: true });
    const writable = await file.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  } catch {
    // Folder moved, permission withdrawn, disk full — the paste just does not stick.
    return false;
  }
}

async function readLocalImage(name: string): Promise<File | null> {
  const folder = await usableFolder();
  if (!folder) return null;

  try {
    return await (await folder.getFileHandle(name)).getFile();
  } catch {
    // Deleted from under us, or never written.
    return null;
  }
}

async function deleteLocalImage(name: string): Promise<boolean> {
  const folder = await usableFolder();
  if (!folder) return false;

  try {
    await folder.removeEntry(name);
    return true;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/*  The one door, over both folders                                           */
/* -------------------------------------------------------------------------- */

/**
 * Writes a pasted image and gives back its file name, or null if there was
 * nowhere at all to put it.
 *
 * The name is minted **before** either write, rather than by whichever store
 * happens to take it, because the whole scheme rests on one name meaning one
 * picture in both places — two names for the same paste would be two pictures,
 * one of which no device but this one could ever show.
 *
 * Either store succeeding is enough. A desktop with no Drive connected carries
 * on exactly as it did; a phone, which can never have the local folder, is the
 * same case said the other way round.
 */
export async function saveImage(blob: Blob): Promise<string | null> {
  const name = makeImageName(blob.type);
  if (!isLocalImageName(name)) return null;

  // Both are started before either is waited on: the upload is a network round
  // trip and the local write is not, and a paste should not take the sum.
  const [local, drive] = await Promise.all([
    writeLocalImage(name, blob),
    driveImagesReady() ? saveDriveImage(name, blob) : Promise.resolve(false),
  ]);

  return local || drive ? name : null;
}

/**
 * Reads one image back. The local folder first — it is instant and offline —
 * and then Drive, which is where a picture made on another device is.
 */
export async function readImage(name: string): Promise<File | null> {
  if (!isLocalImageName(name)) return null;

  return (await readLocalImage(name)) ?? (await readDriveImage(name));
}

/**
 * Deletes one image from wherever it is. Only ever called with a name the post
 * or the table itself put there and that nothing remaining refers to, so
 * nothing the author dropped in the folder by hand is at risk.
 *
 * True when either store had it: a picture that only ever reached Drive is
 * still a picture that has now gone.
 */
export async function deleteImage(name: string): Promise<boolean> {
  if (!isLocalImageName(name)) return false;

  const [local, drive] = await Promise.all([
    deleteLocalImage(name),
    driveImagesReady() ? deleteDriveImage(name) : Promise.resolve(false),
  ]);

  return local || drive;
}

/**
 * Every file anything in this browser is still pointing at — every saved post
 * and every cell of every table. One folder holds the screenshots for both, and
 * a file is only ever safe to delete once neither of them wants it.
 */
function stillUsedNames(): Set<string> {
  const names = allTableImageNames();
  for (const post of getLocalPosts()) {
    for (const name of localImageNamesIn(post.contentHtml)) names.add(name);
  }

  return names;
}

/** Deletes each of `dropped` that nothing else refers to any more. */
async function discardNames(dropped: readonly string[]): Promise<string[]> {
  if (dropped.length === 0) return [];

  const stillUsed = stillUsedNames();

  const removed: string[] = [];
  for (const name of dropped) {
    if (stillUsed.has(name)) continue;
    if (await deleteImage(name)) removed.push(name);
  }

  return removed;
}

/**
 * Deletes the images a post has just stopped using. Call it after the new
 * version is saved, so the sweep below sees it.
 *
 * Two things keep this from taking something it should not. Only names the
 * previous version of *this* post carried are ever considered, so a file the
 * author dropped in the folder by hand is never a candidate; and each one is
 * then checked against everything still using the folder, so an image used in
 * two places survives being cut from one of them.
 */
export async function discardUnusedImages(previousHtml: string, nextHtml: string): Promise<string[]> {
  const before = localImageNamesIn(previousHtml);
  if (before.size === 0) return [];

  const after = localImageNamesIn(nextHtml);
  return discardNames([...before].filter((name) => !after.has(name)));
}

/**
 * The same sweep for a table: the pictures a cell, a row, a column or a whole
 * table was holding just before it went. Call it *after* the change is written,
 * so a name still wanted by what remains is seen to be wanted — and so the
 * duplicate of a row, which points at the very same files, keeps its pictures
 * when the original is deleted.
 */
export async function discardTableImages(names: readonly string[]): Promise<string[]> {
  return discardNames(names);
}

/* -------------------------------------------------------------------------- */
/*  Catching Drive up                                                         */
/* -------------------------------------------------------------------------- */

export interface DriveSync {
  /** How many pictures went up. */
  sent: number;
  /** How many were already there, so nothing was done about them. */
  already: number;
  /** Names that could not be read from the local folder or would not upload. */
  failed: number;
}

/**
 * Sends every picture this browser is still using that Drive has not got.
 *
 * Connecting Drive does nothing on its own for the screenshots pasted before it
 * was connected — they are in a folder on this machine and nowhere else — and a
 * feature whose whole purpose is that the phone can see the pictures would be a
 * poor one if it only ever meant the pictures taken from today onwards. This is
 * that catch-up, and it has to be asked for rather than happening quietly: it
 * is somebody's Drive and possibly a hundred files.
 *
 * Only names something still points at are considered — the same set the sweep
 * uses — so a file the author dropped into the folder by hand is not uploaded
 * to their Drive, and neither is one belonging to a post that has been deleted.
 * Uploads go one at a time on purpose: fifty at once is how a browser starts
 * dropping them and how Drive starts answering 403.
 */
export async function sendPicturesToDrive(): Promise<DriveSync> {
  const result: DriveSync = { sent: 0, already: 0, failed: 0 };
  if (!driveImagesReady()) return result;

  const there = await driveImageNames();

  for (const name of stillUsedNames()) {
    if (there.has(name)) {
      result.already += 1;
      continue;
    }

    const file = await readLocalImage(name);
    if (!file) {
      // Not in Drive and not on this machine either, so there is nothing to
      // send: the local folder has been moved or its permission has lapsed, or
      // the file really is gone and the cell pointing at it is already broken.
      result.failed += 1;
      continue;
    }

    if (await saveDriveImage(name, file)) result.sent += 1;
    else result.failed += 1;
  }

  return result;
}
