'use client';

/**
 * Finance: a month at a time.
 *
 * The page is one month wide. Everything on it — the totals, the entries, the
 * budgets — answers for the month named at the top, because that is the unit
 * money is actually managed in: a salary arrives once, rent leaves once, and a
 * category is over or under by the end of it. The only figure that ignores the
 * month is the balance, which is everything ever logged and says so.
 *
 * Nothing here is sent anywhere. There is no server behind this site, so the
 * ledger is this browser's and no other device sees it unless the backup page
 * carries a file across by hand.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ListOrdered,
  PiggyBank,
  Plus,
  Wallet,
} from 'lucide-react';
import { Footer } from '@/components/layout/footer';
import { BudgetsPanel } from '@/components/finance/budgets-panel';
import { MonthOverview } from '@/components/finance/month-overview';
import { TransactionForm } from '@/components/finance/transaction-form';
import { TransactionList } from '@/components/finance/transaction-list';
import {
  IconButton,
  MUTED,
  SOLID,
  SectionTitle,
  Skeleton,
  cardClass,
  quietButtonClass,
} from '@/components/finance/shared';
import {
  CURRENCIES,
  MonthKey,
  budgetLines,
  currentMonth,
  formatMonth,
  setCurrency,
  shiftMonth,
  spendingByDay,
  summariseMonth,
  transactionsIn,
  unbudgetedSpending,
} from '@/lib/finance';
import { useFinance } from '@/lib/use-finance';

/** The day a new entry lands on: today inside this month, its 1st otherwise. */
function defaultDayFor(month: MonthKey): string {
  const today = new Date();
  const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate()
  ).padStart(2, '0')}`;

  return key.startsWith(month) ? key : `${month}-01`;
}

function CurrencyPicker({ currency }: { currency: string }) {
  return (
    <div className="inline-flex rounded-full border border-black/10 p-0.5 dark:border-white/10">
      {CURRENCIES.map((symbol) => (
        <button
          key={symbol}
          type="button"
          onClick={() => setCurrency(symbol)}
          aria-pressed={currency === symbol}
          title={`Write the numbers in ${symbol}`}
          className={`h-7 w-8 rounded-full text-sm font-medium transition-colors ${
            currency === symbol
              ? `bg-black/[0.06] dark:bg-white/10 ${SOLID}`
              : `${MUTED} hover:bg-black/5 dark:hover:bg-white/10`
          }`}
        >
          {symbol}
        </button>
      ))}
    </div>
  );
}

export default function FinancePage() {
  const { transactions, budgets, currency, balance, categories, hydrated } = useFinance();

  // Null until a month is picked, so the server renders no date at all and the
  // browser is the only thing that ever decides what "this month" means.
  const [chosen, setChosen] = useState<MonthKey | null>(null);
  const month = chosen ?? (hydrated ? currentMonth() : '');

  const [adding, setAdding] = useState(false);

  const summary = useMemo(() => summariseMonth(transactions, month), [transactions, month]);
  const monthEntries = useMemo(() => transactionsIn(transactions, month), [transactions, month]);
  const byDay = useMemo(() => (month ? spendingByDay(transactions, month) : []), [transactions, month]);
  const lines = useMemo(() => budgetLines(budgets, transactions, month), [budgets, transactions, month]);
  const unbudgeted = useMemo(
    () => unbudgetedSpending(budgets, transactions, month),
    [budgets, transactions, month]
  );

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#FFF5F8] via-[#FAFAFA] to-[#FAFAFA] dark:from-[#1C1C1E] dark:via-[#1C1C1E] dark:to-[#1C1C1E]">
      <div className="container mx-auto max-w-6xl px-4 pb-16 pt-24 md:px-6 md:pt-28">
        <Link
          href="/about/management"
          className={`mb-6 inline-flex items-center gap-2 text-sm transition-colors hover:text-[#171717] dark:hover:text-white md:mb-8 ${MUTED}`}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Management
        </Link>

        <motion.header
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-6 flex flex-wrap items-end justify-between gap-4"
        >
          <div>
            <h1 className={`flex items-center gap-2 text-3xl font-bold md:text-4xl ${SOLID}`}>
              <Wallet className="h-7 w-7 text-[#D81B60]" />
              Finance
            </h1>
            <p className={`mt-2 max-w-2xl text-base ${MUTED}`}>
              What came in, what went out, and what the month was meant to cost. Kept in this browser
              only — nothing is sent anywhere.
            </p>
          </div>

          <CurrencyPicker currency={currency} />
        </motion.header>

        {!hydrated ? (
          <div className={cardClass}>
            <Skeleton rows={4} />
          </div>
        ) : (
          <div className="space-y-6">
            {/* The month everything on the page answers for. */}
            <div className={`${cardClass} flex flex-wrap items-center justify-between gap-3`}>
              <div className="flex items-center gap-1">
                <IconButton title="The month before" onClick={() => setChosen(shiftMonth(month, -1))}>
                  <ChevronLeft className="h-4 w-4" />
                </IconButton>

                <h2 className={`min-w-[10rem] text-center text-lg font-semibold md:text-xl ${SOLID}`}>
                  {formatMonth(month)}
                </h2>

                <IconButton title="The month after" onClick={() => setChosen(shiftMonth(month, 1))}>
                  <ChevronRight className="h-4 w-4" />
                </IconButton>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="month"
                  value={month}
                  onChange={(event) => event.target.value && setChosen(event.target.value)}
                  aria-label="Jump to a month"
                  className="rounded-xl border border-black/10 bg-white/70 px-3 py-1.5 text-sm outline-none transition-colors focus:border-[#D81B60]/50 dark:border-white/10 dark:bg-white/5 [color-scheme:light] dark:[color-scheme:dark]"
                />

                {month !== currentMonth() && (
                  <button
                    type="button"
                    onClick={() => setChosen(null)}
                    className={`${quietButtonClass} ${SOLID}`}
                  >
                    This month
                  </button>
                )}
              </div>
            </div>

            <section className={cardClass}>
              <SectionTitle
                icon={<PiggyBank className="h-5 w-5 text-[#D81B60]" />}
                title="The month so far"
                note={`${summary.count} ${summary.count === 1 ? 'entry' : 'entries'} logged`}
              />
              <MonthOverview summary={summary} byDay={byDay} balance={balance} currency={currency} />
            </section>

            <div className="grid gap-6 lg:grid-cols-3">
              <section className={`${cardClass} lg:col-span-2`}>
                <SectionTitle
                  icon={<ListOrdered className="h-5 w-5 text-[#D81B60]" />}
                  title="Entries"
                  note="Grouped by the day they happened, newest first."
                  action={
                    !adding && (
                      <button
                        type="button"
                        onClick={() => setAdding(true)}
                        className={`${quietButtonClass} ${SOLID}`}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add an entry
                      </button>
                    )
                  }
                />

                {/* Folded away until it is asked for, so the page opens on the
                    ledger rather than on an empty form — except when there is
                    no ledger yet, which is the one time the form is the page. */}
                {(adding || monthEntries.length === 0) && (
                  <div className="mb-5 rounded-xl border border-black/[0.06] p-3 dark:border-white/10">
                    <TransactionForm
                      categories={categories}
                      defaultDate={defaultDayFor(month)}
                      onCancel={adding ? () => setAdding(false) : undefined}
                    />
                  </div>
                )}

                <TransactionList
                  transactions={monthEntries}
                  currency={currency}
                  categories={categories}
                />
              </section>

              <section className={cardClass}>
                <SectionTitle
                  icon={<Wallet className="h-5 w-5 text-[#D81B60]" />}
                  title="Budgets"
                  note="One a month, per category."
                />
                <BudgetsPanel
                  lines={lines}
                  unbudgeted={unbudgeted}
                  categories={categories}
                  currency={currency}
                />
              </section>
            </div>

            <p className={`text-center text-xs ${MUTED}`}>
              Everything on this page lives in this browser&apos;s storage. To carry it to another
              device, write a file from the{' '}
              <Link href="/backup" className="underline underline-offset-2 hover:text-[#D81B60]">
                Data
              </Link>{' '}
              page and read it back there.
            </p>
          </div>
        )}
      </div>

      <Footer />
    </main>
  );
}
