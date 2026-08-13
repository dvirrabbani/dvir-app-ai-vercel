'use client';

import { useMemo, useSyncExternalStore } from 'react';
import {
  Budget,
  DEFAULT_CURRENCY,
  FINANCE_BUDGETS_KEY,
  FINANCE_EVENT,
  FINANCE_SETTINGS_KEY,
  FINANCE_TRANSACTIONS_KEY,
  Transaction,
  categoriesIn,
  getBudgets,
  getSettings,
  getTransactions,
  monthsWithEntries,
  overallBalance,
} from '@/lib/finance';

function subscribe(onChange: () => void) {
  window.addEventListener(FINANCE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(FINANCE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/**
 * The three raw strings joined, so the snapshot only changes when the stored
 * data does. Parsing here would hand React a new object every render.
 */
function getSnapshot(): string {
  try {
    return [FINANCE_TRANSACTIONS_KEY, FINANCE_BUDGETS_KEY, FINANCE_SETTINGS_KEY]
      .map((key) => window.localStorage.getItem(key) ?? '')
      .join('|');
  } catch {
    return '';
  }
}

function getServerSnapshot(): null {
  return null;
}

interface FinanceState {
  /** Newest first. */
  transactions: Transaction[];
  budgets: Budget[];
  /** The symbol every number on the page is written with. */
  currency: string;
  /** Everything ever logged, in minor units — can be negative. */
  balance: number;
  /** Every month with something in it, newest first. */
  months: string[];
  /** Every category used by an entry or a budget, for the suggestions list. */
  categories: string[];
  /** False on the server and during hydration, so callers can show a placeholder. */
  hydrated: boolean;
}

export function useFinance(): FinanceState {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return useMemo(() => {
    if (raw === null) {
      return {
        transactions: [],
        budgets: [],
        currency: DEFAULT_CURRENCY,
        balance: 0,
        months: [],
        categories: [],
        hydrated: false,
      };
    }

    const transactions = getTransactions();
    const budgets = getBudgets();

    return {
      transactions,
      budgets,
      currency: getSettings().currency,
      balance: overallBalance(transactions),
      months: monthsWithEntries(transactions),
      categories: categoriesIn(transactions, budgets),
      hydrated: true,
    };
  }, [raw]);
}
