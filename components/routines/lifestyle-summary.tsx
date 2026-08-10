'use client';

/**
 * What a stretch of days adds up to: how the nights average out, how many meals
 * and bathroom visits there were, when in the day they fell, and which days have
 * nothing written down at all.
 *
 * Averages are taken over the days that have the thing recorded rather than over
 * the whole range, so a fortnight with three days filled in reads as three days'
 * worth of habit rather than as eleven days of nothing.
 */

import { useCallback, useMemo, useState } from 'react';
import { ChartColumn, Droplets, Utensils } from 'lucide-react';
import { formatDayTitle, fromDateKey } from '@/lib/calendar';
import { DAY_PARTS, DAY_PART_LABELS } from '@/lib/day-parts';
import { DaySummary, RangeSummary, formatDuration, shiftDay } from '@/lib/lifestyle';
import { useLogRange } from '@/lib/use-lifestyle';
import {
  RegionHeader,
  cardClass,
  factClass,
  timeFieldClass,
  timeClass,
} from '@/components/routines/shared';

/** A bar is drawn against the longest night, or against eight hours if that is longer. */
const SLEEP_SCALE_FLOOR = 8 * 60;

function shortDate(date: string): string {
  return fromDateKey(date).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
}

function rangeLabel(date: string): string {
  return fromDateKey(date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* -------------------------------------------------------------------------- */
/*  The pieces                                                                */
/* -------------------------------------------------------------------------- */

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-black/[0.06] p-3 dark:border-white/[0.08]">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** A bar and the number it stands for. The number is what is read; the bar compares. */
function Bar({ value, of, tone }: { value: number; of: number; tone: string }) {
  const width = of > 0 ? Math.round((value / of) * 100) : 0;

  return (
    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/10" aria-hidden>
      <span className={`block h-full rounded-full ${tone}`} style={{ width: `${width}%` }} />
    </span>
  );
}

/** Where in the day the eating and the bathroom trips actually fall. */
function PartSplit({ summary }: { summary: RangeSummary }) {
  const mostMeals = Math.max(1, ...DAY_PARTS.map((part) => summary.mealsByPart[part]));
  const mostVisits = Math.max(1, ...DAY_PARTS.map((part) => summary.visitsByPart[part]));

  return (
    <div className="mt-3 rounded-xl border border-black/[0.06] p-3 dark:border-white/[0.08]">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">When in the day</p>

      <ul className="space-y-2">
        {DAY_PARTS.map((part) => {
          const meals = summary.mealsByPart[part];
          const visits = summary.visitsByPart[part];

          return (
            <li key={part} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="w-16 shrink-0 font-medium text-foreground">{DAY_PART_LABELS[part]}</span>

              <span className="flex min-w-40 flex-1 items-center gap-2">
                <Utensils className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                <Bar value={meals} of={mostMeals} tone="bg-[#FF4D8E]" />
                <span className="w-16 shrink-0 tabular-nums text-muted-foreground">
                  {meals} meal{meals === 1 ? '' : 's'}
                </span>
              </span>

              <span className="flex min-w-40 flex-1 items-center gap-2">
                <Droplets className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                <Bar value={visits} of={mostVisits} tone="bg-[#4338CA] dark:bg-[#A5B4FC]" />
                <span className="w-16 shrink-0 tabular-nums text-muted-foreground">
                  {visits} visit{visits === 1 ? '' : 's'}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DayRow({ day, scale }: { day: DaySummary; scale: number }) {
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-1 py-1 text-xs odd:bg-black/[0.02] dark:odd:bg-white/[0.03]">
      <span className={`w-24 shrink-0 tabular-nums ${day.logged ? 'text-foreground' : 'text-muted-foreground'}`}>
        {shortDate(day.date)}
      </span>

      {day.asleep === null ? (
        <span className="min-w-32 flex-1 text-muted-foreground">
          {day.logged ? 'No night recorded' : 'Nothing logged'}
        </span>
      ) : (
        <span className="flex min-w-32 flex-1 items-center gap-2">
          <Bar value={day.asleep} of={scale} tone="bg-[#FF4D8E]" />
          <span className="w-14 shrink-0 tabular-nums text-foreground">{formatDuration(day.asleep)}</span>
        </span>
      )}

      <span className={`w-24 shrink-0 tabular-nums ${timeClass}`}>
        {day.wokeAt && day.sleptAt ? `${day.sleptAt}→${day.wokeAt}` : day.wokeAt || day.sleptAt || ''}
      </span>

      <span className="flex w-16 shrink-0 items-center justify-end gap-2 tabular-nums text-muted-foreground">
        <span className="inline-flex items-center gap-0.5" title={`${day.meals} meals`}>
          <Utensils className="h-3 w-3" aria-hidden />
          {day.meals}
        </span>
        <span className="inline-flex items-center gap-0.5" title={`${day.visits} bathroom visits`}>
          <Droplets className="h-3 w-3" aria-hidden />
          {day.visits}
        </span>
      </span>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/*  The section                                                               */
/* -------------------------------------------------------------------------- */

/** How many days back each preset reaches, counting today as one of them. */
const PRESETS: Array<{ label: string; days: number }> = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
];

export function LifestyleSummary({ selected }: { selected: string }) {
  // The week ending on the day being looked at, which is the range worth opening
  // on. Both ends are the visitor's from then on.
  const [from, setFrom] = useState(() => shiftDay(selected, -6));
  const [to, setTo] = useState(selected);

  const { summary, today, hydrated } = useLogRange(from, to);

  const applyPreset = useCallback(
    (days: number) => {
      const end = today || selected;
      setFrom(shiftDay(end, -(days - 1)));
      setTo(end);
    },
    [selected, today]
  );

  const scale = Math.max(summary.longestSleep, SLEEP_SCALE_FLOOR);
  const counted = summary.days.length;

  // Per-day figures are worth stating only once there is more than one day to
  // average over, and only against the days actually written down.
  const perDay = useMemo(() => {
    if (summary.logged === 0) return null;
    const rate = (total: number) => (total / summary.logged).toFixed(1).replace(/\.0$/, '');
    return { meals: rate(summary.meals), visits: rate(summary.visits) };
  }, [summary.logged, summary.meals, summary.visits]);

  if (!hydrated) {
    return (
      <section className={`${cardClass} mb-4`}>
        <div className="h-6 w-40 animate-pulse rounded bg-foreground/10" aria-hidden />
        <div className="mt-4 h-20 animate-pulse rounded-xl bg-foreground/5" aria-hidden />
      </section>
    );
  }

  return (
    <section className={`${cardClass} mb-4`}>
      <RegionHeader
        icon={<ChartColumn className="h-5 w-5 text-[#FF4D8E]" />}
        title="How it has been going"
        subtitle={`${rangeLabel(from)} – ${rangeLabel(to)}`}
        aside={
          <span className={factClass}>
            {summary.logged} of {counted} day{counted === 1 ? '' : 's'} logged
          </span>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          From
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="First day of the range"
            className={`${timeFieldClass} px-3 py-1.5`}
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          To
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
            aria-label="Last day of the range"
            className={`${timeFieldClass} px-3 py-1.5`}
          />
        </label>

        <span className="flex flex-wrap gap-1">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => applyPreset(preset.days)}
              title={`The last ${preset.label} up to today`}
              className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-[#FF4D8E]/40 dark:border-white/10"
            >
              {preset.label}
            </button>
          ))}
        </span>
      </div>

      {summary.logged === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing written down between these two days. Log a morning in <em>Your day</em> on the routines page and it
          will start counting.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Usually up" value={summary.wokeAverage || '—'} hint="Average across the days recorded" />
            <Stat label="Usually in bed" value={summary.sleptAverage || '—'} hint="Times after midnight count as the night before" />
            <Stat
              label="Asleep"
              value={summary.asleepAverage === null ? '—' : formatDuration(summary.asleepAverage)}
              hint="Only nights with both ends written down"
            />
            <Stat
              label="Meals · bathroom"
              value={`${summary.meals} · ${summary.visits}`}
              hint={perDay ? `${perDay.meals} and ${perDay.visits} a day` : undefined}
            />
          </div>

          <PartSplit summary={summary} />

          <div className="mt-3 rounded-xl border border-black/[0.06] p-3 dark:border-white/[0.08]">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Day by day</p>
            {/* Long ranges scroll inside the card rather than pushing the routines
                below them off the bottom of the page. */}
            <ul className="max-h-64 space-y-0.5 overflow-y-auto">
              {summary.days.map((day) => (
                <DayRow key={day.date} day={day} scale={scale} />
              ))}
            </ul>
          </div>
        </>
      )}

      <p className="mt-2 text-xs text-muted-foreground">
        Counted from the days written down on the routines page — {formatDayTitle(to)} is as far as this range reaches.
      </p>
    </section>
  );
}
