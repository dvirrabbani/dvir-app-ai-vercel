'use client';

/**
 * The catalogue, drawn a group at a time.
 *
 * Every row says the same four things in the same order — what it is, how
 * needed it is, what it actually does, and how it is used — because the whole
 * value of the page is that two products can be compared without reading two
 * bottles. The ticks sit on the right of the name, so a column of them can be
 * read down without reading the prose beside it.
 *
 * A `skip` item carries no ticks at all. It is there to be read once and not
 * bought, and a checkbox beside it would invite the opposite.
 *
 * An item that is a thing to *do* rather than a thing to own carries one tick
 * instead of two, for the reason `CareItem.practice` gives: owning posture is
 * not a state anybody could report on.
 */

import { useState } from 'react';
import { AlertTriangle, Check, Circle, Repeat, Trash2 } from 'lucide-react';
import { MUTED, SOLID } from '@/components/finance/shared';
import { NeedChip, ToggleChip } from '@/components/lifestyle/shared';
import {
  CareItem,
  CareState,
  ITEM_NOTE_MAX_LENGTH,
  NEED_LABEL,
  deleteItem,
  isKeepable,
  setDaily,
  setHave,
  setNote,
  stateFor,
} from '@/lib/self-care';

/**
 * Your own line about the item.
 *
 * Held locally and committed on blur rather than written through on every
 * keystroke: a write fires the event, which re-reads the store for every open
 * view, and a paragraph typed at speed would do that eighty times.
 *
 * The stored value can still change underneath an open box — the other tab
 * writing, or this one loading a backup — so the box has to follow it. That is
 * done **during the render** rather than in an effect: React's own recommended
 * shape for "reset some state when a prop changes", and the one the lint rule
 * allows, since an effect would render the stale value once before correcting
 * it. Comparing against the last value seen rather than against `draft` is what
 * keeps it from wiping out what is being typed on every keystroke.
 */
function NoteField({ id, value, placeholder }: { id: string; value: string; placeholder: string }) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);

  if (value !== seen) {
    setSeen(value);
    setDraft(value);
  }

  return (
    <input
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => draft !== value && setNote(id, draft)}
      maxLength={ITEM_NOTE_MAX_LENGTH}
      dir="auto"
      placeholder={placeholder}
      aria-label="Your note about this"
      className="mt-2 w-full rounded-lg border border-black/[0.06] bg-white/50 px-2.5 py-1.5 text-xs text-[#171717] outline-none transition-colors placeholder:text-[#6B7280] focus:border-[#D81B60]/40 dark:border-white/10 dark:bg-white/5 dark:text-[#FAFAFA] dark:placeholder:text-[#9CA3AF]"
    />
  );
}

function ItemRow({ item, state }: { item: CareItem; state: CareState }) {
  const entry = stateFor(state, item.id);
  const keepable = isKeepable(item);

  return (
    <li className="border-t border-black/[0.06] py-3 first:border-t-0 first:pt-0 dark:border-white/10">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className={`text-sm font-medium ${SOLID}`} dir="auto">
              {item.name}
            </h4>
            <NeedChip need={item.need} label={NEED_LABEL[item.need]} />
          </div>

          {item.what && (
            <p className={`mt-1 text-sm ${MUTED}`} dir="auto">
              {item.what}
            </p>
          )}

          {item.how && (
            <p className={`mt-1 text-xs ${MUTED}`}>
              <span className="font-medium">How:</span> {item.how}
            </p>
          )}

          {item.caveat && (
            <p className="mt-1 flex gap-1.5 text-xs text-[#92400E] dark:text-[#FCD34D]">
              <AlertTriangle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {item.caveat}
            </p>
          )}
        </div>

        {keepable && (
          <div className="flex shrink-0 items-center gap-1.5">
            {item.practice ? (
              /* One tick. Turning it on says both things — `setDaily` sets
                 "have" with it — and turning it off has to clear both, which is
                 what `setHave(false)` does, or the tally would go on counting a
                 habit that was given up. */
              <ToggleChip
                on={entry.daily}
                label="Do it"
                title={entry.daily ? 'Say you have stopped doing this' : 'Say you actually do this'}
                onClick={() =>
                  entry.daily ? setHave(item.id, false) : setDaily(item.id, true)
                }
                icon={entry.daily ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3 w-3" />}
              />
            ) : (
              <>
                <ToggleChip
                  on={entry.have}
                  label="Have it"
                  title={entry.have ? 'Say you no longer have this' : 'Say you have this'}
                  onClick={() => setHave(item.id, !entry.have)}
                  icon={entry.have ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3 w-3" />}
                />
                <ToggleChip
                  on={entry.daily}
                  label="Use it"
                  title={entry.daily ? 'Say you have stopped using this' : 'Say you actually use this'}
                  onClick={() => setDaily(item.id, !entry.daily)}
                  icon={<Repeat className="h-3.5 w-3.5" />}
                />
              </>
            )}

            {item.custom && (
              <button
                type="button"
                title="Remove this — it is one of your own"
                aria-label={`Remove ${item.name}`}
                onClick={() => deleteItem(item.id)}
                className="rounded-full p-1.5 text-[#4B5563] transition-colors hover:bg-[#BE123C]/10 hover:text-[#BE123C] dark:text-[#9CA3AF] dark:hover:text-[#FDA4AF]"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* The note only appears once the thing is yours: a box under all thirty
          rows is a wall, and there is nothing to say about a cream you have
          never bought. An existing note keeps it open however it got there. */}
      {keepable && (entry.have || entry.note) && (
        <NoteField
          id={item.id}
          value={entry.note}
          placeholder={
            item.practice
              ? 'What you actually do, and whether anything changed'
              : 'Which one you use, what it cost, whether it suited you'
          }
        />
      )}
    </li>
  );
}

export function CareList({ items, state }: { items: CareItem[]; state: CareState }) {
  if (items.length === 0) {
    return (
      <p className={`py-2 text-sm ${MUTED}`}>
        Nothing at this level in here. Change the filter above to see the rest.
      </p>
    );
  }

  return (
    <ul>
      {items.map((item) => (
        <ItemRow key={item.id} item={item} state={state} />
      ))}
    </ul>
  );
}
