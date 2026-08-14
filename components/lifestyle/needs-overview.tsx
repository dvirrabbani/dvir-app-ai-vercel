'use client';

/**
 * What is actually needed, and how much of it you have.
 *
 * This is the page's answer to the question it exists for, and it is deliberately
 * the first thing on it: the tiers are only worth having if the top of the page
 * can say "four of the six that matter" rather than "twenty-two products".
 *
 * The essentials you are missing are named out loud rather than counted. A
 * number tells you there is a gap; the list tells you what to do about it, and
 * this is the one place on the page where that fits in a line.
 */

import { MUTED, SOLID } from '@/components/finance/shared';
import { NEED_FILL, NEED_TEXT } from '@/components/lifestyle/shared';
import { CareItem, NEED_LABEL, NeedTally } from '@/lib/self-care';

function TallyTile({ tally }: { tally: NeedTally }) {
  const percent = tally.total > 0 ? Math.round((tally.have / tally.total) * 100) : 0;

  return (
    <div className="rounded-xl border border-black/[0.06] p-3 dark:border-white/10">
      <p className={`text-xs font-medium ${NEED_TEXT[tally.need]}`}>{NEED_LABEL[tally.need]}</p>

      <p className={`mt-1 text-2xl font-semibold ${SOLID}`}>
        {tally.have}
        <span className={`text-base font-normal ${MUTED}`}>/{tally.total}</span>
      </p>

      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/10"
        role="img"
        aria-label={`${tally.have} of ${tally.total} owned`}
      >
        <div className={`h-full rounded-full ${NEED_FILL[tally.need]}`} style={{ width: `${percent}%` }} />
      </div>

      <p className={`mt-1.5 text-[11px] ${MUTED}`}>{tally.daily} actually used</p>
    </div>
  );
}

export function NeedsOverview({
  tallies,
  missing,
  skipped,
}: {
  tallies: NeedTally[];
  missing: CareItem[];
  /** How many things on the list are there to be avoided rather than bought. */
  skipped: number;
}) {
  const essentials = tallies.find((tally) => tally.need === 'essential');
  const complete = essentials && essentials.total > 0 && missing.length === 0;

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tallies.map((tally) => (
          <TallyTile key={tally.need} tally={tally} />
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-black/[0.06] p-3 dark:border-white/10">
        {complete ? (
          <p className={`text-sm ${SOLID}`}>
            Every essential is ticked. The rest of this page is optional by definition — what is left
            to change is whether the ones you have are actually used.
          </p>
        ) : (
          <>
            <p className={`text-sm font-medium ${SOLID}`}>
              {missing.length === 1 ? 'One essential you do not have yet' : `${missing.length} essentials you do not have yet`}
            </p>
            <ul className={`mt-2 flex flex-wrap gap-x-2 gap-y-1 text-sm ${MUTED}`}>
              {missing.map((item) => (
                <li
                  key={item.id}
                  className="rounded-full bg-black/[0.04] px-2.5 py-0.5 text-xs dark:bg-white/[0.06]"
                  dir="auto"
                >
                  {item.name}
                </li>
              ))}
            </ul>
          </>
        )}

        <p className={`mt-3 text-xs ${MUTED}`}>
          {skipped} more things are on the list below marked{' '}
          <span className={NEED_TEXT.skip}>{NEED_LABEL.skip}</span> — what to leave on the shelf is
          half of what is worth knowing.
        </p>
      </div>
    </div>
  );
}
