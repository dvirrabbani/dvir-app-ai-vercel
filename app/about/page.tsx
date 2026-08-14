'use client';

/**
 * About, as a page of its own rather than an anchor on the home page.
 *
 * It carries the section that was already written for it, and above that the
 * way into what is kept *inside* it — Management, and Finance under that.
 */

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, Briefcase } from 'lucide-react';
import { AboutSection } from '@/components/sections/about-section';
import { Footer } from '@/components/layout/footer';
import { InnerLink } from '@/components/about/inner-link';
import { MUTED, SOLID } from '@/components/finance/shared';

export default function AboutPage() {
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
          <h1 className={`text-3xl font-bold md:text-4xl ${SOLID}`}>About</h1>
          <p className={`mt-2 max-w-2xl text-base ${MUTED}`}>
            The story below, and the rooms off it. Everything kept in here stays in this browser.
          </p>
        </motion.header>

        <div className="grid gap-4 md:grid-cols-2">
          <InnerLink
            href="/about/management"
            icon={<Briefcase className="h-5 w-5" />}
            title="Management"
            description="The running of things — what has to be kept an eye on rather than read about."
            points={[
              'Finance: money in, money out, and what a month is meant to cost',
              'Presentation: what changes how you look and come across, and what only sells',
              'Lifestyle: sleep, supplements, and what to eat to get stronger',
            ]}
          />
        </div>
      </div>

      <AboutSection />
      <Footer />
    </main>
  );
}
