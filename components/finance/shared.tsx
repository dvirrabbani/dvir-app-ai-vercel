'use client';

/**
 * The bits every finance panel draws with, kept in one place so the four of
 * them cannot drift into looking like four different pages.
 *
 * The colours are literal hex with a `dark:` twin rather than the semantic
 * tokens: `--foreground` and friends are stored as bare HSL triplets, so
 * `text-foreground` resolves to an invalid colour and paints nothing at all.
 * `app/document/page.tsx` does the same for the same reason.
 */

export const MUTED = 'text-[#4B5563] dark:text-[#9CA3AF]';
export const SOLID = 'text-[#171717] dark:text-[#FAFAFA]';

/** Money in, money out. Deeper than the brand hues so small text still reads. */
export const IN_COLOR = '#047857';
export const OUT_COLOR = '#BE123C';
export const IN_TEXT = 'text-[#047857] dark:text-[#6EE7B7]';
export const OUT_TEXT = 'text-[#BE123C] dark:text-[#FDA4AF]';

/**
 * The primary button. `#D81B60` rather than the brand `#FF4D8E`, which measures
 * 3.13:1 against white — under the 4.5:1 small text needs.
 */
export const primaryButtonClass =
  'inline-flex items-center justify-center gap-1.5 rounded-full bg-[#D81B60] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#D81B60]/90 disabled:cursor-not-allowed disabled:opacity-50';

export const quietButtonClass =
  'inline-flex items-center justify-center gap-1.5 rounded-full border border-black/10 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10';

export const fieldClass =
  'w-full rounded-xl border border-black/10 bg-white/70 px-3 py-2 text-sm text-[#171717] outline-none transition-colors placeholder:text-[#6B7280] focus:border-[#D81B60]/50 focus:ring-2 focus:ring-[#D81B60]/15 dark:border-white/10 dark:bg-white/5 dark:text-[#FAFAFA] dark:placeholder:text-[#9CA3AF]';

// A native date input paints its own picker and glyph from the colour scheme,
// which stays light — and unreadable on the dark card — without this.
export const dateFieldClass = `${fieldClass} [color-scheme:light] dark:[color-scheme:dark]`;

export const cardClass =
  'rounded-2xl border border-white/30 bg-white/60 p-5 backdrop-blur-md dark:border-white/10 dark:bg-white/5 md:p-6';

export function SectionTitle({
  icon,
  title,
  note,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  note?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className={`flex items-center gap-2 text-lg font-semibold md:text-xl ${SOLID}`}>
          {icon}
          {title}
        </h2>
        {note && <p className={`mt-1 text-sm ${MUTED}`}>{note}</p>}
      </div>
      {action}
    </div>
  );
}

export function IconButton({
  title,
  onClick,
  children,
  destructive,
  disabled,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full p-2 text-[#4B5563] transition-colors disabled:cursor-not-allowed disabled:opacity-40 dark:text-[#9CA3AF] ${
        destructive
          ? 'hover:bg-[#BE123C]/10 hover:text-[#BE123C] dark:hover:text-[#FDA4AF]'
          : 'hover:bg-black/5 hover:text-[#171717] dark:hover:bg-white/10 dark:hover:text-[#FAFAFA]'
      }`}
    >
      {children}
    </button>
  );
}

/** The placeholder every panel shows while the browser has not taken over yet. */
export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-12 animate-pulse rounded-xl bg-black/[0.04] dark:bg-white/[0.06]" />
      ))}
    </div>
  );
}
