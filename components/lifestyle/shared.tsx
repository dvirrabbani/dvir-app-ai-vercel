'use client';

/**
 * The bits the lifestyle panels draw with.
 *
 * The greys, the buttons, the fields and the cards are borrowed wholesale from
 * `components/finance/shared.tsx` rather than written again — this page sits
 * beside Finance under Management and two sets of near-identical hexes would
 * drift apart within a month. Only what is genuinely this page's own lives
 * here: the four tiers and how they are drawn.
 */

import { Hand, Moon, Pill, Shirt, Smile, Sun, Users } from 'lucide-react';
import { CareGroup, Need } from '@/lib/self-care';

/**
 * A group's icon, kept here rather than on either page because both pages draw
 * groups and two copies would drift the moment a group moved between them.
 */
export const GROUP_ICON: Record<CareGroup, React.ReactNode> = {
  skin: <Sun className="h-5 w-5 text-[#D81B60]" />,
  body: <Hand className="h-5 w-5 text-[#D81B60]" />,
  teeth: <Smile className="h-5 w-5 text-[#D81B60]" />,
  style: <Shirt className="h-5 w-5 text-[#D81B60]" />,
  presence: <Users className="h-5 w-5 text-[#D81B60]" />,
  sleep: <Moon className="h-5 w-5 text-[#D81B60]" />,
  supplement: <Pill className="h-5 w-5 text-[#D81B60]" />,
};

/**
 * A tier's colour, as a literal pair rather than a semantic token — the tokens
 * paint nothing in this project, for the reason `finance/shared.tsx` sets out.
 *
 * None of these is the brand pink: `#FF4D8E` on its own tint measures about
 * 2.3:1, and every one of these labels is small text.
 */
export const NEED_STYLE: Record<Need, string> = {
  essential: 'bg-[#BE123C]/10 text-[#BE123C] dark:bg-[#BE123C]/20 dark:text-[#FDA4AF]',
  helpful: 'bg-[#047857]/10 text-[#047857] dark:bg-[#047857]/20 dark:text-[#6EE7B7]',
  optional: 'bg-[#4338CA]/10 text-[#4338CA] dark:bg-[#4338CA]/25 dark:text-[#C7D2FE]',
  skip: 'bg-[#92400E]/10 text-[#92400E] dark:bg-[#92400E]/25 dark:text-[#FCD34D]',
};

/** The same four as a bare text colour, for a number rather than a chip. */
export const NEED_TEXT: Record<Need, string> = {
  essential: 'text-[#BE123C] dark:text-[#FDA4AF]',
  helpful: 'text-[#047857] dark:text-[#6EE7B7]',
  optional: 'text-[#4338CA] dark:text-[#C7D2FE]',
  skip: 'text-[#92400E] dark:text-[#FCD34D]',
};

/** The bar behind a tally. Same four hues, as a background this time. */
export const NEED_FILL: Record<Need, string> = {
  essential: 'bg-[#BE123C]',
  helpful: 'bg-[#047857]',
  optional: 'bg-[#4338CA]',
  skip: 'bg-[#92400E]',
};

export function NeedChip({ need, label }: { need: Need; label: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${NEED_STYLE[need]}`}
    >
      {label}
    </span>
  );
}

/**
 * A tick that is a button rather than a checkbox.
 *
 * `aria-pressed` rather than `checked`: this is a state being turned over, and
 * the label changes with it, which is what a toggle button is for.
 */
export function ToggleChip({
  on,
  label,
  title,
  onClick,
  icon,
}: {
  on: boolean;
  label: string;
  title: string;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={title}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
        on
          ? 'border-[#047857]/30 bg-[#047857]/10 text-[#047857] dark:border-[#6EE7B7]/25 dark:bg-[#047857]/20 dark:text-[#6EE7B7]'
          : 'border-black/10 text-[#4B5563] hover:bg-black/5 dark:border-white/10 dark:text-[#9CA3AF] dark:hover:bg-white/10'
      }`}
    >
      <span aria-hidden className="flex h-3.5 w-3.5 items-center justify-center">
        {icon}
      </span>
      {label}
    </button>
  );
}
