'use client';

/**
 * The bits the milestones page and the routines section both draw with. They
 * started out inside `app/milestones/page.tsx`; they live here so the two
 * sections cannot drift into looking like two different pages.
 */

import { motion } from 'framer-motion';
import { CalendarRange, Flag } from 'lucide-react';
import { MilestoneRange, RangeStatus, formatRange, rangeCountdown, rangeStatus } from '@/lib/milestones';

export const fieldClass =
  'w-full rounded-xl border border-gray-200 bg-white/60 px-4 py-2.5 text-sm text-[#1C1C1E] outline-none transition-colors placeholder:text-gray-500 focus:border-[#FF4D8E]/50 focus:ring-2 focus:ring-[#FF4D8E]/20 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-gray-400';

// A native date input paints its own picker and calendar glyph from the colour
// scheme, which stays light — and unreadable on the dark card — without this.
export const dateFieldClass = `${fieldClass} [color-scheme:light] dark:[color-scheme:dark]`;

export const cardClass =
  'rounded-2xl border border-white/30 bg-white/60 p-5 backdrop-blur-md dark:border-white/10 dark:bg-white/5 md:p-6';

export const DONE_COLOR = '#10B981';
export const PROGRESS_COLOR = '#FF4D8E';

export function EmptyPanel({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border p-10 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#FF4D8E]/10">
        <Flag className="h-6 w-6 text-[#FF4D8E]" />
      </div>
      <h3 className="mb-2 text-lg font-semibold text-foreground md:text-xl">{title}</h3>
      <p className={`mx-auto max-w-md text-sm text-muted-foreground ${action ? 'mb-6' : ''}`}>{children}</p>
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
      className={`rounded-full p-2 text-muted-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        destructive
          ? 'hover:bg-destructive/10 hover:text-destructive'
          : 'hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * The plus and minus beside a count. Smaller than `IconButton`, which is sized
 * for the corner of a card rather than the end of a list row.
 */
export function StepButton({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-white/10"
    >
      {children}
    </button>
  );
}

export type RangeTone = 'upcoming' | 'active' | 'soon' | 'overdue' | 'done';

/**
 * A deeper shade of each hue rather than the hue itself, so small text on a 10%
 * tint of it still clears 4.5:1 — the brand pink on its own tint measures 2.3:1.
 */
export const rangeToneClass: Record<RangeTone, string> = {
  upcoming: 'border-[#3B82F6]/40 bg-[#3B82F6]/10 text-[#1E3A8A] dark:text-[#BFDBFE]',
  active: 'border-[#6366F1]/40 bg-[#6366F1]/10 text-[#312E81] dark:text-[#C7D2FE]',
  soon: 'border-[#F59E0B]/50 bg-[#F59E0B]/15 text-[#92400E] dark:text-[#FCD34D]',
  overdue: 'border-[#EF4444]/40 bg-[#EF4444]/10 text-[#991B1B] dark:text-[#FCA5A5]',
  done: 'border-[#10B981]/40 bg-[#10B981]/10 text-[#065F46] dark:text-[#6EE7B7]',
};

export function rangeTone(status: RangeStatus, done: boolean): RangeTone {
  if (done) return 'done';
  if (status.state === 'ended') return 'overdue';
  if (status.state === 'upcoming') return 'upcoming';
  // The last few days read as a warning rather than as business as usual.
  return status.daysLeft <= 3 ? 'soon' : 'active';
}

/**
 * The dates, the countdown and a bar for the time gone.
 *
 * `rangeStatus` reads today's date, which is why this is only ever rendered
 * from inside a card — the lists around them wait for `hydrated`, so the server
 * never renders a "days left" the browser then disagrees with.
 */
export function RangeMeter({
  range,
  done,
  label,
  suffix,
}: {
  range: MilestoneRange;
  done: boolean;
  /** What the bar is measuring, for screen readers. */
  label: string;
  /** An extra note beside the dates, such as how often a routine repeats. */
  suffix?: string;
}) {
  const status = rangeStatus(range);
  const tone = rangeTone(status, done);

  return (
    <div className="mb-3">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarRange className="h-4 w-4 shrink-0" />
          {formatRange(range)}
          {suffix && <span className="text-muted-foreground/80">· {suffix}</span>}
        </span>
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${rangeToneClass[tone]}`}
        >
          {done ? 'Done' : rangeCountdown(status)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="w-24 shrink-0 text-xs text-muted-foreground">Time {status.timePercent}%</span>
        <div
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/10"
          role="progressbar"
          aria-valuenow={status.timePercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Time gone for ${label}`}
        >
          <motion.div
            // Deliberately not a brand colour: this bar is the clock, and the
            // pink one underneath is the work. Two pinks would read as one thing.
            className={`h-full rounded-full ${tone === 'overdue' ? 'bg-[#EF4444]/70' : 'bg-foreground/30'}`}
            initial={{ width: 0 }}
            animate={{ width: `${status.timePercent}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        </div>
      </div>
    </div>
  );
}
