'use client';

/**
 * The card one page inside About uses to point at the page inside it.
 *
 * About, Management and Finance are a chain rather than a menu — each page has
 * exactly one thing under it so far — so the card says what is down there and
 * what it is for, rather than being a bare link somebody has to open to find out.
 */

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
// The two literal greys, borrowed rather than written out again — the semantic
// tokens paint nothing in this project, and one pair of hexes beats three.
import { MUTED, SOLID } from '@/components/finance/shared';

export function InnerLink({
  href,
  icon,
  title,
  description,
  points,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  /** What is actually on the page, so the card is not a promise of nothing. */
  points?: string[];
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <Link
        href={href}
        className="group block rounded-2xl border border-white/30 bg-white/60 p-5 backdrop-blur-md transition-all hover:-translate-y-0.5 hover:border-[#D81B60]/40 hover:shadow-lg dark:border-white/10 dark:bg-white/5 md:p-6"
      >
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#D81B60]/10 text-[#D81B60] dark:text-[#F9A8D4]">
            {icon}
          </span>

          <div className="min-w-0 flex-1">
            <h3 className={`flex items-center gap-2 text-lg font-semibold ${SOLID}`}>
              {title}
              <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-1" />
            </h3>
            <p className={`mt-1 text-sm ${MUTED}`}>{description}</p>

            {points && points.length > 0 && (
              <ul className={`mt-3 space-y-1 text-sm ${MUTED}`}>
                {points.map((point) => (
                  <li key={point} className="flex gap-2">
                    <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#D81B60]" />
                    {point}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
