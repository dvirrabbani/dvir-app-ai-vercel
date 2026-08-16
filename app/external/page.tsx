'use client';

/**
 * External: the pages that aim past this browser, gathered behind one link.
 *
 * A hub rather than a parent — Data, Contact, Calendar and Poll keep their own
 * top-level routes, so every bookmark and every link already written to them
 * still lands. What changed is the way in: the navbar was ten links long and
 * these four have a thing in common, which is that none of them is only about
 * the person sitting here. A file leaving for another device, a message
 * addressed to somebody, days shared with other people's diaries, an answer
 * somebody else gives.
 *
 * The storage underneath is the same localStorage as everywhere else, and the
 * cards say so where it matters — "external" is what a page is aiming at, not a
 * claim that there is a server behind it.
 */

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, CalendarDays, HardDriveDownload, Mail, Vote } from 'lucide-react';
import { Footer } from '@/components/layout/footer';
import { InnerLink } from '@/components/about/inner-link';
import { MUTED, SOLID } from '@/components/finance/shared';

export default function ExternalPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#FFF5F8] via-[#FAFAFA] to-[#FAFAFA] dark:from-[#1C1C1E] dark:via-[#1C1C1E] dark:to-[#1C1C1E]">
      <div className="container mx-auto max-w-6xl px-4 pb-16 pt-24 md:px-6 md:pt-28">
        <Link
          href="/"
          className={`mb-6 inline-flex items-center gap-2 text-sm transition-colors hover:text-[#171717] dark:hover:text-white md:mb-8 ${MUTED}`}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>

        <motion.header
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <h1 className={`text-3xl font-bold md:text-4xl ${SOLID}`}>External</h1>
          <p className={`mt-2 max-w-2xl text-base ${MUTED}`}>
            The pages that reach past this browser — a copy of everything leaving for another
            device, something written for somebody else to read, days that belong to other
            people&apos;s diaries too. What is stored is still stored here; what these four have in
            common is where they are aiming.
          </p>
        </motion.header>

        <div className="grid gap-4 md:grid-cols-2">
          <InnerLink
            href="/backup"
            icon={<HardDriveDownload className="h-5 w-5" />}
            title="Data"
            description="Everything this browser holds, written to one file — and read back on another device."
            points={[
              'Download a copy of every feature at once, as one JSON file',
              'Load one back from a file, or straight out of your Google Drive',
              'The only way two devices here ever share anything, there being no server',
            ]}
          />

          <InnerLink
            href="/contact"
            icon={<Mail className="h-5 w-5" />}
            title="Contact"
            description="A message written to somebody — kept here until there is somewhere to send it."
            points={[
              'Name, email and the message itself, in whichever language you write it',
              'Everything sent is listed underneath, newest first',
              'The form says plainly that nothing leaves the browser yet',
            ]}
          />

          <InnerLink
            href="/calendar"
            icon={<CalendarDays className="h-5 w-5" />}
            title="Calendar"
            description="What is coming up — the days that belong to other people's diaries as much as yours."
            points={[
              'Pick a day and write down what is happening on it',
              'The month at a glance, with the days that have something on them marked',
              'Routines live on their own page now, linked from the top of this one',
            ]}
          />

          <InnerLink
            href="/poll"
            icon={<Vote className="h-5 w-5" />}
            title="Poll"
            description="Which of what was shared actually helped — asked of whoever is at this machine."
            points={[
              'Choose who you are, then vote on each thing separately',
              'Add what worked better for you, for the next person to read',
              'A page of its own for adding and editing the things being voted on',
            ]}
          />
        </div>
      </div>

      <Footer />
    </main>
  );
}
