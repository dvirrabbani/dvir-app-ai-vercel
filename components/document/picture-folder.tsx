'use client';

/**
 * Where the pictures pasted into a table are kept, and the controls for saying
 * so.
 *
 * There are two places and they are not alternatives. The folder on this
 * machine (`lib/image-folder.ts`) is instant, offline and private, and can be
 * reached by exactly this browser on exactly this computer. The folder in Drive
 * (`lib/drive-images.ts`) is the one a phone can see, which is the only reason
 * it exists. Connected together, a screenshot pasted at the desk is on the
 * phone on the train, and the same file name means the same picture in both.
 *
 * Only the controls are written again here rather than borrowed from the blog:
 * they live inside the post editor's toolbar, wired to its own notices and
 * menus, and prising them out of it to gain a button is a worse trade than a
 * dozen lines.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Cloud, CloudOff, FolderOpen, Upload } from 'lucide-react';
import {
  DRIVE_IMAGES_EVENT,
  DriveStatus,
  connectDriveImages,
  disconnectDriveImages,
  driveImagesStatus,
} from '@/lib/drive-images';
import { prepareDriveSignIn } from '@/lib/google-drive';
import {
  FolderStatus,
  IMAGE_FOLDER_EVENT,
  folderName,
  folderStatus,
  folderSupported,
  forgetFolder,
  pickFolder,
  reconnectFolder,
  saveImage,
  sendPicturesToDrive,
} from '@/lib/image-folder';

/** Literal greys: `text-muted-foreground` resolves to nothing in this project. */
const MUTED = 'text-[#4B5563] dark:text-[#9CA3AF]';
const SOLID = 'text-[#171717] dark:text-[#FAFAFA]';
const LINE = 'border-black/10 dark:border-white/10';
/** For the one state that is somebody's to fix: a permission that has lapsed. */
const WANTING = 'text-[#B26A00] dark:text-[#FFCC80]';

export interface FolderState {
  status: FolderStatus;
  /** The folder's own name, for saying which one is connected. */
  label: string | null;
  /** Whether the Drive half is off, waiting to be connected, or working. */
  drive: DriveStatus;
}

/** Which folders are connected, kept up to date as they are picked or connected. */
export function useFolderState(): FolderState {
  const [state, setState] = useState<FolderState>({
    status: 'none',
    label: null,
    drive: 'unconfigured',
  });

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      const [status, label] = await Promise.all([folderStatus(), folderName()]);
      if (!cancelled) setState({ status, label, drive: driveImagesStatus() });
    };

    void refresh();
    const onChange = () => void refresh();
    window.addEventListener(IMAGE_FOLDER_EVENT, onChange);
    window.addEventListener(DRIVE_IMAGES_EVENT, onChange);

    return () => {
      cancelled = true;
      window.removeEventListener(IMAGE_FOLDER_EVENT, onChange);
      window.removeEventListener(DRIVE_IMAGES_EVENT, onChange);
    };
  }, []);

  return state;
}

/** Whether a picture pasted right now would have anywhere at all to land. */
export function picturesWork({ status, drive }: FolderState): boolean {
  return status === 'ready' || drive === 'connected';
}

/** What the local folder's state means, said once so every caller agrees. */
function localMessage({ status, label }: FolderState): string {
  switch (status) {
    case 'unsupported':
      return 'This browser cannot write to a folder on the machine — that needs Chrome or Edge on a computer.';
    case 'none':
      return 'No folder chosen on this machine yet.';
    case 'needs-permission':
      return `“${label}” needs permission again before anything can be written to it.`;
    case 'ready':
      return `Pictures are kept in “${label}” on this machine.`;
  }
}

/** The same for the Drive half. */
function driveMessage(drive: DriveStatus): string {
  switch (drive) {
    case 'unconfigured':
      return 'This copy of the site has no Google keys set, so Drive cannot be used from here.';
    case 'off':
      return 'Drive is not connected, so pictures stay on this device.';
    case 'disconnected':
      return 'Connect Drive again to see the pictures kept there — a reload always asks afresh.';
    case 'connected':
      return 'Pictures also go to Drive, so other devices can see them.';
  }
}

/**
 * One line for a tooltip or a footnote. The urgent half leads: a lapsed
 * permission or a Drive waiting to be reconnected is the thing worth reading,
 * and burying it under a sentence about the half that is working is how
 * somebody ends up wondering why their pictures are missing.
 */
export function folderMessage(state: FolderState): string {
  if (state.status === 'needs-permission') return localMessage(state);
  if (state.drive === 'disconnected') return driveMessage(state.drive);
  if (state.status === 'ready') {
    return state.drive === 'connected'
      ? `${localMessage(state)} They go to Drive as well, so other devices can see them.`
      : localMessage(state);
  }

  return state.drive === 'connected' ? driveMessage(state.drive) : localMessage(state);
}

/**
 * A pasted or dropped picture, written wherever there is to write it. Comes
 * back with the file name to store against the cell, or with the reason it
 * could not be kept — which is always something the person can act on, never a
 * silent failure.
 */
export async function keepPicture(
  blob: Blob
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const drive = driveImagesStatus();
  const local = folderSupported() ? await folderStatus() : 'unsupported';

  if (local !== 'ready' && drive !== 'connected') {
    return { ok: false, error: nowhereToPutIt(local, drive) };
  }

  const name = await saveImage(blob);
  if (!name) return { ok: false, error: 'That picture could not be written anywhere.' };

  return { ok: true, name };
}

/** The refusal, worded for whichever of the two is the nearer thing to fix. */
function nowhereToPutIt(local: FolderStatus, drive: DriveStatus): string {
  if (drive === 'disconnected') {
    return local === 'unsupported'
      ? 'Connect Google Drive to keep pictures — this browser cannot write to a folder on the device.'
      : 'Connect Google Drive again, or choose a folder on this machine, before pasting a picture.';
  }

  switch (local) {
    case 'unsupported':
      return 'This browser cannot write to a folder, so pictures need Google Drive connected — or Chrome or Edge on a computer.';
    case 'needs-permission':
      return 'Reconnect the picture folder before pasting into it.';
    default:
      return 'Choose a folder to keep pictures in, or connect Google Drive, first.';
  }
}

/** The image on the clipboard or on what was dropped, if there is one. */
export function imageFrom(data: DataTransfer | null): Blob | null {
  if (!data) return null;

  const item = Array.from(data.items).find(
    (each) => each.kind === 'file' && each.type.startsWith('image/')
  );

  return item?.getAsFile() ?? null;
}

/* -------------------------------------------------------------------------- */
/*  The control on the toolbar                                                */
/* -------------------------------------------------------------------------- */

const ROW =
  'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-black/5 dark:hover:bg-white/10';

/** What the button says, which is whatever is most worth acting on. */
function buttonFace({ status, label, drive }: FolderState): { text: string; wanting: boolean } {
  if (status === 'needs-permission') return { text: 'Reconnect folder', wanting: true };
  if (drive === 'disconnected') return { text: 'Connect Drive', wanting: true };
  if (status === 'ready') return { text: label ?? 'Picture folder', wanting: false };
  if (drive === 'connected') return { text: 'Drive', wanting: false };

  return { text: 'Picture folder', wanting: false };
}

/**
 * Picking the folder, connecting Drive, and letting either go. The folder
 * picker, the permission prompt and Google's own window all have to be opened
 * from a click — the browser refuses to raise any of them outside a user
 * gesture — which is why every one of these is a button rather than something
 * the page does on its own.
 */
export function PictureFolderButton({ className }: { className?: string }) {
  const state = useFolderState();
  const { status, drive } = state;
  const [open, setOpen] = useState(false);
  /** What the last Drive action had to say, shown until the panel closes. */
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const close = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  useEffect(() => {
    if (!open) setNotice(null);
  }, [open]);

  const shut = useCallback((run: () => Promise<unknown>) => {
    void run();
    setOpen(false);
  }, []);

  /** Drive's actions keep the panel open: each of them has something to report. */
  const runDrive = useCallback(async (run: () => Promise<string | null>) => {
    setBusy(true);
    setNotice(null);
    try {
      setNotice(await run());
    } catch (problem) {
      setNotice(problem instanceof Error ? problem.message : 'Drive could not be reached.');
    } finally {
      setBusy(false);
    }
  }, []);

  const connect = () =>
    runDrive(async () => {
      const now = await connectDriveImages();
      return now === 'connected' ? null : 'Google was not given permission, so nothing has changed.';
    });

  const send = () =>
    runDrive(async () => {
      const { sent, already, failed } = await sendPicturesToDrive();
      if (sent === 0 && failed === 0) {
        return already === 0
          ? 'There are no pictures on this device to send.'
          : `Drive already has all ${already}.`;
      }

      return `${sent} sent${already > 0 ? `, ${already} already there` : ''}${
        failed > 0 ? `, ${failed} could not be read` : ''
      }.`;
    });

  const face = buttonFace(state);

  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        // Google's script is fetched on the way to the button rather than on
        // load, so somebody who never opens this never contacts Google at all.
        onPointerEnter={prepareDriveSignIn}
        onFocus={prepareDriveSignIn}
        aria-expanded={open}
        title={folderMessage(state)}
        className={`${className ?? ''} ${face.wanting ? WANTING : MUTED}`}
      >
        {drive === 'connected' && status !== 'ready' ? (
          <Cloud className="h-3.5 w-3.5" />
        ) : (
          <FolderOpen className="h-3.5 w-3.5" />
        )}
        <span className="max-w-28 truncate">{face.text}</span>
      </button>

      {open && (
        <div
          className={`absolute right-0 top-9 z-40 w-72 rounded-xl border bg-white p-2 shadow-lg dark:bg-[#26262A] ${LINE}`}
        >
          <p className={`px-1 pb-1 text-[11px] font-medium uppercase tracking-wide ${MUTED}`}>
            On this machine
          </p>
          <p className={`px-1 pb-2 text-xs ${MUTED}`}>{localMessage(state)}</p>

          {status !== 'unsupported' && (
            <>
              {status === 'needs-permission' && (
                <button
                  type="button"
                  onClick={() => shut(reconnectFolder)}
                  className={`${ROW} ${SOLID}`}
                >
                  <Check className="h-3.5 w-3.5 shrink-0" />
                  Reconnect it
                </button>
              )}

              <button type="button" onClick={() => shut(pickFolder)} className={`${ROW} ${SOLID}`}>
                <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                {status === 'none' ? 'Choose a folder' : 'Use a different folder'}
              </button>

              {status !== 'none' && (
                <button
                  type="button"
                  onClick={() => shut(forgetFolder)}
                  title="Forget this folder. Nothing inside it is deleted."
                  className={`${ROW} ${MUTED}`}
                >
                  Forget it
                </button>
              )}
            </>
          )}

          <div className={`my-2 border-t ${LINE}`} />

          <p className={`px-1 pb-1 text-[11px] font-medium uppercase tracking-wide ${MUTED}`}>
            Google Drive
          </p>
          <p className={`px-1 pb-2 text-xs ${drive === 'disconnected' ? WANTING : MUTED}`}>
            {driveMessage(drive)}
          </p>

          {drive !== 'unconfigured' && (
            <>
              {drive === 'connected' ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void send()}
                    title="Upload every picture this browser still uses that Drive has not got."
                    className={`${ROW} ${SOLID} disabled:opacity-50`}
                  >
                    <Upload className="h-3.5 w-3.5 shrink-0" />
                    {busy ? 'Sending…' : 'Send this device’s pictures'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      disconnectDriveImages();
                      setNotice(null);
                    }}
                    title="Forget the connection. Nothing in Drive is deleted."
                    className={`${ROW} ${MUTED}`}
                  >
                    <CloudOff className="h-3.5 w-3.5 shrink-0" />
                    Disconnect it
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void connect()}
                  className={`${ROW} ${SOLID} disabled:opacity-50`}
                >
                  <Cloud className="h-3.5 w-3.5 shrink-0" />
                  {busy ? 'Asking Google…' : drive === 'off' ? 'Connect Drive' : 'Connect it again'}
                </button>
              )}
            </>
          )}

          {notice && <p className={`px-1 pt-2 text-xs ${SOLID}`}>{notice}</p>}

          <p className={`px-1 pt-2 text-[11px] ${MUTED}`}>
            Only the file names are kept in the table, which is why the pictures do not travel with a
            backup. Connect Drive on both devices, under the same Google account, and they travel
            there instead.
          </p>
        </div>
      )}
    </div>
  );
}
