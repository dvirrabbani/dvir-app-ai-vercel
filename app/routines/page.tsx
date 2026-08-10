'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, CalendarDays, ChartColumn, ChevronRight } from 'lucide-react';
import { toDateKey } from '@/lib/calendar';
import { EntertainmentSection } from '@/components/routines/entertainment-section';
import { LifestyleSection } from '@/components/routines/lifestyle-section';
import { RoutinesView } from '@/components/routines/routines-view';

export default function RoutinesPage() {
  // Today is read here rather than from the store, so the server render and the
  // first client render agree on which day is selected.
  const [selected, setSelected] = useState<string>(() => toDateKey(new Date()));
  const onSelect = useCallback((key: string) => setSelected(key), []);

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#FFF5F8] via-background to-background dark:from-[#1C1C1E] dark:via-[#1C1C1E] dark:to-[#1C1C1E]">
      <div className="container mx-auto max-w-4xl px-4 pt-24 md:px-6 md:pt-28">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground md:mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>

        <motion.header
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-6 md:mb-8"
        >
          <h1 className="mb-3 text-3xl font-bold text-foreground md:text-4xl lg:text-5xl">Routines</h1>
          <p className="max-w-2xl text-base text-muted-foreground md:text-lg">
            How the day actually went, the things that come round again, and what is on this week — each split into
            morning, noon and evening, and all following the one day you pick. Everything stays in this browser.
          </p>

          <Link
            href="/calendar"
            className="mt-4 inline-flex items-center gap-2 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-[#FF4D8E]/40 dark:border-white/10"
          >
            <CalendarDays className="h-4 w-4" />
            One-off events are on the calendar
          </Link>
        </motion.header>

        {/* The day itself comes first: what actually happened is worth more than
            what was planned, and the routines below are the plan. Reading a month
            of those days back is a page of its own — it wants the whole width,
            and it is not something you do while logging a meal. */}
        <LifestyleSection selected={selected} />

        <Link
          href="/routines/summary"
          className="mb-4 inline-flex items-center gap-2 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-[#FF4D8E]/40 dark:border-white/10"
        >
          <ChartColumn className="h-4 w-4" />
          How a stretch of days has gone
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>

        <RoutinesView selected={selected} onSelect={onSelect} />
        <EntertainmentSection />
      </div>
    </main>
  );
}
