'use client';

/**
 * What a month came to: the three numbers, the days it was spent on, and where
 * it went.
 *
 * The by-day strip is drawn over every day of the month including the empty
 * ones — the gaps are half of what the shape says — and each bar is measured
 * against the busiest day rather than against the total, or a month with one
 * large day in it would draw as thirty flat lines.
 */

import { motion } from 'framer-motion';
import { ArrowDownRight, ArrowUpRight, Scale, Wallet } from 'lucide-react';
import { MonthSummary, formatDay, formatMoney, formatSigned } from '@/lib/finance';
import { IN_TEXT, MUTED, OUT_TEXT, SOLID } from '@/components/finance/shared';

/**
 * A category's colour is its **place in the list** — biggest spend first —
 * rather than a hash of its name: a hash puts two categories on the same tint
 * about as often as not, and a chart where everything is one colour is a chart
 * you have to read instead of glance at.
 */
const CATEGORY_COLORS = ['#6366F1', '#0EA5E9', '#F59E0B', '#EC4899', '#14B8A6', '#8B5CF6', '#EF4444', '#84CC16'];

function Tile({
  icon,
  label,
  value,
  tone,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: string;
  note?: string;
}) {
  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white/50 p-4 dark:border-white/10 dark:bg-white/[0.04]">
      <div className={`flex items-center gap-1.5 text-xs font-medium ${MUTED}`}>
        {icon}
        {label}
      </div>
      <p className={`mt-1 text-xl font-semibold tabular-nums md:text-2xl ${tone ?? SOLID}`}>{value}</p>
      {note && <p className={`mt-0.5 text-xs ${MUTED}`}>{note}</p>}
    </div>
  );
}

export function MonthOverview({
  summary,
  byDay,
  balance,
  currency,
}: {
  summary: MonthSummary;
  /** Spending per day of the month, indexed 0 for the 1st. */
  byDay: number[];
  /** Everything ever logged, in minor units — can be negative. */
  balance: number;
  currency: string;
}) {
  const busiest = Math.max(...byDay, 0);
  const spentDays = byDay.filter((amount) => amount > 0).length;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          icon={<ArrowUpRight className="h-3.5 w-3.5" />}
          label="Money in"
          value={formatMoney(summary.income, currency)}
          tone={IN_TEXT}
        />
        <Tile
          icon={<ArrowDownRight className="h-3.5 w-3.5" />}
          label="Money out"
          value={formatMoney(summary.expenses, currency)}
          tone={OUT_TEXT}
          note={spentDays > 0 ? `over ${spentDays} ${spentDays === 1 ? 'day' : 'days'}` : undefined}
        />
        <Tile
          icon={<Scale className="h-3.5 w-3.5" />}
          label="Left over"
          value={formatSigned(summary.net, currency)}
          tone={summary.net < 0 ? OUT_TEXT : IN_TEXT}
          note={summary.net < 0 ? 'this month cost more than it earned' : undefined}
        />
        <Tile
          icon={<Wallet className="h-3.5 w-3.5" />}
          label="Balance"
          value={formatSigned(balance, currency)}
          tone={balance < 0 ? OUT_TEXT : SOLID}
          note="everything logged, all months"
        />
      </div>

      {summary.expenses > 0 && (
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h3 className={`text-xs font-semibold uppercase tracking-wide ${MUTED}`}>Spent by day</h3>
            {summary.largest && (
              <span className={`text-xs ${MUTED}`}>
                Largest: {formatMoney(summary.largest.amount, currency)}
                {summary.largest.category ? ` · ${summary.largest.category}` : ''} ·{' '}
                {formatDay(summary.largest.date)}
              </span>
            )}
          </div>

          <div className="flex h-16 items-end gap-[2px]" role="img" aria-label="Spending on each day of the month">
            {byDay.map((amount, index) => (
              <div
                key={index}
                title={`${index + 1}: ${formatMoney(amount, currency)}`}
                className="flex-1 rounded-t-sm bg-black/[0.06] dark:bg-white/[0.08]"
                style={{ height: '100%', position: 'relative' }}
              >
                <motion.div
                  className="absolute bottom-0 w-full rounded-t-sm bg-[#BE123C]/70 dark:bg-[#FDA4AF]/70"
                  initial={{ height: 0 }}
                  animate={{ height: busiest > 0 ? `${(amount / busiest) * 100}%` : 0 }}
                  transition={{ duration: 0.35, ease: 'easeOut' }}
                />
              </div>
            ))}
          </div>
          <div className={`mt-1 flex justify-between text-[10px] ${MUTED}`}>
            <span>1</span>
            <span>{byDay.length}</span>
          </div>
        </div>
      )}

      {summary.byCategory.length > 0 && (
        <div>
          <h3 className={`mb-2 text-xs font-semibold uppercase tracking-wide ${MUTED}`}>Where it went</h3>
          <ul className="space-y-2">
            {summary.byCategory.map((line, index) => (
              <li key={line.category}>
                <div className="flex items-baseline justify-between gap-3">
                  <span dir="auto" className={`truncate text-sm ${SOLID}`}>
                    {line.category}
                    <span className={`ml-2 text-xs ${MUTED}`}>
                      {line.count} {line.count === 1 ? 'entry' : 'entries'}
                    </span>
                  </span>
                  <span className={`shrink-0 text-sm tabular-nums ${SOLID}`}>
                    {formatMoney(line.total, currency)}
                    <span className={`ml-2 text-xs ${MUTED}`}>{line.share}%</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }}
                    initial={{ width: 0 }}
                    animate={{ width: `${line.share}%` }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary.count === 0 && (
        <p className={`rounded-xl border border-dashed border-black/10 px-4 py-8 text-center text-sm dark:border-white/10 ${MUTED}`}>
          Nothing logged in this month yet — add an entry and the totals fill themselves in.
        </p>
      )}
    </div>
  );
}
