'use client';

/**
 * The day as it actually went, written down beside the routines that planned it:
 * when you got up, what you ate, every trip to the bathroom, when you went to
 * sleep. The editor itself lives in `day-log-editor.tsx`, since the summary page
 * opens the same one under any day of a range; this is the card around it for
 * the one day the routines page has picked.
 */

import { useState } from 'react';
import { HeartPulse, Salad } from 'lucide-react';
import { formatDayTitle } from '@/lib/calendar';
import { formatDuration, sleepMinutes } from '@/lib/lifestyle';
import { useDietMenu } from '@/lib/use-diet';
import { useDayLog } from '@/lib/use-lifestyle';
import { DayLogEditor } from '@/components/routines/day-log-editor';
import { DietMenuPanel } from '@/components/routines/diet-menu';
import { RegionHeader, SmallButton, cardClass, factClass } from '@/components/routines/shared';

export function LifestyleSection({ selected }: { selected: string }) {
  const { log, today, hydrated } = useDayLog(selected);
  const { menu, hydrated: menuReady } = useDietMenu();
  const [menuOpen, setMenuOpen] = useState(false);

  if (!hydrated) {
    return (
      <section className={`${cardClass} mb-4`}>
        <div className="h-6 w-32 animate-pulse rounded bg-foreground/10" aria-hidden />
        <div className="mt-4 h-24 animate-pulse rounded-xl bg-foreground/5" aria-hidden />
      </section>
    );
  }

  // Only today's card fills its time fields in from the clock; any other day has
  // no "now" to speak of and falls back to the hour each part starts at.
  const now = selected === today ? new Date() : null;
  const asleep = sleepMinutes(log);

  return (
    <section className={`${cardClass} mb-4`}>
      <RegionHeader
        icon={<HeartPulse className="h-5 w-5 text-[#FF4D8E]" />}
        title="Your day"
        subtitle={formatDayTitle(selected)}
        aside={
          <>
            {log.wokeAt && <span className={factClass}>Up {log.wokeAt}</span>}
            {log.sleptAt && <span className={factClass}>Bed {log.sleptAt}</span>}
            {asleep !== null && <span className={factClass}>{formatDuration(asleep)} asleep</span>}
            {log.meals.length > 0 && (
              <span className={factClass}>
                {log.meals.length} meal{log.meals.length === 1 ? '' : 's'}
              </span>
            )}
            {log.bathroom.length > 0 && (
              <span className={factClass}>
                {log.bathroom.length} visit{log.bathroom.length === 1 ? '' : 's'}
              </span>
            )}
            <SmallButton
              title={menuOpen ? 'Close your menu' : 'Your menu'}
              active={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <Salad className="h-4 w-4" />
            </SmallButton>
          </>
        }
      />

      {menuOpen && menuReady && <DietMenuPanel menu={menu} />}

      <DayLogEditor date={selected} log={log} now={now} />

      <p className="mt-2 text-xs text-muted-foreground">
        Written down against the day picked below, and placed by its time the same way the routines are. It stays in
        this browser — none of it is sent anywhere.
      </p>
    </section>
  );
}
