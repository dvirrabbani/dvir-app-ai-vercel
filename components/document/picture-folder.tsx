'use client';

/**
 * The folder on this machine where pictures pasted into a table are written.
 *
 * It is the same folder the blog's pasted screenshots go to and the same module
 * behind it (`lib/image-folder.ts`) — one folder per browser, whatever put a
 * picture in it. Only the controls are written again here rather than borrowed
 * from the blog: they live inside the post editor's toolbar, wired to its own
 * notices and menus, and prising them out of it to gain a button is a worse
 * trade than a dozen lines.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, FolderOpen } from 'lucide-react';
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
} from '@/lib/image-folder';

/** Literal greys: `text-muted-foreground` resolves to nothing in this project. */
const MUTED = 'text-[#4B5563] dark:text-[#9CA3AF]';
const SOLID = 'text-[#171717] dark:text-[#FAFAFA]';
const LINE = 'border-black/10 dark:border-white/10';

export interface FolderState {
  status: FolderStatus;
  /** The folder's own name, for saying which one is connected. */
  label: string | null;
}

/** Which folder is connected, kept up to date as it is picked or forgotten. */
export function useFolderState(): FolderState {
  const [state, setState] = useState<FolderState>({ status: 'none', label: null });

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      const [status, label] = await Promise.all([folderStatus(), folderName()]);
      if (!cancelled) setState({ status, label });
    };

    void refresh();
    const onChange = () => void refresh();
    window.addEventListener(IMAGE_FOLDER_EVENT, onChange);

    return () => {
      cancelled = true;
      window.removeEventListener(IMAGE_FOLDER_EVENT, onChange);
    };
  }, []);

  return state;
}

/** What the state means, said once so the button and the cell editor agree. */
export function folderMessage({ status, label }: FolderState): string {
  switch (status) {
    case 'unsupported':
      return 'This browser cannot write to a folder — pasting pictures needs Chrome or Edge.';
    case 'none':
      return 'No folder chosen yet. Pictures pasted into a cell need somewhere on this machine to live.';
    case 'needs-permission':
      return `“${label}” needs permission again before anything can be written to it.`;
    case 'ready':
      return `Pictures are kept in “${label}”.`;
  }
}

/**
 * A pasted or dropped picture, written to the folder. Comes back with the file
 * name to store against the cell, or with the reason it could not be kept —
 * which is always something the person can act on, never a silent failure.
 */
export async function keepPicture(
  blob: Blob
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  if (!folderSupported()) {
    return { ok: false, error: 'Pasting pictures needs Chrome or Edge — this browser cannot write to a folder.' };
  }

  const status = await folderStatus();
  if (status !== 'ready') {
    return {
      ok: false,
      error:
        status === 'none'
          ? 'Choose a folder to keep pictures in first.'
          : 'Reconnect the picture folder before pasting into it.',
    };
  }

  const name = await saveImage(blob);
  if (!name) return { ok: false, error: 'That picture could not be written to the folder.' };

  return { ok: true, name };
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

/**
 * Picking the folder, reconnecting it, or letting it go. The picker and the
 * permission prompt both have to be opened from a click — the browser refuses
 * to raise either one outside a user gesture — which is why every one of these
 * is a button rather than something the page does on its own.
 */
export function PictureFolderButton({ className }: { className?: string }) {
  const { status, label } = useFolderState();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const close = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const shut = useCallback((run: () => Promise<unknown>) => {
    void run();
    setOpen(false);
  }, []);

  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        title={folderMessage({ status, label })}
        className={`${className ?? ''} ${
          status === 'needs-permission' ? 'text-[#B26A00] dark:text-[#FFCC80]' : MUTED
        }`}
      >
        <FolderOpen className="h-3.5 w-3.5" />
        {status === 'ready' ? (
          <span className="max-w-28 truncate">{label}</span>
        ) : status === 'needs-permission' ? (
          'Reconnect folder'
        ) : (
          'Picture folder'
        )}
      </button>

      {open && (
        <div className={`absolute right-0 top-9 z-40 w-72 rounded-xl border bg-white p-2 shadow-lg dark:bg-[#26262A] ${LINE}`}>
          <p className={`px-1 pb-2 text-xs ${MUTED}`}>{folderMessage({ status, label })}</p>

          {status !== 'unsupported' && (
            <>
              {status === 'needs-permission' && (
                <button type="button" onClick={() => shut(reconnectFolder)} className={`${ROW} ${SOLID}`}>
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

          <p className={`px-1 pt-2 text-[11px] ${MUTED}`}>
            Only the file names are kept in the table. The pictures themselves stay in the folder, which is why
            they do not travel with a backup.
          </p>
        </div>
      )}
    </div>
  );
}
