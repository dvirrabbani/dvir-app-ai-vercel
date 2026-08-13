'use client';

/**
 * The one form entries are written in — new ones under the month's heading, and
 * existing ones in place of their own row in the list. One component for both,
 * so a thing typed and a thing corrected can never disagree about what an
 * amount is or which categories exist.
 */

import { useId, useState } from 'react';
import { Check, X } from 'lucide-react';
import { toDateKey } from '@/lib/calendar';
import {
  CATEGORY_MAX_LENGTH,
  NOTE_MAX_LENGTH,
  Transaction,
  TransactionKind,
  addTransaction,
  amountToInput,
  parseAmount,
  updateTransaction,
} from '@/lib/finance';
import {
  MUTED,
  SOLID,
  dateFieldClass,
  fieldClass,
  primaryButtonClass,
  quietButtonClass,
} from '@/components/finance/shared';

function KindToggle({
  kind,
  onChange,
  labelledBy,
}: {
  kind: TransactionKind;
  onChange: (kind: TransactionKind) => void;
  labelledBy: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      className="inline-flex rounded-full border border-black/10 p-0.5 dark:border-white/10"
    >
      {(['expense', 'income'] as const).map((option) => {
        const active = kind === option;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              active
                ? option === 'income'
                  ? 'bg-[#047857] text-white'
                  : 'bg-[#BE123C] text-white'
                : `${MUTED} hover:bg-black/5 dark:hover:bg-white/10`
            }`}
          >
            {option === 'income' ? 'Money in' : 'Money out'}
          </button>
        );
      })}
    </div>
  );
}

export function TransactionForm({
  categories,
  /** The entry being corrected, or nothing at all when this is a new one. */
  initial,
  /** The day a new entry lands on unless it is changed — the month being read. */
  defaultDate,
  onDone,
  onCancel,
}: {
  categories: string[];
  initial?: Transaction;
  defaultDate?: string;
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const listId = useId();
  const kindLabelId = useId();

  const [kind, setKind] = useState<TransactionKind>(initial?.kind ?? 'expense');
  const [amount, setAmount] = useState(initial ? amountToInput(initial.amount) : '');
  const [date, setDate] = useState(initial?.date ?? defaultDate ?? toDateKey(new Date()));
  const [category, setCategory] = useState(initial?.category ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [error, setError] = useState<string | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();

    const minor = parseAmount(amount);
    if (minor === null) {
      setError('That is not an amount. Try something like 42 or 1,250.90.');
      return;
    }
    if (!date) {
      setError('Pick the day it happened.');
      return;
    }

    const ok = initial
      ? updateTransaction(initial.id, { kind, amount: minor, date, category, note })
      : addTransaction({ kind, amount: minor, date, category, note }) !== null;

    if (!ok) {
      setError('That could not be saved. Check the amount and the day.');
      return;
    }

    if (!initial) {
      // The day and the category stay put: a sitting filling in yesterday's
      // receipts is a dozen entries on one day under two or three headings.
      setAmount('');
      setNote('');
    }

    setError(null);
    onDone?.();
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span id={kindLabelId} className={`text-xs ${MUTED}`}>
          Direction
        </span>
        <KindToggle kind={kind} onChange={setKind} labelledBy={kindLabelId} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className={`text-xs ${MUTED}`}>
          Amount
          <input
            // Text rather than a number input: a number one refuses a comma in
            // some locales and silently empties itself in others, and what was
            // typed is the thing being parsed.
            inputMode="decimal"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
              if (error) setError(null);
            }}
            placeholder="0.00"
            aria-label="Amount"
            className={`${fieldClass} mt-1 tabular-nums`}
          />
        </label>

        <label className={`text-xs ${MUTED}`}>
          Day
          <input
            type="date"
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
              if (error) setError(null);
            }}
            aria-label="Day"
            className={`${dateFieldClass} mt-1`}
          />
        </label>

        <label className={`text-xs ${MUTED}`}>
          Category
          <input
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            list={listId}
            dir="auto"
            maxLength={CATEGORY_MAX_LENGTH}
            placeholder="Groceries"
            aria-label="Category"
            className={`${fieldClass} mt-1`}
          />
          {/* Suggestions only — anything can be typed, and a new one becomes a
              suggestion the moment it is saved. */}
          <datalist id={listId}>
            {categories.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </label>

        <label className={`text-xs ${MUTED}`}>
          Note
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            dir="auto"
            maxLength={NOTE_MAX_LENGTH}
            placeholder="What it was for"
            aria-label="Note"
            className={`${fieldClass} mt-1`}
          />
        </label>
      </div>

      {error && (
        <p className="text-xs text-[#BE123C] dark:text-[#FDA4AF]" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className={primaryButtonClass}>
          <Check className="h-4 w-4" />
          {initial ? 'Save' : 'Add entry'}
        </button>

        {onCancel && (
          <button type="button" onClick={onCancel} className={`${quietButtonClass} ${SOLID}`}>
            <X className="h-3.5 w-3.5" />
            Cancel
          </button>
        )}

        {!initial && (
          <span className={`text-xs ${MUTED}`}>
            Stays on this device — nothing here is sent anywhere.
          </span>
        )}
      </div>
    </form>
  );
}
