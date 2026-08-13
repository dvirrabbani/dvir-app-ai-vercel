'use client';

/**
 * What a month is *meant* to cost, against what it has cost so far.
 *
 * A budget is not a record of anything — it is the line the spending is
 * measured against, one per category so nothing can be under and over at once.
 * The bars turn amber at four fifths rather than only at the end: a warning
 * that arrives once the money has gone is not a warning.
 *
 * The number under them is the one the bars cannot show — what was spent this
 * month that no budget covers. A month can be inside every line it has and
 * still be a bad month, if half of it went somewhere nothing was planned for.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  BudgetLine,
  BudgetState,
  CATEGORY_MAX_LENGTH,
  addBudget,
  amountToInput,
  deleteBudget,
  formatMoney,
  parseAmount,
  totalBudget,
  updateBudget,
} from '@/lib/finance';
import {
  IconButton,
  MUTED,
  OUT_TEXT,
  SOLID,
  fieldClass,
  primaryButtonClass,
  quietButtonClass,
} from '@/components/finance/shared';

const BAR_COLOR: Record<BudgetState, string> = {
  under: '#047857',
  close: '#B45309',
  over: '#BE123C',
};

const STATE_TEXT: Record<BudgetState, string> = {
  under: 'text-[#047857] dark:text-[#6EE7B7]',
  close: 'text-[#92400E] dark:text-[#FCD34D]',
  over: 'text-[#BE123C] dark:text-[#FDA4AF]',
};

function BudgetRow({ line, currency }: { line: BudgetLine; currency: string }) {
  const [editing, setEditing] = useState(false);
  const [category, setCategory] = useState(line.budget.category);
  const [limit, setLimit] = useState(amountToInput(line.budget.limit));
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const minor = parseAmount(limit);
    if (minor === null) {
      setError('That is not an amount.');
      return;
    }
    if (!updateBudget(line.budget.id, { category, limit: minor })) {
      setError('That category already has a budget.');
      return;
    }
    setError(null);
    setEditing(false);
  };

  if (editing) {
    return (
      <li className="rounded-xl border border-[#D81B60]/30 bg-white/70 p-3 dark:bg-white/5">
        <div className="flex flex-wrap items-end gap-2">
          <label className={`text-xs ${MUTED}`}>
            Category
            <input
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              dir="auto"
              maxLength={CATEGORY_MAX_LENGTH}
              aria-label="Category"
              className={`${fieldClass} mt-1 w-44`}
            />
          </label>
          <label className={`text-xs ${MUTED}`}>
            A month of it
            <input
              inputMode="decimal"
              value={limit}
              onChange={(event) => {
                setLimit(event.target.value);
                if (error) setError(null);
              }}
              aria-label="Monthly limit"
              className={`${fieldClass} mt-1 w-32 tabular-nums`}
            />
          </label>
          <button type="button" onClick={save} className={primaryButtonClass}>
            <Check className="h-4 w-4" />
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setCategory(line.budget.category);
              setLimit(amountToInput(line.budget.limit));
              setError(null);
              setEditing(false);
            }}
            className={`${quietButtonClass} ${SOLID}`}
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </button>
        </div>
        {error && (
          <p className="mt-2 text-xs text-[#BE123C] dark:text-[#FDA4AF]" role="alert">
            {error}
          </p>
        )}
      </li>
    );
  }

  return (
    <li className="group rounded-xl px-1 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span dir="auto" className={`text-sm font-medium ${SOLID}`}>
          {line.budget.category}
        </span>

        <span className="flex items-center gap-2">
          <span className={`text-sm tabular-nums ${STATE_TEXT[line.state]}`}>
            {formatMoney(line.spent, currency)}
            <span className={`${MUTED} font-normal`}> of {formatMoney(line.budget.limit, currency)}</span>
          </span>
          <span className="flex items-center opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
            <IconButton title={`Change the ${line.budget.category} budget`} onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton
              title={`Delete the ${line.budget.category} budget`}
              destructive
              onClick={() => deleteBudget(line.budget.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </IconButton>
          </span>
        </span>
      </div>

      <div className="mt-1 flex items-center gap-2">
        <div
          className="h-2 flex-1 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]"
          role="progressbar"
          aria-valuenow={Math.min(100, line.percent)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${line.budget.category} spent against its budget`}
        >
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: BAR_COLOR[line.state] }}
            initial={{ width: 0 }}
            // Capped at the full bar: past the limit the number says how far
            // past, and a bar drawn beyond its own track says nothing.
            animate={{ width: `${Math.min(100, line.percent)}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        </div>
        <span className={`w-32 shrink-0 text-right text-xs tabular-nums ${STATE_TEXT[line.state]}`}>
          {line.state === 'over'
            ? `${formatMoney(line.spent - line.budget.limit, currency)} over`
            : `${formatMoney(line.left, currency)} left`}
        </span>
      </div>
    </li>
  );
}

function AddBudget({ categories, onDone }: { categories: string[]; onDone: () => void }) {
  const [category, setCategory] = useState('');
  const [limit, setLimit] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();

    const minor = parseAmount(limit);
    if (minor === null) {
      setError('That is not an amount.');
      return;
    }
    if (!addBudget({ category, limit: minor })) {
      setError('Give it a category that has no budget yet.');
      return;
    }

    setCategory('');
    setLimit('');
    setError(null);
    onDone();
  };

  return (
    <form onSubmit={submit} className="mb-4 rounded-xl border border-black/[0.06] p-3 dark:border-white/10">
      <div className="flex flex-wrap items-end gap-2">
        <label className={`text-xs ${MUTED}`}>
          Category
          <input
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              if (error) setError(null);
            }}
            list="finance-budget-categories"
            dir="auto"
            maxLength={CATEGORY_MAX_LENGTH}
            placeholder="Groceries"
            aria-label="Category"
            className={`${fieldClass} mt-1 w-44`}
          />
          <datalist id="finance-budget-categories">
            {categories.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </label>

        <label className={`text-xs ${MUTED}`}>
          A month of it
          <input
            inputMode="decimal"
            value={limit}
            onChange={(event) => {
              setLimit(event.target.value);
              if (error) setError(null);
            }}
            placeholder="0.00"
            aria-label="Monthly limit"
            className={`${fieldClass} mt-1 w-32 tabular-nums`}
          />
        </label>

        <button type="submit" className={primaryButtonClass}>
          <Plus className="h-4 w-4" />
          Set it
        </button>
      </div>

      {error && (
        <p className="mt-2 text-xs text-[#BE123C] dark:text-[#FDA4AF]" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

export function BudgetsPanel({
  lines,
  unbudgeted,
  categories,
  currency,
}: {
  lines: BudgetLine[];
  /** Spending this month that no budget covers, and where it went. */
  unbudgeted: { total: number; categories: string[] };
  categories: string[];
  currency: string;
}) {
  const [adding, setAdding] = useState(false);
  const totals = totalBudget(lines);

  return (
    <div>
      {adding ? (
        <AddBudget categories={categories} onDone={() => setAdding(false)} />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className={`${quietButtonClass} mb-4 ${SOLID}`}>
          <Plus className="h-3.5 w-3.5" />
          Set a budget
        </button>
      )}

      {lines.length === 0 ? (
        <p className={`rounded-xl border border-dashed border-black/10 px-4 py-8 text-center text-sm dark:border-white/10 ${MUTED}`}>
          No budgets yet. Set one on a category and this month&apos;s spending is measured against it.
        </p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-black/[0.03] px-3 py-2 dark:bg-white/[0.04]">
            <span className={`text-xs ${MUTED}`}>
              Planned {formatMoney(totals.planned, currency)} · spent {formatMoney(totals.spent, currency)}
            </span>
            <span className={`text-xs font-medium ${totals.over > 0 ? OUT_TEXT : SOLID}`}>
              {totals.over > 0
                ? `${totals.over} ${totals.over === 1 ? 'budget' : 'budgets'} over`
                : `${formatMoney(totals.left, currency)} left across them`}
            </span>
          </div>

          <ul className="space-y-1">
            {lines.map((line) => (
              <BudgetRow key={line.budget.id} line={line} currency={currency} />
            ))}
          </ul>
        </>
      )}

      {unbudgeted.total > 0 && (
        <p className={`mt-3 text-xs ${MUTED}`}>
          {formatMoney(unbudgeted.total, currency)} spent this month under no budget
          {unbudgeted.categories.length > 0 && <> — {unbudgeted.categories.slice(0, 5).join(', ')}</>}
          {unbudgeted.categories.length > 5 && ` and ${unbudgeted.categories.length - 5} more`}.
        </p>
      )}
    </div>
  );
}
