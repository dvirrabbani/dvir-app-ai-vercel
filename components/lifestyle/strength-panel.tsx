'use client';

/**
 * The half of looking well that is built rather than bought.
 *
 * Everything here is worked out from two things — a weight and what the eating
 * is for — and both are stored, because re-typing your own weight on every
 * visit is how a page like this stops being opened. Until the weight is given
 * nothing is guessed: the panel asks, and says why it is asking.
 *
 * The numbers themselves live in `lib/self-care.ts` beside the catalogue, for
 * the same reason the catalogue does — they are content, and an edit there has
 * to reach every browser rather than only the ones that have not visited yet.
 */

import { useState } from 'react';
import { Dumbbell } from 'lucide-react';
import { MUTED, SOLID, fieldClass } from '@/components/finance/shared';
import {
  AIMS,
  Aim,
  Body,
  MAX_WEIGHT,
  MIN_WEIGHT,
  PROTEIN_SOURCES,
  STRENGTH_RULES,
  perMeal,
  portionsFor,
  proteinTarget,
  setAim,
  setWeight,
  waterTarget,
  weeklyChange,
} from '@/lib/self-care';

/**
 * The weight, held as the string that is in the box.
 *
 * A number in state would make a box cleared to retype it snap back to a zero
 * the cursor has to be got past — the same reasoning as the new-table size
 * boxes. It is committed on blur and on Enter rather than per keystroke, since
 * "7" on the way to "72" is a weight the store would otherwise be told about.
 *
 * The stored weight is followed **during the render** rather than in an effect,
 * for the reason `NoteField` gives — and here it does visible work: `setWeight`
 * rounds and refuses anything outside the range, so the box has to come back
 * saying what was actually kept rather than what was typed at it.
 */
function WeightField({ weightKg }: { weightKg: number | null }) {
  const shown = weightKg === null ? '' : String(weightKg);

  const [draft, setDraft] = useState(shown);
  const [seen, setSeen] = useState(weightKg);

  if (weightKg !== seen) {
    setSeen(weightKg);
    setDraft(shown);
  }

  function commit() {
    const trimmed = draft.trim();
    if (!trimmed) {
      setWeight(null);
      setDraft('');
      return;
    }

    const parsed = Number(trimmed);
    const valid = Number.isFinite(parsed);
    setWeight(valid ? parsed : null);

    // A refusal that leaves the box saying "abc" reads as having been accepted.
    // Nothing else puts it right: the stored weight has not moved, so the
    // render-phase catch-up above sees no change to follow.
    if (!valid) setDraft(shown);
  }

  return (
    <input
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
      inputMode="numeric"
      aria-label="Your weight in kilograms"
      placeholder="kg"
      className={`${fieldClass} max-w-[7rem]`}
    />
  );
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-black/[0.06] p-3 dark:border-white/10">
      <p className={`text-xs font-medium ${MUTED}`}>{label}</p>
      <p className={`mt-1 text-xl font-semibold ${SOLID}`}>{value}</p>
      {note && <p className={`mt-1 text-[11px] ${MUTED}`}>{note}</p>}
    </div>
  );
}

export function StrengthPanel({ body }: { body: Body }) {
  const { weightKg, aim } = body;

  const protein = weightKg === null ? null : proteinTarget(weightKg, aim);
  const change = weightKg === null ? null : weeklyChange(weightKg, aim);
  const water = weightKg === null ? null : waterTarget(weightKg);
  const meal = weightKg === null ? null : perMeal(weightKg);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div>
          <label className={`mb-1 block text-xs font-medium ${SOLID}`}>Your weight</label>
          <WeightField weightKg={weightKg} />
          <p className={`mt-1 text-[11px] ${MUTED}`}>
            {MIN_WEIGHT}–{MAX_WEIGHT} kg. Kept in this browser, like everything else here.
          </p>
        </div>

        <div>
          <span className={`mb-1 block text-xs font-medium ${SOLID}`}>What the eating is for</span>
          <div className="inline-flex flex-wrap gap-1 rounded-full border border-black/10 p-0.5 dark:border-white/10">
            {AIMS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setAim(entry.id as Aim)}
                aria-pressed={aim === entry.id}
                title={entry.note}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  aim === entry.id
                    ? `bg-black/[0.06] dark:bg-white/10 ${SOLID}`
                    : `${MUTED} hover:bg-black/5 dark:hover:bg-white/10`
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <p className={`mt-1 text-[11px] ${MUTED}`}>
            {AIMS.find((entry) => entry.id === aim)?.note}
          </p>
        </div>
      </div>

      {protein === null || meal === null || water === null ? (
        <p className={`rounded-xl border border-black/[0.06] p-3 text-sm ${MUTED} dark:border-white/10`}>
          Say what you weigh and the four numbers below fill themselves in. Nothing is guessed from
          an average — an average person&apos;s protein target is nobody&apos;s.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Figure
            label="Protein a day"
            value={`${protein.low}–${protein.high} g`}
            note="The one number worth counting."
          />
          <Figure
            label="Per meal"
            value={`${meal.grams} g`}
            note={`Across about ${meal.meals} meals — the response to one saturates.`}
          />
          <Figure
            label="Water a day"
            value={`${water.low}–${water.high} L`}
            note="Before training is counted."
          />
          <Figure
            label="On the scale"
            value={change === null ? 'Steady' : `${change.low}–${change.high} kg a week`}
            note={
              change === null
                ? 'Holding: the weight should not be moving either way.'
                : 'Faster than that is fat going on, or muscle coming off.'
            }
          />
        </div>
      )}

      <div>
        <h3 className={`mb-2 flex items-center gap-2 text-sm font-semibold ${SOLID}`}>
          <Dumbbell aria-hidden className="h-4 w-4 text-[#D81B60]" />
          Where the protein comes from
        </h3>

        <p className={`mb-3 text-xs ${MUTED}`}>
          Per 100 g <span className="font-medium">as eaten</span> — cooked, drained, off the bone.
          A raw-weight table reads about a third higher and quietly makes every day look finished.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[30rem] text-left text-sm">
            <thead>
              <tr className={`border-b border-black/[0.06] text-xs ${MUTED} dark:border-white/10`}>
                <th className="py-2 pr-3 font-medium">Food</th>
                <th className="py-2 pr-3 font-medium">Per 100 g</th>
                <th className="py-2 pr-3 font-medium">A portion</th>
                <th className="py-2 font-medium">
                  {protein === null ? 'Portions a day' : `To reach ${protein.low} g`}
                </th>
              </tr>
            </thead>
            <tbody>
              {PROTEIN_SOURCES.map((source) => (
                <tr
                  key={source.name}
                  className="border-b border-black/[0.04] last:border-b-0 dark:border-white/[0.06]"
                >
                  <td className={`py-2 pr-3 ${SOLID}`}>
                    {source.name}
                    {source.kind === 'plant' && (
                      <span className="ml-1.5 rounded-full bg-[#047857]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#047857] dark:bg-[#047857]/20 dark:text-[#6EE7B7]">
                        plant
                      </span>
                    )}
                  </td>
                  <td className={`py-2 pr-3 ${MUTED}`}>{source.per100} g</td>
                  <td className={`py-2 pr-3 ${MUTED}`}>
                    {source.portion} — {source.portionGrams} g
                  </td>
                  <td className={`py-2 ${MUTED}`}>
                    {protein === null ? '—' : `×${portionsFor(source, protein.low)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className={`mb-2 text-sm font-semibold ${SOLID}`}>The part that is not a number</h3>
        <ul className="grid gap-3 sm:grid-cols-2">
          {STRENGTH_RULES.map((rule) => (
            <li key={rule.title} className="rounded-xl border border-black/[0.06] p-3 dark:border-white/10">
              <p className={`text-sm font-medium ${SOLID}`}>{rule.title}</p>
              <p className={`mt-1 text-xs ${MUTED}`}>{rule.detail}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
