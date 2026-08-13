/**
 * Finance: what came in, what went out, and what a month was supposed to cost.
 *
 * Three records, one feature. A **transaction** is a thing that happened — an
 * amount, a day, a category, a note. A **budget** is a category and what a month
 * of it is meant to come to; it records nothing, it is only the line the spending
 * is measured against. **Settings** is the currency the numbers are written in,
 * which is about the person rather than about any one entry.
 *
 * Money is kept in **whole minor units** — agorot, cents, pence — and never as a
 * float. 0.1 + 0.2 is famously not 0.3, and a ledger that drifts by a hundredth
 * every dozen entries is a ledger nobody can reconcile against a bank statement.
 * `parseAmount` is the only way in and it works on the digits of the string
 * rather than on `parseFloat`, so what somebody typed is what is stored.
 *
 * Categories are not seeded and not a stored list of their own: they are read
 * back off the transactions and the budgets (`categoriesIn`), the same way the
 * diet menu refuses to guess at what somebody eats. A category exists because
 * something was filed under it.
 *
 * Like everything else on this site it lives in localStorage only — one
 * browser's copy, shared with nobody, and no server ever sees a number of it.
 */

import { fromDateKey, isValidDateKey, toDateKey } from '@/lib/calendar';

export type TransactionKind = 'income' | 'expense';

export interface Transaction {
  id: string;
  kind: TransactionKind;
  /** Whole minor units. Always positive — the direction is `kind`, not a sign. */
  amount: number;
  /** The day it happened, as a local YYYY-MM-DD key — the calendar's own. */
  date: string;
  /** Free text, trimmed. Empty means "not filed under anything". */
  category: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface Budget {
  id: string;
  category: string;
  /** What a month of that category is meant to come to, in minor units. */
  limit: number;
  createdAt: string;
  updatedAt: string;
}

export interface FinanceSettings {
  /** The symbol written in front of every number. Not a conversion rate. */
  currency: string;
}

export const FINANCE_TRANSACTIONS_KEY = 'dvir-finance:transactions';
export const FINANCE_BUDGETS_KEY = 'dvir-finance:budgets';
export const FINANCE_SETTINGS_KEY = 'dvir-finance:settings';

/** Fired on `window` after any write, so open views can refresh themselves. */
export const FINANCE_EVENT = 'finance-changed';

export const CATEGORY_MAX_LENGTH = 40;
export const NOTE_MAX_LENGTH = 140;

/** 99,999,999.99 in minor units — past a household ledger, short of overflow. */
export const MAX_AMOUNT = 9_999_999_999;

export const MAX_TRANSACTIONS = 5_000;
export const MAX_BUDGETS = 60;

/** The symbols offered in the picker. Anything else can still be typed in. */
export const CURRENCIES = ['₪', '$', '€', '£'] as const;

export const DEFAULT_CURRENCY = '₪';

/* -------------------------------------------------------------------------- */
/*  Money in and out of strings                                               */
/* -------------------------------------------------------------------------- */

/**
 * "1,234.5" → 123450 minor units, or null if it is not an amount.
 *
 * Read off the digits rather than through `parseFloat`, so nothing is ever a
 * hundredth out. Both separators are accepted because both are typed: with one
 * of each, the **last** one is the decimal point; with only commas, a comma
 * followed by exactly one or two digits at the very end is a decimal point and
 * anything else is a thousands separator. Currency symbols and spaces are
 * ignored — somebody pasting "₪ 1 200" means twelve hundred.
 *
 * A negative is refused rather than flipped: which direction an entry goes is
 * the kind, and a minus in the box means the kind is about to be wrong.
 */
export function parseAmount(input: string): number | null {
  const cleaned = input.replace(/[\s ₪$€£¥]/g, '');
  if (!cleaned) return null;
  if (cleaned.startsWith('-')) return null;
  if (!/^[0-9.,]+$/.test(cleaned)) return null;

  const lastDot = cleaned.lastIndexOf('.');
  const lastComma = cleaned.lastIndexOf(',');

  let decimalAt = -1;
  if (lastDot >= 0 && lastComma >= 0) {
    decimalAt = Math.max(lastDot, lastComma);
  } else if (lastDot >= 0) {
    decimalAt = lastDot;
  } else if (lastComma >= 0) {
    const after = cleaned.length - lastComma - 1;
    if (after === 1 || after === 2) decimalAt = lastComma;
  }

  const whole = (decimalAt >= 0 ? cleaned.slice(0, decimalAt) : cleaned).replace(/[.,]/g, '');
  const fraction = decimalAt >= 0 ? cleaned.slice(decimalAt + 1) : '';

  // A second separator on the wrong side of the decimal point is not a number.
  if (/[.,]/.test(fraction)) return null;
  if (!whole && !fraction) return null;
  if (fraction.length > 2) return null;

  const minor = Number(whole || '0') * 100 + Number(fraction.padEnd(2, '0') || '0');
  if (!Number.isFinite(minor)) return null;
  if (minor <= 0 || minor > MAX_AMOUNT) return null;

  return Math.round(minor);
}

/** 123450 → "1,234.50". The number only — `formatMoney` puts the symbol on. */
export function formatAmount(minor: number): string {
  const safe = Math.max(0, Math.round(minor));
  const whole = Math.floor(safe / 100).toLocaleString('en-US');
  return `${whole}.${String(safe % 100).padStart(2, '0')}`;
}

/** What the page prints: "₪1,234.50". */
export function formatMoney(minor: number, currency: string = DEFAULT_CURRENCY): string {
  return `${currency}${formatAmount(minor)}`;
}

/**
 * The same with a sign in front, for a figure that can go either way.
 * A net of zero is neither, so it gets no sign at all.
 */
export function formatSigned(minor: number, currency: string = DEFAULT_CURRENCY): string {
  if (minor === 0) return formatMoney(0, currency);
  return `${minor > 0 ? '+' : '−'}${formatMoney(Math.abs(minor), currency)}`;
}

/** What goes back into an edit box: "1234.50", no separators to re-parse. */
export function amountToInput(minor: number): string {
  const safe = Math.max(0, Math.round(minor));
  return `${Math.floor(safe / 100)}.${String(safe % 100).padStart(2, '0')}`;
}

/* -------------------------------------------------------------------------- */
/*  Months                                                                    */
/* -------------------------------------------------------------------------- */

/** A month key: the first seven characters of a day key, "2026-08". */
export type MonthKey = string;

export function monthOf(date: string): MonthKey {
  return date.slice(0, 7);
}

export function isValidMonthKey(key: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(key);
}

/** Reads today's date, so only ever called from the browser. */
export function currentMonth(): MonthKey {
  return monthOf(toDateKey(new Date()));
}

/** "2026-08" and −1 → "2026-07". Years roll over on their own. */
export function shiftMonth(month: MonthKey, delta: number): MonthKey {
  const [year, index] = month.split('-').map(Number);
  const shifted = new Date(year, index - 1 + delta, 1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`;
}

/** "August 2026". */
export function formatMonth(month: MonthKey): string {
  const [year, index] = month.split('-').map(Number);
  return new Date(year, index - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** "Wed, 12 Aug" — a day inside a month already named above it. */
export function formatDay(date: string): string {
  return fromDateKey(date).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** How many days that month has, which is what the by-day chart is drawn over. */
export function daysInMonth(month: MonthKey): number {
  const [year, index] = month.split('-').map(Number);
  return new Date(year, index, 0).getDate();
}

/* -------------------------------------------------------------------------- */
/*  Reading and writing                                                       */
/* -------------------------------------------------------------------------- */

function isTransaction(value: unknown): value is Transaction {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Partial<Transaction>;
  return (
    typeof item.id === 'string' &&
    (item.kind === 'income' || item.kind === 'expense') &&
    typeof item.amount === 'number' &&
    typeof item.date === 'string'
  );
}

function isBudget(value: unknown): value is Budget {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Partial<Budget>;
  return typeof item.id === 'string' && typeof item.category === 'string' && typeof item.limit === 'number';
}

function normaliseTransaction(transaction: Transaction): Transaction {
  return {
    ...transaction,
    // Rounded and clamped on the way out as well as in: the store is
    // user-writable, and a hand-edited 12.5 agorot would show as an amount
    // nothing could ever add up to.
    amount: Math.min(MAX_AMOUNT, Math.max(0, Math.round(transaction.amount))),
    category: typeof transaction.category === 'string' ? transaction.category.slice(0, CATEGORY_MAX_LENGTH) : '',
    note: typeof transaction.note === 'string' ? transaction.note.slice(0, NOTE_MAX_LENGTH) : '',
  };
}

export function getTransactions(): Transaction[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(FINANCE_TRANSACTIONS_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return (
      parsed
        .filter(isTransaction)
        // An entry on a day that is not a day cannot be put in a month, so it is
        // dropped rather than shown outside every total it ought to be inside.
        .filter((transaction) => isValidDateKey(transaction.date))
        .map(normaliseTransaction)
        .filter((transaction) => transaction.amount > 0)
        // Newest first, which is the order a ledger is read in.
        .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    );
  } catch {
    return [];
  }
}

function writeTransactions(transactions: Transaction[]) {
  try {
    window.localStorage.setItem(FINANCE_TRANSACTIONS_KEY, JSON.stringify(transactions));
    window.dispatchEvent(new CustomEvent(FINANCE_EVENT));
  } catch {
    // Storage unavailable (private mode, quota) — the change just does not stick.
  }
}

export function getBudgets(): Budget[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(FINANCE_BUDGETS_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(isBudget)
      .map((budget) => ({
        ...budget,
        category: budget.category.slice(0, CATEGORY_MAX_LENGTH),
        limit: Math.min(MAX_AMOUNT, Math.max(0, Math.round(budget.limit))),
      }))
      .filter((budget) => budget.category.trim().length > 0 && budget.limit > 0)
      .sort((a, b) => b.limit - a.limit);
  } catch {
    return [];
  }
}

function writeBudgets(budgets: Budget[]) {
  try {
    window.localStorage.setItem(FINANCE_BUDGETS_KEY, JSON.stringify(budgets));
    window.dispatchEvent(new CustomEvent(FINANCE_EVENT));
  } catch {
    // As above — a refused write simply does not stick.
  }
}

export function getSettings(): FinanceSettings {
  if (typeof window === 'undefined') return { currency: DEFAULT_CURRENCY };

  try {
    const raw = window.localStorage.getItem(FINANCE_SETTINGS_KEY);
    if (!raw) return { currency: DEFAULT_CURRENCY };

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { currency: DEFAULT_CURRENCY };

    const currency = (parsed as Partial<FinanceSettings>).currency;
    // Three characters is room for "CHF" and not room for a paragraph pasted in.
    if (typeof currency !== 'string' || !currency.trim()) return { currency: DEFAULT_CURRENCY };

    return { currency: currency.trim().slice(0, 3) };
  } catch {
    return { currency: DEFAULT_CURRENCY };
  }
}

export function setCurrency(currency: string): void {
  const trimmed = currency.trim().slice(0, 3);
  if (!trimmed) return;

  try {
    window.localStorage.setItem(FINANCE_SETTINGS_KEY, JSON.stringify({ currency: trimmed }));
    window.dispatchEvent(new CustomEvent(FINANCE_EVENT));
  } catch {
    // As above.
  }
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/* -------------------------------------------------------------------------- */
/*  Transactions                                                              */
/* -------------------------------------------------------------------------- */

export function addTransaction(input: {
  kind: TransactionKind;
  amount: number;
  date: string;
  category?: string;
  note?: string;
}): Transaction | null {
  if (input.kind !== 'income' && input.kind !== 'expense') return null;
  if (!isValidDateKey(input.date)) return null;

  const amount = Math.round(input.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) return null;

  const existing = getTransactions();
  if (existing.length >= MAX_TRANSACTIONS) return null;

  const now = new Date().toISOString();

  const transaction: Transaction = {
    id: newId('tx'),
    kind: input.kind,
    amount,
    date: input.date,
    category: (input.category ?? '').trim().slice(0, CATEGORY_MAX_LENGTH),
    note: (input.note ?? '').trim().slice(0, NOTE_MAX_LENGTH),
    createdAt: now,
    updatedAt: now,
  };

  writeTransactions([transaction, ...existing]);
  return transaction;
}

export function updateTransaction(
  id: string,
  changes: Partial<Pick<Transaction, 'kind' | 'amount' | 'date' | 'category' | 'note'>>
): boolean {
  const transactions = getTransactions();
  const existing = transactions.find((transaction) => transaction.id === id);
  if (!existing) return false;

  const amount = Math.round(changes.amount ?? existing.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) return false;

  const date = changes.date ?? existing.date;
  if (!isValidDateKey(date)) return false;

  const updated: Transaction = {
    ...existing,
    kind: changes.kind ?? existing.kind,
    amount,
    date,
    category: (changes.category ?? existing.category).trim().slice(0, CATEGORY_MAX_LENGTH),
    note: (changes.note ?? existing.note).trim().slice(0, NOTE_MAX_LENGTH),
    updatedAt: new Date().toISOString(),
  };

  writeTransactions(transactions.map((transaction) => (transaction.id === id ? updated : transaction)));
  return true;
}

export function deleteTransaction(id: string): void {
  writeTransactions(getTransactions().filter((transaction) => transaction.id !== id));
}

/* -------------------------------------------------------------------------- */
/*  Budgets                                                                   */
/* -------------------------------------------------------------------------- */

/** Case-insensitively, since "Food" and "food" are one category everywhere else. */
export function sameCategory(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * One budget per category, so a category cannot end up with two lines to be
 * under and over at the same time. A repeat is refused rather than merged.
 */
export function addBudget(input: { category: string; limit: number }): Budget | null {
  const category = input.category.trim().slice(0, CATEGORY_MAX_LENGTH);
  if (!category) return null;

  const limit = Math.round(input.limit);
  if (!Number.isFinite(limit) || limit <= 0 || limit > MAX_AMOUNT) return null;

  const budgets = getBudgets();
  if (budgets.length >= MAX_BUDGETS) return null;
  if (budgets.some((budget) => sameCategory(budget.category, category))) return null;

  const now = new Date().toISOString();
  const budget: Budget = { id: newId('budget'), category, limit, createdAt: now, updatedAt: now };

  writeBudgets([...budgets, budget]);
  return budget;
}

export function updateBudget(id: string, changes: Partial<Pick<Budget, 'category' | 'limit'>>): boolean {
  const budgets = getBudgets();
  const existing = budgets.find((budget) => budget.id === id);
  if (!existing) return false;

  const category = (changes.category ?? existing.category).trim().slice(0, CATEGORY_MAX_LENGTH);
  if (!category) return false;

  const limit = Math.round(changes.limit ?? existing.limit);
  if (!Number.isFinite(limit) || limit <= 0 || limit > MAX_AMOUNT) return false;

  if (budgets.some((budget) => budget.id !== id && sameCategory(budget.category, category))) return false;

  const updated: Budget = { ...existing, category, limit, updatedAt: new Date().toISOString() };
  writeBudgets(budgets.map((budget) => (budget.id === id ? updated : budget)));
  return true;
}

export function deleteBudget(id: string): void {
  writeBudgets(getBudgets().filter((budget) => budget.id !== id));
}

/* -------------------------------------------------------------------------- */
/*  Reading a month back                                                      */
/* -------------------------------------------------------------------------- */

export function transactionsIn(transactions: Transaction[], month: MonthKey): Transaction[] {
  return transactions.filter((transaction) => monthOf(transaction.date) === month);
}

/** Every month anything is filed under, newest first — what the picker offers. */
export function monthsWithEntries(transactions: Transaction[]): MonthKey[] {
  const months = new Set(transactions.map((transaction) => monthOf(transaction.date)));
  return [...months].sort((a, b) => b.localeCompare(a));
}

/**
 * Every category anything has been filed under, from the entries *and* the
 * budgets. Deduplicated case-insensitively, keeping the spelling most recently
 * used, so "Food" typed once and "food" typed later are one suggestion.
 */
export function categoriesIn(transactions: Transaction[], budgets: Budget[] = []): string[] {
  const seen = new Map<string, string>();

  for (const transaction of transactions) {
    const category = transaction.category.trim();
    if (category) seen.set(category.toLowerCase(), category);
  }
  for (const budget of budgets) {
    const category = budget.category.trim();
    if (category) seen.set(category.toLowerCase(), category);
  }

  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

export interface CategoryTotal {
  category: string;
  /** In minor units. */
  total: number;
  count: number;
  /** Share of that month's spending, 0–100, rounded. */
  share: number;
}

export interface MonthSummary {
  month: MonthKey;
  income: number;
  expenses: number;
  /** Income less expenses — negative is a month that cost more than it earned. */
  net: number;
  count: number;
  /** Where the spending went, biggest first. Income is not broken down. */
  byCategory: CategoryTotal[];
  /** The biggest single expense, for the "largest" line. Null in a quiet month. */
  largest: Transaction | null;
}

/** Anything filed under nothing is gathered here rather than under a blank chip. */
export const UNCATEGORISED = 'Uncategorised';

export function summariseMonth(transactions: Transaction[], month: MonthKey): MonthSummary {
  const entries = transactionsIn(transactions, month);

  let income = 0;
  let expenses = 0;
  let largest: Transaction | null = null;

  const totals = new Map<string, CategoryTotal>();

  for (const entry of entries) {
    if (entry.kind === 'income') {
      income += entry.amount;
      continue;
    }

    expenses += entry.amount;
    if (!largest || entry.amount > largest.amount) largest = entry;

    const label = entry.category.trim() || UNCATEGORISED;
    const key = label.toLowerCase();
    const running = totals.get(key);

    if (running) {
      // The spelling first seen is kept, and the list is newest-first, so a
      // category renamed halfway through a month reads as it was last written.
      running.total += entry.amount;
      running.count += 1;
    } else {
      totals.set(key, { category: label, total: entry.amount, count: 1, share: 0 });
    }
  }

  const byCategory = [...totals.values()]
    .map((total) => ({
      ...total,
      share: expenses > 0 ? Math.round((total.total / expenses) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total || a.category.localeCompare(b.category));

  return { month, income, expenses, net: income - expenses, count: entries.length, byCategory, largest };
}

/** Everything ever logged, which is the only balance this can honestly report. */
export function overallBalance(transactions: Transaction[]): number {
  return transactions.reduce(
    (total, transaction) => total + (transaction.kind === 'income' ? transaction.amount : -transaction.amount),
    0
  );
}

/**
 * What was spent on each day of the month, indexed 0 for the 1st.
 *
 * Every day of the month is present, including the ones nothing happened on —
 * a gap in spending is a finding, and a chart that skipped the empty days would
 * draw a fortnight of nothing as a solid week.
 */
export function spendingByDay(transactions: Transaction[], month: MonthKey): number[] {
  const days = new Array<number>(daysInMonth(month)).fill(0);

  for (const transaction of transactionsIn(transactions, month)) {
    if (transaction.kind !== 'expense') continue;
    const day = Number(transaction.date.slice(8, 10));
    if (day >= 1 && day <= days.length) days[day - 1] += transaction.amount;
  }

  return days;
}

export type BudgetState = 'under' | 'close' | 'over';

export interface BudgetLine {
  budget: Budget;
  /** Spent in that category this month, in minor units. */
  spent: number;
  /** Spent against the limit, 0–100+ (it is allowed past 100 — that is the point). */
  percent: number;
  /** What is still available, or 0 once it has gone. */
  left: number;
  state: BudgetState;
}

/**
 * Each budget against what that category actually cost this month.
 *
 * "Close" is the last fifth: a bar that only changes colour once it is over has
 * told you at the one moment it is too late to do anything about it.
 */
export function budgetLines(
  budgets: Budget[],
  transactions: Transaction[],
  month: MonthKey
): BudgetLine[] {
  const entries = transactionsIn(transactions, month).filter((entry) => entry.kind === 'expense');

  return budgets
    .map((budget) => {
      const spent = entries
        .filter((entry) => sameCategory(entry.category, budget.category))
        .reduce((total, entry) => total + entry.amount, 0);

      const percent = budget.limit > 0 ? Math.round((spent / budget.limit) * 100) : 0;
      const state: BudgetState = percent > 100 ? 'over' : percent >= 80 ? 'close' : 'under';

      return { budget, spent, percent, left: Math.max(0, budget.limit - spent), state };
    })
    .sort((a, b) => b.percent - a.percent || a.budget.category.localeCompare(b.budget.category));
}

/** The budgets read as one line: what a month is planned to cost, and how it is going. */
export interface BudgetTotals {
  planned: number;
  spent: number;
  left: number;
  percent: number;
  over: number;
}

export function totalBudget(lines: BudgetLine[]): BudgetTotals {
  const planned = lines.reduce((total, line) => total + line.budget.limit, 0);
  const spent = lines.reduce((total, line) => total + line.spent, 0);

  return {
    planned,
    spent,
    left: Math.max(0, planned - spent),
    percent: planned > 0 ? Math.round((spent / planned) * 100) : 0,
    over: lines.filter((line) => line.state === 'over').length,
  };
}

/**
 * Spending this month **that no budget covers**, and which categories it is in.
 *
 * The number the budgets panel cannot show on its own: a month can be under
 * every line it has and still be a disaster, if half of what was spent went
 * somewhere nothing was ever planned for.
 */
export function unbudgetedSpending(
  budgets: Budget[],
  transactions: Transaction[],
  month: MonthKey
): { total: number; categories: string[] } {
  const entries = transactionsIn(transactions, month).filter((entry) => entry.kind === 'expense');
  const loose = entries.filter(
    (entry) => !budgets.some((budget) => sameCategory(budget.category, entry.category))
  );

  const categories = new Map<string, string>();
  for (const entry of loose) {
    const label = entry.category.trim() || UNCATEGORISED;
    categories.set(label.toLowerCase(), label);
  }

  return {
    total: loose.reduce((total, entry) => total + entry.amount, 0),
    categories: [...categories.values()].sort((a, b) => a.localeCompare(b)),
  };
}
