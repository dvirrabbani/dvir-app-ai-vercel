'use client';

/**
 * The filters over a table: one line each, and every one of them has to pass.
 *
 * A filter is three things read left to right — a column, a comparison and
 * something to compare it against — because that is how you would say it out
 * loud. Which comparisons are on offer comes from what the column holds: a date
 * is asked whether it is *before* something, a name whether it *contains* it.
 *
 * The lines are stored with the table rather than held here, so the way you left
 * a table is the way you find it. Nothing is hidden destructively: every row is
 * still in the table, and clearing the filters brings them all back.
 */

import { Filter as FilterIcon, Plus, X } from 'lucide-react';
import {
  CELL_MAX_LENGTH,
  MAX_FILTERS,
  TableDoc,
  addFilter,
  clearFilters,
  operatorLabel,
  operatorNeedsValue,
  operatorsFor,
  picksFromList,
  removeFilter,
  updateFilter,
} from '@/lib/documents';

/** Literal greys: `text-muted-foreground` resolves to nothing in this project. */
const MUTED = 'text-[#4B5563] dark:text-[#9CA3AF]';
const SOLID = 'text-[#171717] dark:text-[#FAFAFA]';

const CONTROL =
  'rounded-lg border border-gray-200 bg-white/70 px-2 py-1.5 text-xs outline-none transition-colors focus:border-[#FF4D8E]/50 focus:ring-2 focus:ring-[#FF4D8E]/20 dark:border-white/10 dark:bg-white/5';

/** The native menus paint themselves from the colour scheme, which stays light
 *  — and unreadable on the dark card — without this. */
const SELECT = `${CONTROL} ${SOLID} [color-scheme:light] dark:[color-scheme:dark]`;

export function FilterBar({ table }: { table: TableDoc }) {
  const columns = table.columns;

  return (
    <div className="rounded-xl border border-black/10 bg-black/[0.02] p-2.5 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <FilterIcon className="h-3.5 w-3.5 shrink-0 text-[#FF4D8E]" aria-hidden />
        <h3 className={`text-xs font-semibold uppercase tracking-wide ${SOLID}`}>Filters</h3>
        {table.filters.length > 0 && (
          <button
            type="button"
            onClick={() => clearFilters(table.id)}
            className={`ml-auto rounded-lg px-2 py-1 text-xs transition-colors hover:bg-black/5 dark:hover:bg-white/10 ${MUTED}`}
          >
            Clear all
          </button>
        )}
      </div>

      {table.filters.length === 0 ? (
        <p className={`mb-2 text-xs ${MUTED}`}>
          Nothing is filtered — every row is showing. Add one below, or use the menu on any column heading.
        </p>
      ) : (
        <ul className="mb-2 space-y-1.5">
          {table.filters.map((filter, index) => {
            const column = columns.find((each) => each.id === filter.columnId);
            if (!column) return null;

            return (
              <li key={filter.id} className="flex flex-wrap items-center gap-1.5">
                <span className={`w-10 shrink-0 text-[11px] uppercase tracking-wide ${MUTED}`}>
                  {index === 0 ? 'Where' : 'And'}
                </span>

                <select
                  value={filter.columnId}
                  onChange={(event) => updateFilter(table.id, filter.id, { columnId: event.target.value })}
                  aria-label="Column to filter on"
                  className={`${SELECT} max-w-40`}
                >
                  {columns.map((each) => (
                    <option key={each.id} value={each.id}>
                      {each.name}
                    </option>
                  ))}
                </select>

                <select
                  value={filter.operator}
                  onChange={(event) =>
                    updateFilter(table.id, filter.id, {
                      operator: event.target.value as typeof filter.operator,
                    })
                  }
                  aria-label="How to compare it"
                  className={SELECT}
                >
                  {operatorsFor(column.type).map((operator) => (
                    <option key={operator} value={operator}>
                      {operatorLabel(operator, column.type)}
                    </option>
                  ))}
                </select>

                {operatorNeedsValue(filter.operator) &&
                  (picksFromList(column.type) ? (
                    // A choice is picked from the same list the cells are, so
                    // a filter cannot be left asking for a spelling no cell in
                    // the column has. An empty one is not a filter yet — every
                    // row stays until one is chosen. A column holding several
                    // is asked about one tag at a time, and two filters narrow
                    // to two tags exactly as two filters always narrow.
                    <select
                      value={filter.value}
                      onChange={(event) => updateFilter(table.id, filter.id, { value: event.target.value })}
                      aria-label={`Which choice ${column.name} is compared against`}
                      className={`${SELECT} min-w-0 flex-1 basis-32`}
                    >
                      <option value="">
                        {column.options.length === 0 ? 'This list is empty' : 'Pick a choice'}
                      </option>
                      {column.options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={filter.value}
                      onChange={(event) => updateFilter(table.id, filter.id, { value: event.target.value })}
                      type={column.type === 'date' ? 'date' : 'text'}
                      inputMode={column.type === 'number' ? 'decimal' : undefined}
                      maxLength={CELL_MAX_LENGTH}
                      dir="auto"
                      placeholder={column.type === 'number' ? '0' : 'What to look for'}
                      aria-label={`What ${column.name} is compared against`}
                      className={`${CONTROL} ${SOLID} min-w-0 flex-1 basis-32 placeholder:text-gray-500 dark:placeholder:text-gray-400 ${
                        column.type === 'date' ? '[color-scheme:light] dark:[color-scheme:dark]' : ''
                      }`}
                    />
                  ))}

                <button
                  type="button"
                  onClick={() => removeFilter(table.id, filter.id)}
                  title="Remove this filter"
                  aria-label="Remove this filter"
                  className={`shrink-0 rounded-lg p-1.5 transition-colors hover:bg-black/5 hover:text-[#B3261E] dark:hover:bg-white/10 dark:hover:text-[#FFB4AB] ${MUTED}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        onClick={() => addFilter(table.id, columns[0]?.id ?? '')}
        disabled={table.filters.length >= MAX_FILTERS || columns.length === 0}
        className="inline-flex items-center gap-1 rounded-lg bg-[#D81B60] px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#B0154E] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" />
        {table.filters.length >= MAX_FILTERS ? `${MAX_FILTERS} filters is the lot` : 'Add a filter'}
      </button>
    </div>
  );
}
