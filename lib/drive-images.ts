/**
 * The folder in Google Drive where pictures are kept so that two devices can
 * see the same ones.
 *
 * `lib/image-folder.ts` writes to a folder on the machine, which is fast, works
 * offline and never asks anybody for anything — and is reachable by exactly one
 * browser on exactly one computer. It leans on the File System Access API,
 * which no phone has at all, so a picture pasted on a laptop could never appear
 * on a phone however the folders were arranged. Pointing that folder at a
 * synced Drive folder does not help either: the sync happens on the desktop's
 * filesystem, and the phone's browser has no filesystem to read.
 *
 * So this is the other half. The bytes go to Drive itself over `fetch`, into a
 * folder this app makes, and any device signed into the same Google account can
 * read them back. It is still not a backend — there is no server of this site's
 * in the path, and the token never leaves the tab (see `lib/google-drive.ts`).
 *
 * The scope is the same narrow `drive.file` the backup file already uses, which
 * is worth being precise about because it is what makes this possible without
 * asking for anything more: `drive.file` grants access to files the *app made*
 * as well as files somebody picked by hand. Every file here is one this app
 * made, so it can list them, read them, add to them and remove them, and it can
 * still see nothing else in the Drive at all. That is also why the folder is
 * found by listing rather than by the Picker: listing under this scope returns
 * only this app's own files, which is precisely the folder and its contents.
 *
 * What is stored on the device is only the folder's id, as a shortcut, and
 * whether Drive was connected here before. Neither is needed for correctness —
 * a device with neither finds the same folder by name on the next connect.
 */

import { isLocalImageName } from '@/lib/local-posts';
import {
  driveSignInConfigured,
  driveToken,
  forgetDriveToken,
  requestDriveToken,
} from '@/lib/google-drive';

/** Fired on `window` when Drive is connected, disconnected, or gains a picture. */
export const DRIVE_IMAGES_EVENT = 'drive-images-changed';

/**
 * What the folder is called in Drive. It is a real folder in the real Drive
 * rather than the hidden `appDataFolder`, so that somebody can open it, look at
 * the pictures and back them up like anything else they own.
 */
export const DRIVE_FOLDER_NAME = 'Dvir app pictures';

const FOLDER_KEY = 'dvir-drive-images:folder';
const CONNECTED_KEY = 'dvir-drive-images:connected';

const FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

export type DriveStatus =
  /** No `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, so there is nothing to connect to. */
  | 'unconfigured'
  /** Configured, but this device has never connected. Nobody has opted in. */
  | 'off'
  /** Connected before; this tab has no token yet. A reload always lands here. */
  | 'disconnected'
  /** A live token and a folder. Pictures travel. */
  | 'connected';

/* -------------------------------------------------------------------------- */
/*  What the device remembers                                                 */
/* -------------------------------------------------------------------------- */

function readFlag(key: string): string | null {
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeFlag(key: string, value: string | null) {
  if (typeof window === 'undefined') return;

  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Private mode or a full quota. Both only cost a slower next connect.
  }
}

function announce() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(DRIVE_IMAGES_EVENT));
}

/** Whether somebody has ever connected Drive on this device. */
export function driveImagesChosen(): boolean {
  return readFlag(CONNECTED_KEY) === 'yes';
}

export function driveImagesStatus(): DriveStatus {
  if (!driveSignInConfigured()) return 'unconfigured';
  if (!driveImagesChosen()) return 'off';
  return driveToken() ? 'connected' : 'disconnected';
}

/* -------------------------------------------------------------------------- */
/*  Talking to Drive                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Every request goes through here so that a 401 has one meaning in one place:
 * the token has gone stale, and the next attempt should ask for a fresh one
 * rather than going on failing with the old one.
 */
async function driveFetch(url: string, init: RequestInit, token: string): Promise<Response | null> {
  let response: Response;

  try {
    response = await fetch(url, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
    });
  } catch {
    // Offline, or a blocker. Nothing to say that the caller cannot say better.
    return null;
  }

  if (response.status === 401) {
    forgetDriveToken();
    announce();
    return null;
  }

  return response.ok ? response : null;
}

/** Drive's answers are JSON, and JSON off a network is not to be trusted into a type. */
async function readBody(response: Response): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await response.json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function text(body: Record<string, unknown>, key: string): string | null {
  const value = body[key];
  return typeof value === 'string' && value !== '' ? value : null;
}

async function readId(response: Response): Promise<string | null> {
  return text(await readBody(response), 'id');
}

/* -------------------------------------------------------------------------- */
/*  The folder                                                                */
/* -------------------------------------------------------------------------- */

/** Held for the tab, so the folder is looked up once however many pictures load. */
let folder: string | null = null;

async function findFolder(token: string): Promise<string | null> {
  const query = `mimeType='${FOLDER_MIME}' and name='${DRIVE_FOLDER_NAME}' and trashed=false`;
  const response = await driveFetch(
    `${FILES_URL}?q=${encodeURIComponent(query)}&fields=files(id)&pageSize=10&spaces=drive`,
    { method: 'GET' },
    token
  );
  if (!response) return null;

  const files = await readBody(response).then((body) => body.files);
  if (!Array.isArray(files)) return null;

  const first: unknown = files[0];
  return first && typeof first === 'object' ? text(first as Record<string, unknown>, 'id') : null;
}

async function makeFolder(token: string): Promise<string | null> {
  const response = await driveFetch(
    `${FILES_URL}?fields=id`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: DRIVE_FOLDER_NAME, mimeType: FOLDER_MIME }),
    },
    token
  );

  return response ? readId(response) : null;
}

/** Whether the remembered id is still a folder that exists and is not in the bin. */
async function folderStillThere(id: string, token: string): Promise<boolean> {
  const response = await driveFetch(
    `${FILES_URL}/${encodeURIComponent(id)}?fields=id,trashed`,
    { method: 'GET' },
    token
  );
  if (!response) return false;

  return (await readBody(response)).trashed !== true;
}

/**
 * The folder id, finding it or making it as needed.
 *
 * The stored id is a shortcut and never the truth: a folder deleted from Drive,
 * or an id from a different Google account, has to end in the folder being
 * found again rather than in every picture failing for ever. That is also what
 * makes a second device work with nothing copied to it — the name is the thing
 * both devices agree on.
 */
async function folderFor(token: string): Promise<string | null> {
  if (folder) return folder;

  const remembered = readFlag(FOLDER_KEY);
  if (remembered && (await folderStillThere(remembered, token))) {
    folder = remembered;
    return folder;
  }

  const found = (await findFolder(token)) ?? (await makeFolder(token));
  if (!found) return null;

  folder = found;
  writeFlag(FOLDER_KEY, found);
  return found;
}

/* -------------------------------------------------------------------------- */
/*  What is in it                                                             */
/* -------------------------------------------------------------------------- */

/**
 * File name → Drive's id for it. Drive addresses a file by an opaque id, and a
 * table cell holds a name, so something has to stand between them. Listing the
 * folder once per tab is far cheaper than a search per picture, and a name that
 * turns out to be missing is the one case worth listing again — another device
 * may have added it since this tab looked.
 */
let index: Map<string, string> | null = null;

async function listFolder(token: string): Promise<Map<string, string>> {
  const found = new Map<string, string>();

  const id = await folderFor(token);
  if (!id) return found;

  const query = `'${id}' in parents and trashed=false`;
  let pageToken: string | null = null;

  // A folder of screenshots can outgrow one page, and a picture missing because
  // it was the 1001st is a bug nobody would ever guess at.
  do {
    const page = `${FILES_URL}?q=${encodeURIComponent(query)}&fields=nextPageToken,files(id,name)&pageSize=1000&spaces=drive${
      pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''
    }`;

    const response = await driveFetch(page, { method: 'GET' }, token);
    if (!response) break;

    const body = await readBody(response);
    for (const file of Array.isArray(body.files) ? (body.files as unknown[]) : []) {
      if (!file || typeof file !== 'object') continue;

      const record = file as Record<string, unknown>;
      const name = text(record, 'name');
      const fileId = text(record, 'id');
      if (name && fileId) found.set(name, fileId);
    }

    pageToken = text(body, 'nextPageToken');
  } while (pageToken);

  return found;
}

/** The listing, taken once and then kept up to date by hand as files come and go. */
async function indexFor(token: string, refresh = false): Promise<Map<string, string>> {
  if (index && !refresh) return index;

  index = await listFolder(token);
  return index;
}

/* -------------------------------------------------------------------------- */
/*  Connecting                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Ask for the token and settle the folder. Must be called from a click: the
 * permission window has to open inside the gesture that asked for it or the
 * browser takes it for a pop-up.
 *
 * Throws with a sentence worth showing when something actually went wrong, and
 * comes back `off`/`disconnected` when the answer was simply no.
 */
export async function connectDriveImages(): Promise<DriveStatus> {
  if (!driveSignInConfigured()) {
    throw new Error(
      'This copy of the site has no Google client id set, so Drive cannot be opened from here.'
    );
  }

  const token = await requestDriveToken();
  if (token === null) return driveImagesStatus();

  const id = await folderFor(token);
  if (!id) {
    throw new Error('Google gave permission but would not open the pictures folder.');
  }

  writeFlag(CONNECTED_KEY, 'yes');
  await indexFor(token, true);
  announce();

  return 'connected';
}

/**
 * Let the token and the folder go. Nothing in Drive is touched — the pictures
 * stay exactly where they are, and connecting again on this device or another
 * finds the same folder by name.
 */
export function disconnectDriveImages(): void {
  forgetDriveToken();
  folder = null;
  index = null;
  writeFlag(CONNECTED_KEY, null);
  writeFlag(FOLDER_KEY, null);
  announce();
}

/* -------------------------------------------------------------------------- */
/*  Files                                                                     */
/* -------------------------------------------------------------------------- */

/** The token, but only when Drive is meant to be in use at all. */
function activeToken(): string | null {
  return driveImagesChosen() ? driveToken() : null;
}

/** Whether a picture can be written to or read from Drive right now. */
export function driveImagesReady(): boolean {
  return activeToken() !== null;
}

/**
 * One picture, uploaded under the name the table already knows it by.
 *
 * The name is the whole scheme: a cell stores a file name, so the same name has
 * to name the same picture in the folder on the machine and in the folder in
 * Drive. Nothing is renamed on the way in, and a name already there is left
 * alone rather than uploaded twice — the names carry enough randomness that a
 * collision is the same picture arriving from the device that made it.
 */
export async function saveDriveImage(name: string, blob: Blob): Promise<boolean> {
  if (!isLocalImageName(name)) return false;

  const token = activeToken();
  if (!token) return false;

  const known = await indexFor(token);
  if (known.has(name)) return true;

  const id = await folderFor(token);
  if (!id) return false;

  const boundary = `dvir-${Math.random().toString(36).slice(2)}`;
  const metadata = JSON.stringify({ name, parents: [id] });
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    `--${boundary}\r\nContent-Type: ${blob.type || 'application/octet-stream'}\r\n\r\n`,
    blob,
    `\r\n--${boundary}--\r\n`,
  ]);

  const response = await driveFetch(
    `${UPLOAD_URL}?uploadType=multipart&fields=id`,
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    },
    token
  );
  if (!response) return false;

  const uploaded = await readId(response);
  if (!uploaded) return false;

  known.set(name, uploaded);
  return true;
}

/** One picture read back out of Drive, at the full resolution it was stored at. */
export async function readDriveImage(name: string): Promise<File | null> {
  if (!isLocalImageName(name)) return null;

  const token = activeToken();
  if (!token) return null;

  let id = (await indexFor(token)).get(name);
  if (!id) {
    // Another device may have added it since this tab listed the folder, which
    // is the ordinary case rather than an odd one: it is the whole point.
    id = (await indexFor(token, true)).get(name);
    if (!id) return null;
  }

  const response = await driveFetch(
    `${FILES_URL}/${encodeURIComponent(id)}?alt=media`,
    { method: 'GET' },
    token
  );
  if (!response) return null;

  try {
    const blob = await response.blob();
    return new File([blob], name, { type: blob.type });
  } catch {
    return null;
  }
}

/**
 * One picture into Drive's bin rather than out of existence.
 *
 * The local folder deletes outright, because a file there is one this app wrote
 * into a folder somebody chose and can see. Drive has a bin that costs nothing
 * and holds for thirty days, and the sweep that calls this runs from a cell
 * being cleared — on the other device, quite possibly, from a table restored
 * out of a backup that was a fortnight old.
 */
export async function deleteDriveImage(name: string): Promise<boolean> {
  if (!isLocalImageName(name)) return false;

  const token = activeToken();
  if (!token) return false;

  const known = await indexFor(token);
  const id = known.get(name);
  if (!id) return false;

  const response = await driveFetch(
    `${FILES_URL}/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true }),
    },
    token
  );
  if (!response) return false;

  known.delete(name);
  return true;
}

/** Every picture name Drive is holding, for working out what has yet to travel. */
export async function driveImageNames(): Promise<Set<string>> {
  const token = activeToken();
  if (!token) return new Set();

  return new Set((await indexFor(token, true)).keys());
}
