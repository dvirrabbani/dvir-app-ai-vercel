'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { toDateKey } from '@/lib/calendar';
import { LifestyleSummary } from '@/components/routines/lifestyle-summary';

export default function SummaryPage() {
  // Only the range the summary opens on. Today is read here rather than from the
  // store, so the server render and the first client render agree.
  const [today] = useState<string>(() => toDateKey(new Date()));

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#FFF5F8] via-background to-background dark:from-[#1C1C1E] dark:via-[#1C1C1E] dark:to-[#1C1C1E]">
      <div className="container mx-auto max-w-4xl px-4 pt-24 md:px-6 md:pt-28">
        <Link
          href="/routines"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground md:mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Routines
        </Link>

        <motion.header
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-6 md:mb-8"
        >
          <h1 className="mb-3 text-3xl font-bold text-foreground md:text-4xl lg:text-5xl">Your days</h1>
          <p className="max-w-2xl text-base text-muted-foreground md:text-lg">
            What a stretch of days adds up to. Pick two dates and see how the nights average out, how much was eaten
            and when in the day it all fell — counted from what you wrote down on the routines page.
          </p>
        </motion.header>

        <LifestyleSummary selected={today} />
      </div>
    </main>
  );
}
