'use client';

/**
 * Lifestyle: the upkeep under the presentation.
 *
 * The other door into one catalogue. Presentation is what shows from the
 * outside and is judged in the first ten seconds; this is the machinery under
 * it — what you sleep, what you swallow, and what you eat to get stronger.
 * Both pages read `lib/self-care.ts` and write the same store, and each counts
 * over `itemsOnPage` rather than over everything, so a tick here shows up in
 * this page's tally and nowhere it would only be noise.
 *
 * The strength panel is the reason the split falls where it does. It is the one
 * thing on either page that is a calculation rather than a list, it needs a
 * weight to do anything at all, and it belongs beside the supplements it shares
 * half its answers with rather than under a list of creams.
 *
 * Everything typed here is this browser's. There is no server behind it, and
 * none of it is medical advice — the page says so at the bottom rather than in
 * a modal nobody reads.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, Dumbbell, HeartPulse, ListChecks, Plus, Sparkles } from 'lucide-react';
import { Footer } from '@/components/layout/footer';
import { AddItemForm } from '@/components/lifestyle/add-item-form';
import { CareList } from '@/components/lifestyle/care-list';
import { NeedsOverview } from '@/components/lifestyle/needs-overview';
import { StrengthPanel } from '@/components/lifestyle/strength-panel';
import { GROUP_ICON, NEED_TEXT } from '@/components/lifestyle/shared';
import {
  MUTED,
  SOLID,
  SectionTitle,
  Skeleton,
  cardClass,
  quietButtonClass,
} from '@/components/finance/shared';
import {
  NEED_LABEL,
  Need,
  groupsOnPage,
  isKeepable,
  itemsInGroup,
  itemsOnPage,
  missingEssentials,
  tally,
} from '@/lib/self-care';
import { useSelfCare } from '@/lib/use-self-care';

/** The three tiers with ticks against them. `skip` is counted, never tallied. */
const TALLIED: readonly Need[] = ['essential', 'helpful', 'optional'];

/** What the filter offers: every tier, plus everything. */
const FILTERS: readonly (Need | 'all')[] = ['all', 'essential', 'helpful', 'optional', 'skip'];

const GROUPS = groupsOnPage('lifestyle');

export default function LifestylePage() {
  const { items, state, body, hydrated } = useSelfCare();

  const [filter, setFilter] = useState<Need | 'all'>('all');
  const [adding, setAdding] = useState(false);

  // This page's groups only — see the note on the same line in Presentation.
  const mine = useMemo(() => itemsOnPage(items, 'lifestyle'), [items]);

  const tallies = useMemo(() => TALLIED.map((need) => tally(mine, state, need)), [mine, state]);
  const missing = useMemo(() => missingEssentials(mine, state), [mine, state]);

  const skipped = useMemo(() => mine.filter((item) => !isKeepable(item)).length, [mine]);
  const customCount = useMemo(() => items.filter((item) => item.custom).length, [items]);

  const shown = useMemo(
    () => (filter === 'all' ? mine : mine.filter((item) => item.need === filter)),
    [mine, filter]
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
          className="mb-6"
        >
          <h1 className={`flex items-center gap-2 text-3xl font-bold md:text-4xl ${SOLID}`}>
            <HeartPulse className="h-7 w-7 text-[#D81B60]" />
            Lifestyle
          </h1>
          <p className={`mt-2 max-w-2xl text-base ${MUTED}`}>
            The upkeep under how you look: what you sleep, what is actually worth swallowing, and
            what to eat to get stronger. The short list of supplements that do something is shorter
            than the shelf suggests, and the best thing on this page is free.
          </p>
        </motion.header>

        {!hydrated ? (
          <div className={cardClass}>
            <Skeleton rows={4} />
          </div>
        ) : (
          <div className="space-y-6">
            <section className={cardClass}>
              <SectionTitle
                icon={<ListChecks className="h-5 w-5 text-[#D81B60]" />}
                title="Where you are"
                note="Counted over this page's list, not the whole catalogue."
                action={
                  !adding && (
                    <button
                      type="button"
                      onClick={() => setAdding(true)}
                      className={`${quietButtonClass} ${SOLID}`}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add your own
                    </button>
                  )
                }
              />

              {adding && (
                <div className="mb-5 rounded-xl border border-black/[0.06] p-3 dark:border-white/10">
                  {/* The whole catalogue for the duplicate check, this page's
                      groups for the dropdown — as on Presentation. */}
                  <AddItemForm
                    items={items}
                    groups={GROUPS}
                    customCount={customCount}
                    onDone={() => setAdding(false)}
                  />
                </div>
              )}

              <NeedsOverview tallies={tallies} missing={missing} skipped={skipped} />
            </section>

            <div className={`${cardClass} flex flex-wrap items-center gap-2`}>
              <span className={`text-sm font-medium ${SOLID}`}>Show</span>

              {FILTERS.map((tier) => (
                <button
                  key={tier}
                  type="button"
                  onClick={() => setFilter(tier)}
                  aria-pressed={filter === tier}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    filter === tier
                      ? `border-black/10 bg-black/[0.06] dark:border-white/10 dark:bg-white/10 ${
                          tier === 'all' ? SOLID : NEED_TEXT[tier]
                        }`
                      : `border-transparent ${MUTED} hover:bg-black/5 dark:hover:bg-white/10`
                  }`}
                >
                  {tier === 'all' ? 'Everything' : NEED_LABEL[tier]}
                </button>
              ))}
            </div>

            {GROUPS.map((group) => {
              const groupItems = itemsInGroup(shown, group.id);
              if (groupItems.length === 0) return null;

              return (
                <section key={group.id} className={cardClass}>
                  <SectionTitle icon={GROUP_ICON[group.id]} title={group.label} note={group.note} />
                  <CareList items={groupItems} state={state} />
                </section>
              );
            })}

            <section className={cardClass}>
              <SectionTitle
                icon={<Dumbbell className="h-5 w-5 text-[#D81B60]" />}
                title="Strength and what it takes to feed it"
                note="The half that is built rather than bought — worked out from your weight."
              />
              <StrengthPanel body={body} />
            </section>

            {/* Back across to the other half, for the same reason that page
                points here: they are one thing read in two sittings. */}
            <Link
              href="/about/management/presentation"
              className={`${cardClass} group flex items-start gap-4 transition-all hover:-translate-y-0.5 hover:border-[#D81B60]/40 hover:shadow-lg`}
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#D81B60]/10 text-[#D81B60] dark:text-[#F9A8D4]">
                <Sparkles className="h-5 w-5" />
              </span>

              <div className="min-w-0">
                <h2 className={`text-lg font-semibold ${SOLID}`}>What shows from the outside →</h2>
                <p className={`mt-1 text-sm ${MUTED}`}>
                  Skin, teeth, clothes and the way you carry yourself — the half of the list that is
                  judged in the first ten seconds, and mostly free.
                </p>
              </div>
            </Link>

            <p className={`text-center text-xs ${MUTED}`}>
              None of this is medical advice, and the doses are the ones the usual guidance lands on
              rather than a prescription — a pharmacist or a doctor settles anything that matters.
              Everything you tick or type lives in this browser&apos;s storage; to carry it to
              another device, write a file from the{' '}
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
