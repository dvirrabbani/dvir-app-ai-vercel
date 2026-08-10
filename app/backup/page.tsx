'use client';

import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Check, Download, FileJson, Upload, X } from 'lucide-react';
import {
  BackupEntry,
  BackupFile,
  applyBackup,
  backupFilename,
  collectBackup,
  downloadBackup,
  parseBackup,
  summariseBackup,
} from '@/lib/backup';
import { useDeviceData } from '@/lib/use-backup';

/** A file that has been read and understood, waiting to be said yes to. */
interface Pending {
  file: BackupFile;
  entries: BackupEntry[];
  name: string;
}

function formatExported(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'an unknown date';
  return date.toLocaleString();
}

export default function BackupPage() {
  const device = useDeviceData();
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDownload = () => {
    downloadBackup(collectBackup());
    setNote(null);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;

    setNote(null);
    setPending(null);

    const result = parseBackup(await file.text());
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setError(null);
    setPending({
      file: result.file,
      entries: summariseBackup(result.file.data),
      name: file.name,
    });
  };

  const handleApply = () => {
    if (!pending) return;

    const complete = applyBackup(pending.file);
    setPending(null);
    if (inputRef.current) inputRef.current.value = '';

    if (complete) {
      setError(null);
      setNote('This device now matches the file. Every page is already showing it.');
    } else {
      setError('Storage refused part of the write — this browser may be in private mode or out of room.');
    }
  };

  const cancel = () => {
    setPending(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#FFF5F8] via-[#FAFAFA] to-[#FAFAFA] dark:from-[#1C1C1E] dark:via-[#1C1C1E] dark:to-[#1C1C1E]">
      <div className="container mx-auto max-w-3xl px-4 pt-24 pb-16 md:px-6 md:pt-28">
        <motion.header
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8 md:mb-10"
        >
          <h1 className="mb-3 text-3xl font-bold text-[#171717] dark:text-[#FAFAFA] md:text-4xl lg:text-5xl">
            Your data
          </h1>
          <p className="max-w-2xl text-base text-black/60 dark:text-white/60 md:text-lg">
            Everything this site knows lives in the browser you typed it into — nothing is on a server, so
            nothing travels on its own. Take a copy off one device here, and load it onto the other.
          </p>
        </motion.header>

        {/* ---------------------------------------------------------------- */}
        {/*  Out                                                             */}
        {/* ---------------------------------------------------------------- */}
        <section className="glass-card mb-6 rounded-2xl p-5 md:p-6">
          <h2 className="mb-1 text-xl font-semibold text-[#171717] dark:text-[#FAFAFA]">On this device</h2>
          <p className="mb-4 text-sm text-black/55 dark:text-white/55">
            What is stored in this browser right now.
          </p>

          {device.hydrated ? (
            <ul className="mb-5 space-y-1.5">
              {device.entries.map((entry) => (
                <li key={entry.id} className="flex items-baseline justify-between gap-4 text-sm">
                  <span className={entry.present ? 'text-[#171717] dark:text-[#FAFAFA]' : 'text-black/40 dark:text-white/40'}>
                    {entry.label}
                  </span>
                  <span
                    aria-hidden
                    className="mx-2 flex-1 border-b border-dashed border-black/15 dark:border-white/15"
                  />
                  <span className={entry.present ? 'font-medium text-[#171717] dark:text-[#FAFAFA]' : 'text-black/40 dark:text-white/40'}>
                    {entry.present ? entry.count : '—'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="mb-5 space-y-2" aria-hidden>
              {Array.from({ length: 6 }).map((_, index) => (
                <li key={index} className="h-4 animate-pulse rounded bg-black/5 dark:bg-white/10" />
              ))}
            </ul>
          )}

          <button
            onClick={handleDownload}
            disabled={!device.hydrated || device.total === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-[#D81B60] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#C2185B] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download className="h-4 w-4" />
            Download a copy
          </button>

          {/* Held back until hydration: the name carries today's date, and the
              server does not necessarily agree with this browser about which day
              it is. */}
          {device.hydrated && (
            <p className="mt-3 text-sm text-black/50 dark:text-white/50">
              {device.total === 0
                ? 'There is nothing stored in this browser yet, so there is nothing to take away.'
                : `Saves as ${backupFilename()}`}
            </p>
          )}
        </section>

        {/* ---------------------------------------------------------------- */}
        {/*  In                                                              */}
        {/* ---------------------------------------------------------------- */}
        <section className="glass-card rounded-2xl p-5 md:p-6">
          <h2 className="mb-1 text-xl font-semibold text-[#171717] dark:text-[#FAFAFA]">
            Load a copy onto this device
          </h2>
          <p className="mb-4 text-sm text-black/55 dark:text-white/55">
            Pick a file you took off another device. You will see what is in it before anything changes.
          </p>

          <label
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void handleFile(event.dataTransfer.files[0]);
            }}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
              dragging
                ? 'border-[#D81B60] bg-[#D81B60]/5'
                : 'border-black/15 hover:border-[#D81B60]/50 dark:border-white/15 dark:hover:border-[#D81B60]/50'
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(event) => void handleFile(event.target.files?.[0])}
            />
            <Upload className="h-6 w-6 text-black/40 dark:text-white/40" />
            <span className="text-sm font-medium text-[#171717] dark:text-[#FAFAFA]">
              Choose a backup file
            </span>
            <span className="text-xs text-black/50 dark:text-white/50">or drop it here</span>
          </label>

          {error && (
            <div className="mt-4 flex items-start gap-3 rounded-xl bg-[#C62828]/10 p-4 text-sm text-[#8E1616] dark:text-[#FFB4AB]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {note && (
            <div className="mt-4 flex items-start gap-3 rounded-xl bg-[#2E7D32]/10 p-4 text-sm text-[#1B5E20] dark:text-[#A5D6A7]">
              <Check className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{note}</p>
            </div>
          )}

          {pending && (
            <div className="mt-5 rounded-xl border border-black/10 p-4 dark:border-white/10">
              <div className="mb-3 flex items-start gap-2">
                <FileJson className="mt-0.5 h-4 w-4 shrink-0 text-[#D81B60]" />
                <div className="min-w-0">
                  <p
                    dir="auto"
                    className="truncate text-sm font-medium text-[#171717] dark:text-[#FAFAFA]"
                  >
                    {pending.name}
                  </p>
                  <p className="text-xs text-black/50 dark:text-white/50">
                    Taken on {formatExported(pending.file.exportedAt)}
                  </p>
                </div>
              </div>

              <div className="mb-4 grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1.5 text-sm">
                <span className="text-xs uppercase tracking-wide text-black/40 dark:text-white/40">What</span>
                <span className="text-right text-xs uppercase tracking-wide text-black/40 dark:text-white/40">
                  In the file
                </span>
                <span className="text-right text-xs uppercase tracking-wide text-black/40 dark:text-white/40">
                  Here now
                </span>

                {pending.entries.map((entry, index) => {
                  const here = device.entries[index];
                  return (
                    <FragmentRow
                      key={entry.id}
                      label={entry.label}
                      incoming={entry.present ? entry.count : null}
                      current={here?.present ? here.count : null}
                    />
                  );
                })}
              </div>

              <div className="mb-4 flex items-start gap-3 rounded-xl bg-[#F57C00]/10 p-3 text-sm text-[#8A4B00] dark:text-[#FFCC80]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Loading this replaces what is in this browser. Anything in the right-hand column that is not
                  in the file goes away — take a copy of this device first if you are not sure.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleApply}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#D81B60] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#C2185B]"
                >
                  <Check className="h-4 w-4" />
                  Replace my data with this
                </button>
                <button
                  onClick={cancel}
                  className="inline-flex items-center gap-2 rounded-xl border border-black/15 px-4 py-2.5 text-sm font-medium text-[#171717] transition-colors hover:bg-black/5 dark:border-white/15 dark:text-[#FAFAFA] dark:hover:bg-white/10"
                >
                  <X className="h-4 w-4" />
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>

        <p className="mt-6 text-sm text-black/50 dark:text-white/50">
          The file is plain JSON and never leaves your devices unless you send it somewhere — put it in Drive,
          iCloud or a chat to yourself, and it is readable in any text editor. The blog&rsquo;s image folder is
          the one thing that cannot travel: it is a pointer to a folder on one machine.
        </p>
      </div>
    </main>
  );
}

/** One comparison line: what the file has, against what is here. */
function FragmentRow({
  label,
  incoming,
  current,
}: {
  label: string;
  incoming: number | null;
  current: number | null;
}) {
  const muted = 'text-black/40 dark:text-white/40';
  const solid = 'text-[#171717] dark:text-[#FAFAFA]';

  return (
    <>
      <span className={incoming === null ? muted : solid}>{label}</span>
      <span className={`text-right font-medium ${incoming === null ? muted : solid}`}>
        {incoming === null ? '—' : incoming}
      </span>
      <span className={`text-right ${current === null ? muted : 'text-black/60 dark:text-white/60'}`}>
        {current === null ? '—' : current}
      </span>
    </>
  );
}
