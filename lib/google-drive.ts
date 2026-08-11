/**
 * Reading a backup file out of Google Drive, in the browser and nowhere else.
 *
 * There is still no server behind any of this. Google's own file browser (the
 * Picker) opens over the page, the person picks the file with their own Drive
 * session, and the bytes come back to *this tab* over `fetch`. Nothing about the
 * file, and no token, ever reaches this site's own origin.
 *
 * The scope is `drive.file`, which is the narrow one: it grants access to the
 * files somebody picked by hand and to nothing else in their Drive. That is the
 * whole reason this goes through the Picker rather than listing a folder — a
 * listing needs `drive.readonly`, which is the whole Drive, for a page that
 * wants one JSON file.
 *
 * Both Google scripts are fetched on demand (see `prepareDrivePicker`), so a
 * visitor who never touches the button never contacts Google at all.
 */

/* -------------------------------------------------------------------------- */
/*  Configuration                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The browser needs the client id itself, so this is the `NEXT_PUBLIC_` twin of
 * `GOOGLE_CLIENT_ID` rather than a second client. Both are public by nature —
 * a client id is in every OAuth redirect — and the secret stays on the server.
 */
const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';

/** A browser API key, restricted to this site's origin in the Cloud Console. */
const DEVELOPER_KEY = process.env.NEXT_PUBLIC_GOOGLE_PICKER_KEY ?? '';

/** Only the files this person picks, and only for as long as the token lives. */
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

/**
 * What the Picker will show. A `.json` uploaded to Drive is usually
 * `application/json`, but Drive labels one that arrived from a phone or a chat
 * `text/plain` or `application/octet-stream` — and a backup nobody can see is
 * worse than a stray file in the list.
 */
const PICKER_MIME_TYPES = 'application/json,text/plain,application/octet-stream';

/**
 * A backup of everything this site stores is a few hundred KB. Anything past
 * this is not one, and reading it would only give `parseBackup` a megabyte of
 * text to fail on.
 */
const MAX_BYTES = 20 * 1024 * 1024;

const GSI_SRC = 'https://accounts.google.com/gsi/client';
const GAPI_SRC = 'https://apis.google.com/js/api.js';

/** False when the two public values are missing, which is how the page hides the button. */
export function driveConfigured(): boolean {
  return CLIENT_ID !== '' && DEVELOPER_KEY !== '';
}

/**
 * The Cloud project number, which the Picker needs to hand a `drive.file` app
 * access to what was picked. It is the part of the client id before the dash,
 * so it is not worth a third environment variable to state twice.
 */
function appId(): string {
  return CLIENT_ID.split('-')[0] ?? '';
}

/* -------------------------------------------------------------------------- */
/*  The shapes of the two Google globals                                      */
/* -------------------------------------------------------------------------- */

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}

/** Why the token popup ended without a token. */
interface TokenError {
  type?: string;
}

interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void;
}

interface PickerView {
  setMimeTypes(types: string): PickerView;
  setIncludeFolders(include: boolean): PickerView;
  setSelectFolderEnabled(enabled: boolean): PickerView;
}

/** What a picked file looks like in the callback. */
interface PickerDocument {
  id?: string;
  name?: string;
  sizeBytes?: string | number;
}

interface PickerResponse {
  action?: string;
  docs?: PickerDocument[];
}

interface Picker {
  setVisible(visible: boolean): void;
  dispose?(): void;
}

interface PickerBuilder {
  addView(view: PickerView): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setAppId(id: string): PickerBuilder;
  setTitle(title: string): PickerBuilder;
  setCallback(callback: (response: PickerResponse) => void): PickerBuilder;
  build(): Picker;
}

interface PickerNamespace {
  PickerBuilder: new () => PickerBuilder;
  DocsView: new (viewId?: unknown) => PickerView;
  ViewId: { DOCS: unknown };
  Action: { PICKED: string; CANCEL: string };
}

type DriveWindow = Window & {
  gapi?: { load(name: string, callback: () => void): void };
  google?: {
    picker?: PickerNamespace;
    accounts?: {
      oauth2?: {
        initTokenClient(config: {
          client_id: string;
          scope: string;
          prompt?: string;
          callback: (response: TokenResponse) => void;
          error_callback?: (error: TokenError) => void;
        }): TokenClient;
      };
    };
  };
};

function driveWindow(): DriveWindow | null {
  return typeof window === 'undefined' ? null : (window as DriveWindow);
}

/* -------------------------------------------------------------------------- */
/*  Loading the scripts                                                       */
/* -------------------------------------------------------------------------- */

/** One promise per src, so two clicks do not put two tags in the head. */
const loading = new Map<string, Promise<void>>();

function loadScript(src: string): Promise<void> {
  const existing = loading.get(src);
  if (existing) return existing;

  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      // Let a later click try again rather than caching the failure forever:
      // this is usually a dropped connection or a blocker, both of which pass.
      loading.delete(src);
      reject(new Error(`Could not load ${src}`));
    };
    document.head.appendChild(script);
  });

  loading.set(src, promise);
  return promise;
}

let pickerReady: Promise<PickerNamespace> | null = null;

/** `gapi.load` is the only way to get at `google.picker`; it is not in api.js itself. */
function loadPicker(): Promise<PickerNamespace> {
  if (pickerReady) return pickerReady;

  pickerReady = loadScript(GAPI_SRC)
    .then(
      () =>
        new Promise<PickerNamespace>((resolve, reject) => {
          const win = driveWindow();
          const gapi = win?.gapi;
          if (!gapi) {
            reject(new Error('Google’s script loaded but left nothing behind.'));
            return;
          }

          gapi.load('picker', () => {
            const picker = driveWindow()?.google?.picker;
            if (picker) resolve(picker);
            else reject(new Error('Google’s file picker did not finish loading.'));
          });
        })
    )
    .catch((problem: unknown) => {
      pickerReady = null;
      throw problem;
    });

  return pickerReady;
}

/**
 * Fetch both scripts ahead of the click. The token popup has to open inside the
 * gesture that asked for it or the browser blocks it as a pop-up, and a cold
 * fetch of two Google scripts is long enough to lose that. The page calls this
 * when the button is hovered or focused, which is early enough and still never
 * for somebody who does not go near it.
 */
export function prepareDrivePicker(): void {
  if (!driveConfigured() || !driveWindow()) return;

  void loadPicker().catch(() => {
    // Nothing to say yet — the click will raise it properly.
  });
  void loadScript(GSI_SRC).catch(() => {});
}

/* -------------------------------------------------------------------------- */
/*  The token                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Held in memory only, and only for this tab: putting a Drive token in
 * localStorage would leave it lying around long after the visit, next to the
 * data it is there to fetch. A reload asks again.
 */
let token: { value: string; expiresAt: number } | null = null;

/** A minute of slack, so a token cannot expire between here and the fetch. */
function liveToken(): string | null {
  if (!token) return null;
  return token.expiresAt - 60_000 > Date.now() ? token.value : null;
}

/** Null when the person closed the popup rather than something going wrong. */
async function requestToken(): Promise<string | null> {
  const cached = liveToken();
  if (cached) return cached;

  await loadScript(GSI_SRC);

  const oauth2 = driveWindow()?.google?.accounts?.oauth2;
  if (!oauth2) throw new Error('Google’s sign-in script loaded but left nothing behind.');

  return new Promise<string | null>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (!response.access_token) {
          // `access_denied` is somebody saying no on the consent screen, which
          // is an answer and not a fault.
          if (response.error === 'access_denied') resolve(null);
          else reject(new Error('Google would not give this page permission to read the file.'));
          return;
        }

        token = {
          value: response.access_token,
          expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000,
        };
        resolve(response.access_token);
      },
      error_callback: (problem) => {
        if (problem.type === 'popup_closed') resolve(null);
        else if (problem.type === 'popup_failed_to_open')
          reject(
            new Error(
              'The Google window could not open — this browser is blocking pop-ups for this site.'
            )
          );
        else reject(new Error('Google’s permission window closed without an answer.'));
      },
    });

    client.requestAccessToken();
  });
}

/* -------------------------------------------------------------------------- */
/*  Picking, and reading what was picked                                      */
/* -------------------------------------------------------------------------- */

/** The file that was chosen, read as text and ready for `parseBackup`. */
export interface DrivePick {
  name: string;
  text: string;
}

/** Null when the Picker was closed without a choice. */
function showPicker(picker: PickerNamespace, accessToken: string): Promise<PickerDocument | null> {
  return new Promise<PickerDocument | null>((resolve) => {
    const view = new picker.DocsView(picker.ViewId.DOCS)
      .setMimeTypes(PICKER_MIME_TYPES)
      // Folders are shown so a Drive kept in folders can be walked down into,
      // but a folder itself is not a thing to load.
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false);

    new picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(accessToken)
      .setDeveloperKey(DEVELOPER_KEY)
      .setAppId(appId())
      .setTitle('Pick a backup file')
      .setCallback((response) => {
        if (response.action === picker.Action.PICKED) {
          resolve(response.docs?.[0] ?? null);
        } else if (response.action === picker.Action.CANCEL) {
          resolve(null);
        }
        // Any other action ('loaded') is the dialog getting on with itself.
      })
      .build()
      .setVisible(true);
  });
}

/** Drive hands the bytes straight to this tab; `alt=media` is the file itself. */
async function readFile(id: string, accessToken: string): Promise<string> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      // The token is the likely suspect, so the next attempt asks for a new one.
      token = null;
      throw new Error('Google would not hand over that file. Try picking it again.');
    }
    if (response.status === 404) {
      throw new Error('That file is no longer in the Drive account you picked it from.');
    }
    throw new Error(`Drive answered with ${response.status} instead of the file.`);
  }

  return response.text();
}

/**
 * Open Drive, let one file be picked, and come back with its text.
 *
 * Resolves to `null` when nothing was picked — a closed dialog or a declined
 * permission is an answer, and the page should say nothing at all. Everything
 * that actually went wrong throws with a sentence the page can show as it is.
 */
export async function pickBackupFile(): Promise<DrivePick | null> {
  if (!driveWindow()) return null;
  if (!driveConfigured()) {
    throw new Error(
      'This copy of the site has no Google keys set, so Drive cannot be opened from here.'
    );
  }

  const picker = await loadPicker();
  const accessToken = await requestToken();
  if (accessToken === null) return null;

  const picked = await showPicker(picker, accessToken);
  if (!picked?.id) return null;

  if (Number(picked.sizeBytes ?? 0) > MAX_BYTES) {
    throw new Error('That file is far too big to be one of these backups.');
  }

  return {
    name: picked.name ?? 'A file from Drive',
    text: await readFile(picked.id, accessToken),
  };
}
