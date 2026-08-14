'use client';

/**
 * Presentation: how to look well and how to come across well, and which of the
 * things sold for both actually do anything.
 *
 * The page is a catalogue with ticks against it rather than an article, because
 * the question it answers is not "what exists" — it is "what of this do I
 * already have, and what am I missing". That is why the tally is the first
 * thing on it and the prose is underneath.
 *
 * Two halves, in one list on purpose. The creams and the teeth are the bought
 * half; the fit of a shirt, standing up straight and asking the second question
 * are the free half, and the free half is the one that moves the needle
 * furthest. A page that put the products first and the posture in a footnote
 * would have the ratio exactly backwards, so they are the same list, sorted by
 * how needed a thing is rather than by what it costs.
 *
 * This is the outward half of one catalogue. The upkeep under it — sleep, what
 * is swallowed, and what is eaten to get stronger — is the Lifestyle page, off
 * the same store and the same module, which is why the tallies here count
 * `itemsOnPage` rather than everything: a page about how you look should not
 * open by telling you that you are missing a vitamin.
 *
 * Everything typed here is this browser's. There is no server behind it, and
 * none of it is medical advice — the page says so at the bottom rather than in
 * a modal nobody reads.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, HeartPulse, ListChecks, Plus, Sparkles } from 'lucide-react';
import { Footer } from '@/components/layout/footer';
import { AddItemForm } from '@/components/lifestyle/add-item-form';
import { CareList } from '@/components/lifestyle/care-list';
import { NeedsOverview } from '@/components/lifestyle/needs-overview';
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

const GROUPS = groupsOnPage('presentation');

export default function PresentationPage() {
  const { items, state, hydrated } = useSelfCare();

  const [filter, setFilter] = useState<Need | 'all'>('all');
  const [adding, setAdding] = useState(false);

  // Everything below counts over this page's groups only. `missing` off the
  // hook is the whole catalogue's, which would have this page listing a
  // supplement among the things you have not got.
  const mine = useMemo(() => itemsOnPage(items, 'presentation'), [items]);

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
            <Sparkles className="h-7 w-7 text-[#D81B60]" />
            Presentation
          </h1>
          <p className={`mt-2 max-w-2xl text-base ${MUTED}`}>
            What actually changes how you look and how you come across, what is only sold that way,
            and which of it you already have. Almost everything that works here is free — the fit of
            a shirt and a straight back beat anything in a bottle.
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
                note="Counted over the things worth having, not over the whole list."
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
                  {/* `items` is the whole catalogue rather than this page's,
                      so a name already used on the other one is caught here
                      with a reason instead of by `addItem` without one. */}
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

            {/* The filter belongs above every group rather than inside one: it is
                a way of reading the whole list, and "show me only what is really
                needed" is the shortest version of this page there is. */}
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

              // A group with nothing left in it under this filter is dropped
              // rather than drawn empty: seven headings over one row is a page
              // that has to be scrolled to find out it says nothing.
              if (groupItems.length === 0) return null;

              return (
                <section key={group.id} className={cardClass}>
                  <SectionTitle
                    icon={GROUP_ICON[group.id]}
                    title={group.label}
                    note={group.note}
                  />
                  <CareList items={groupItems} state={state} />
                </section>
              );
            })}

            {/* The other door into the same catalogue. It is a card rather than
                a line of text because the two pages are halves of one thing,
                and somebody who has just ticked their way down this list is
                exactly the person who has not thought about sleep. */}
            <Link
              href="/about/management/lifestyle"
              className={`${cardClass} group flex items-start gap-4 transition-all hover:-translate-y-0.5 hover:border-[#D81B60]/40 hover:shadow-lg`}
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#D81B60]/10 text-[#D81B60] dark:text-[#F9A8D4]">
                <HeartPulse className="h-5 w-5" />
              </span>

              <div className="min-w-0">
                <h2 className={`text-lg font-semibold ${SOLID}`}>The upkeep underneath →</h2>
                <p className={`mt-1 text-sm ${MUTED}`}>
                  Sleep, supplements, and what to eat to get stronger — the protein target worked out
                  against your own weight. Same list, the half of it that does not show from the
                  outside.
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
