'use client';

/**
 * A month's entries, newest day first.
 *
 * Grouped by the day rather than run together, because a ledger is read by the
 * day something happened — and the day's own total beside its heading is the
 * number that answers "what did Tuesday cost?" without any adding up.
 *
 * A row being corrected is replaced by the same form new entries are written
 * in, in place, so nothing opens over the list and loses your place in it.
 */

import { useMemo, useState } from 'react';
import { Pencil, Search, Trash2 } from 'lucide-react';
import {
  Transaction,
  TransactionKind,
  deleteTransaction,
  formatDay,
  formatMoney,
  formatSigned,
} from '@/lib/finance';
import { TransactionForm } from '@/components/finance/transaction-form';
import {
  IN_TEXT,
  IconButton,
  MUTED,
  OUT_TEXT,
  SOLID,
  fieldClass,
} from '@/components/finance/shared';

type KindFilter = 'all' | TransactionKind;

const FILTERS: { value: KindFilter; label: string }[] = [
  { value: 'all', label: 'Everything' },
  { value: 'expense', label: 'Money out' },
  { value: 'income', label: 'Money in' },
];

function CategoryChip({ category }: { category: string }) {
  return (
    <span
      dir="auto"
      className="inline-flex max-w-[12rem] items-center truncate rounded-full border border-[#6366F1]/40 bg-[#6366F1]/10 px-2 py-0.5 text-xs font-medium text-[#312E81] dark:text-[#C7D2FE]"
    >
      {category}
    </span>
  );
}

function Row({
  transaction,
  currency,
  categories,
  editing,
  onEdit,
  onDone,
}: {
  transaction: Transaction;
  currency: string;
  categories: string[];
  editing: boolean;
  onEdit: () => void;
  onDone: () => void;
}) {
  if (editing) {
    return (
      <li className="rounded-xl border border-[#D81B60]/30 bg-white/70 p-3 dark:bg-white/5">
        <TransactionForm
          categories={categories}
          initial={transaction}
          onDone={onDone}
          onCancel={onDone}
        />
      </li>
    );
  }

  const income = transaction.kind === 'income';

  return (
    <li className="group flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {transaction.category ? (
            <CategoryChip category={transaction.category} />
          ) : (
            <span className={`text-xs ${MUTED}`}>No category</span>
          )}
          {transaction.note && (
            <span dir="auto" className={`truncate text-sm ${SOLID}`}>
              {transaction.note}
            </span>
          )}
        </div>
      </div>

      <span className={`shrink-0 text-sm font-semibold tabular-nums ${income ? IN_TEXT : OUT_TEXT}`}>
        {income ? '+' : '−'}
        {formatMoney(transaction.amount, currency)}
      </span>

      {/* Out of the way until the row is under the pointer or the keyboard, the
          way the bin beside a table row is. */}
      <span className="flex shrink-0 items-center opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <IconButton title="Change this entry" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton
          title="Delete this entry"
          destructive
          onClick={() => deleteTransaction(transaction.id)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </IconButton>
      </span>
    </li>
  );
}

export function TransactionList({
  transactions,
  currency,
  categories,
}: {
  /** Already narrowed to the month being read, newest first. */
  transactions: Transaction[];
  currency: string;
  categories: string[];
}) {
  const [filter, setFilter] = useState<KindFilter>('all');
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return transactions.filter((transaction) => {
      if (filter !== 'all' && transaction.kind !== filter) return false;
      if (!needle) return true;
      return (
        transaction.category.toLowerCase().includes(needle) ||
        transaction.note.toLowerCase().includes(needle)
      );
    });
  }, [filter, query, transactions]);

  /** Day key → that day's entries, in the order they already came in. */
  const days = useMemo(() => {
    const grouped = new Map<string, Transaction[]>();
    for (const transaction of visible) {
      const day = grouped.get(transaction.date);
      if (day) day.push(transaction);
      else grouped.set(transaction.date, [transaction]);
    }
    return [...grouped.entries()];
  }, [visible]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-full border border-black/10 p-0.5 dark:border-white/10">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value)}
              aria-pressed={filter === option.value}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === option.value
                  ? `bg-black/[0.06] dark:bg-white/10 ${SOLID}`
                  : `${MUTED} hover:bg-black/5 dark:hover:bg-white/10`
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <label className="relative ml-auto w-full sm:w-56">
          <Search className={`pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${MUTED}`} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            dir="auto"
            placeholder="Find a category or note"
            aria-label="Find an entry"
            className={`${fieldClass} pl-9`}
          />
        </label>
      </div>

      {days.length === 0 ? (
        <p className={`rounded-xl border border-dashed border-black/10 px-4 py-8 text-center text-sm dark:border-white/10 ${MUTED}`}>
          {transactions.length === 0
            ? 'Nothing logged this month yet. The form above is where it starts.'
            : 'Nothing here matches that.'}
        </p>
      ) : (
        <div className="space-y-4">
          {days.map(([day, entries]) => {
            const net = entries.reduce(
              (total, entry) => total + (entry.kind === 'income' ? entry.amount : -entry.amount),
              0
            );

            return (
              <div key={day}>
                <div className="mb-1 flex items-baseline justify-between gap-3 border-b border-black/[0.06] pb-1 dark:border-white/[0.08]">
                  <h3 className={`text-xs font-semibold uppercase tracking-wide ${MUTED}`}>
                    {formatDay(day)}
                  </h3>
                  <span className={`text-xs tabular-nums ${net < 0 ? OUT_TEXT : IN_TEXT}`}>
                    {formatSigned(net, currency)}
                  </span>
                </div>

                <ul className="space-y-1">
                  {entries.map((transaction) => (
                    <Row
                      key={transaction.id}
                      transaction={transaction}
                      currency={currency}
                      categories={categories}
                      editing={editingId === transaction.id}
                      onEdit={() => setEditingId(transaction.id)}
                      onDone={() => setEditingId(null)}
                    />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
