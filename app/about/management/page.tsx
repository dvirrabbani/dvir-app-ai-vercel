'use client';

/**
 * Management: the page inside About, and the way into what is inside it.
 *
 * One thing lives here so far. It is a hub rather than a page with content of
 * its own on purpose — what belongs under "management" is a handful of separate
 * tools, and putting the first one at the top level would make the second one
 * homeless.
 */

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, Wallet } from 'lucide-react';
import { Footer } from '@/components/layout/footer';
import { InnerLink } from '@/components/about/inner-link';
import { MUTED, SOLID } from '@/components/finance/shared';

export default function ManagementPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#FFF5F8] via-[#FAFAFA] to-[#FAFAFA] dark:from-[#1C1C1E] dark:via-[#1C1C1E] dark:to-[#1C1C1E]">
      <div className="container mx-auto max-w-6xl px-4 pb-16 pt-24 md:px-6 md:pt-28">
        <Link
          href="/about"
          className={`mb-6 inline-flex items-center gap-2 text-sm transition-colors hover:text-[#171717] dark:hover:text-white md:mb-8 ${MUTED}`}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to About
        </Link>

        <motion.header
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <h1 className={`text-3xl font-bold md:text-4xl ${SOLID}`}>Management</h1>
          <p className={`mt-2 max-w-2xl text-base ${MUTED}`}>
            The running of things. Everything under here is kept in this browser and shared with
            nobody — there is no server behind any of it.
          </p>
        </motion.header>

        <div className="grid gap-4 md:grid-cols-2">
          <InnerLink
            href="/about/management/finance"
            icon={<Wallet className="h-5 w-5" />}
            title="Finance"
            description="A month at a time: what came in, what went out, and where it went."
            points={[
              'Log money in and money out against a day and a category',
              'Monthly budgets, with a warning before the money is gone',
              'Totals, a spend-by-day strip and a breakdown by category',
            ]}
          />
        </div>
      </div>

      <Footer />
    </main>
  );
}
