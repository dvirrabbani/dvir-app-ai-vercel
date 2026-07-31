'use client';

import { Check, ChevronDown } from 'lucide-react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { POST_CATEGORIES, getCategoryColor } from '@/lib/local-posts';

interface CategorySelectProps {
  value: string;
  onChange: (category: string) => void;
  id?: string;
  className?: string;
}

/**
 * A native <select> draws its option list through the operating system, which
 * ignores CSS for hover and selected states. This is the same control built from
 * the menu primitive so every option is legible and highlights as you move over it.
 *
 * Colours are written out rather than taken from the `bg-popover` / `text-foreground`
 * tokens: those are declared in globals.css as bare HSL channels, which Tailwind v4
 * cannot use as colours, so they resolve to nothing (a transparent popover). The rest
 * of the blog UI works around this the same way.
 */
export function CategorySelect({ value, onChange, id, className }: CategorySelectProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        id={id}
        className={cn(
          'group flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm outline-none transition-colors',
          'border border-gray-200 bg-white/60 text-[#1C1C1E] dark:border-white/10 dark:bg-white/5 dark:text-white',
          'hover:border-[#FF4D8E]/40',
          'focus-visible:border-[#FF4D8E]/50 focus-visible:ring-2 focus-visible:ring-[#FF4D8E]/20',
          'data-[state=open]:border-[#FF4D8E]/50 data-[state=open]:ring-2 data-[state=open]:ring-[#FF4D8E]/20',
          className
        )}
      >
        <span className="flex items-center gap-2.5">
          <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: getCategoryColor(value) }} />
          <span className="font-medium">{value}</span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-gray-500 transition-transform duration-200 group-data-[state=open]:rotate-180 dark:text-gray-400" />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        // Width matches the trigger so the list reads as one control, and the
        // surface is fully opaque so option text never sits over the page behind it.
        className={cn(
          'w-(--radix-dropdown-menu-trigger-width) rounded-xl p-1.5 shadow-2xl',
          'border border-gray-200 bg-white dark:border-white/10 dark:bg-[#1C1C1E]'
        )}
      >
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {POST_CATEGORIES.map((category) => {
            const color = getCategoryColor(category);
            const selected = category === value;

            return (
              <DropdownMenuPrimitive.RadioItem
                key={category}
                value={category}
                className={cn(
                  // `category-option` carries the hover and selected states; see globals.css.
                  'category-option relative flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm outline-none transition-colors',
                  'text-[#1C1C1E] dark:text-white'
                )}
                // Inline, so the selected row keeps its colour even while hovered.
                style={selected ? { backgroundColor: `${color}33` } : undefined}
              >
                <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                <span className="flex-1">{category}</span>
                {selected && <Check className="size-4 shrink-0" style={{ color }} />}
              </DropdownMenuPrimitive.RadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
