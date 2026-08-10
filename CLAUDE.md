# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun install          # install deps (bun.lock is the lockfile — do not introduce package-lock.json)
bun run dev          # dev server on :3000
bun run build        # production build
bun run start        # serve the production build
bun run lint         # eslint (flat config, eslint-config-next core-web-vitals + typescript)
npx tsc --noEmit     # typecheck — the only way to catch type errors, `next dev` will not
```

There is no test suite and no test runner installed. "Verify" here means `npx tsc --noEmit`, `bun run lint`, `bun run build`, and exercising the page in a browser.

`.claude/launch.json` defines two preview configs: `dev` *attaches* to an already-running server on :3000 (it has no command, so start `bun run dev` yourself first), and `prod` runs `next start -p 3100`.

`.env.local` (from `.env.example`) holds `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Auth is optional for most pages — only `/profile` requires a session; the sign-in button in the navbar is the only other consumer.

## Stack

Next.js 16 App Router · React 19 · TypeScript strict · Tailwind CSS 4 (CSS-first: **no `tailwind.config`**, the theme lives in `app/globals.css` under `@theme inline`) · shadcn/ui (new-york, `components.json`) · framer-motion · next-themes (dark is the default theme) · NextAuth v4 with Google. Path alias `@/*` → repo root.

## The central architecture fact: there is no backend

Every feature's data lives in **the visitor's `localStorage`**. The only server route is `app/api/auth/[...nextauth]/route.ts`. Nothing is persisted anywhere else, nothing is shared between browsers, and the UI says so plainly rather than pretending (see the contact page copy). Do not add "save to server" behaviour, an API route, or a database without being asked — the pages are written around the fact that they cannot.

Each feature is a matched pair of files:

| Storage module (`lib/<feature>.ts`) | Hook (`lib/use-<feature>.ts`) | Pages |
|---|---|---|
| `local-posts.ts` (+ `blog.ts` seed data) | `use-local-posts.ts` | `app/blog/**` |
| `poll.ts` | `use-poll.ts` | `app/poll/**` |
| `calendar.ts` | `use-calendar.ts` | `app/calendar` |
| `routines.ts` | `use-routines.ts` | `app/routines` |
| `lifestyle.ts` | `use-lifestyle.ts` | `app/routines`, `app/routines/summary` |
| `diet.ts` | `use-diet.ts` | `app/routines` |
| `entertainment.ts` | `use-entertainment.ts` | `app/routines` |
| `milestones.ts` | `use-milestones.ts` | `app/milestones` |
| `milestone-cycles.ts` | `use-milestone-cycles.ts` | `app/milestones` |
| `goals.ts` | `use-goals.ts` | `app/milestones` |
| `contact.ts` | `use-contact.ts` | `app/contact` |

Two of those are about repeating work and are easy to mix up. `routines.ts` is the
routines page's open-ended habits — a cadence, no end date, nothing to finish.
`milestone-cycles.ts` is the milestones page's bounded version — a start and an end
date, a cycle of a week/fortnight/month repeating between them, and a percentage
that can reach 100.

`lib/day-parts.ts` is not a feature — it owns the three stretches a day is read in
(`DayPart`, the labels, `partOfDay`, `defaultTimeFor`) because the routines and the
day log are both placed by that same clock, and neither should own it.

`app/routines` stacks three things, all following the one day it has selected: the
**day log** (`lifestyle.ts`) first, then the routines, then **what is on this
week** (`entertainment.ts`). Reading a stretch of those days back is a page of its
own, `app/routines/summary`, linked from under the day log — it wants the whole
width, and it is not something you do while logging a meal. That inner route has a
`layout.tsx` for its metadata only: the navbar comes from `app/routines/layout.tsx`,
which wraps it too, and rendering another would put two on the screen.

The day log is what actually happened — got up at, what you ate, every bathroom
visit, went to sleep at — kept in the same three parts, with the wake-up at the top
of the morning and the bedtime at the bottom of the evening. `sleepMinutes` reads a bedtime later than the wake-up as the night
before, so 23:40 to 07:10 is 7h 30m rather than a negative number. A day emptied
back out is deleted rather than stored as a husk. A meal or a visit already
written down is clicked to change (`updateMeal`, `updateVisit`) and binned to
remove; re-timing one is how it moves to another part of the day, exactly as it
is for a routine task.

`diet.ts` is the menu those meals are picked off, and it is not a record of
anything: it is the standing list of dishes eaten often enough to be worth a chip.
A dish carries the day parts it belongs at, and one tagged with none of them is
eaten at any hour and shows under all three (`dishesForPart`). Taking a dish off
the menu leaves every meal already logged from it alone — the day log stores the
name, not a reference. Nothing is seeded, because what somebody eats is not
something to guess at; the menu fills up from the **Keep** button beside the meal
form, which puts what you just typed on the menu tagged with that part. Names are
unique case-insensitively, so `addDish` and `updateDish` both refuse a duplicate
rather than growing a second chip for the same thing.
`components/routines/diet-menu.tsx` holds both halves: `DishChips`, the tap-to-log
row inside each part, and `DietMenuPanel`, the whole menu behind the salad icon in
the day's heading — one panel rather than three, because a dish moves between the
parts by its tags and three editors would hide that.

The summary page is a chosen date range (`summariseRange`,
`components/routines/lifestyle-summary.tsx`), opening on the week ending today and
staying where it is put after that. Averages are taken over the days that have the thing written down,
not over the whole range — three logged days out of thirty read as three days of
habit rather than twenty-seven lie-ins. Bedtimes are averaged with anything before
noon counted past 24:00, so 23:40 and 00:20 average to 00:00 instead of to midday.
The day-by-day list keeps the blank days visible, because a gap is the finding. A show is not a routine: it comes
out whether or not you are there for it, so it holds a weekday, an optional time
and the episode still to come, and `markWatched` moves it on to the next one while
the weekday carries it into next week.

The routines themselves are three regions, one per cadence. The daily region is
the week: a Sun-to-Sat strip of that week's
days, and the selected day split into **morning (until 12:00), noon (12:00–17:00)
and evening (from 17:00)** by `partOfDay`/`splitByPart`. A task is placed by its own
time, falling back to its group's; anything untimed sits in the morning. Stock
routines have a standing state rather than a time of day, so they keep a list of
their own below the three parts rather than being bucketed.

Within a part the tasks are gathered back under the group they came from
(`gatherByGroup`), each group sitting where its earliest task falls. A named group
puts its name above its tasks; an unnamed one is only there to hold them, so it
renders as a plain list. That is the card only — the editor behind the pencil
lists rows by routine, since group names there would get between the rows being
edited.

Each part is edited on its own (`components/routines/part-editor.tsx`): the pencil
swaps that part's tick list for the same tasks as things to rename, re-time or
remove, plus a form adding to that part. A task added there always carries a time
of `DAY_PART_DEFAULT_TIME` — an empty one would inherit its group's and could land
in a different part — and goes into the group `groupForPart` picks. Re-timing a
task in one part's editor is how it moves to another.

Three of them carry dates, which is the other easy mix-up. A **dated milestone**
(`milestones.ts`, `range`) runs *between* two days and shows the work done against
the time spent. A **cycle** (`milestone-cycles.ts`) repeats between two days. A
**goal** (`goals.ts`) is a single day with no work attached at all: it counts the
months, weeks and days left until then, and is finished by ticking it, not by
filling a bar. `countdownTo` there is the calendar-month arithmetic — it clamps
short months, so 31 Jan + 1 month is 28 Feb rather than 3 Mar.

**The storage module** owns the record types, the `'dvir-<feature>:…'` storage keys, a `<feature>-changed` custom event name, runtime type guards, and every read/write helper. Rules it follows everywhere, which new code must follow too:

- Every function that touches `window` guards with `if (typeof window === 'undefined')` and returns an empty value.
- Every read is wrapped in `try/catch` and filtered through a type guard — storage is user-writable and may be corrupt, truncated, or hostile.
- Every write goes through a single `write*` helper that sets the item **and** dispatches `new CustomEvent(<FEATURE>_EVENT)` on `window`. Skipping the event means open views silently go stale.
- Writes are wrapped in `try/catch` too (private mode / quota) — a failed write is allowed to simply not stick.
- Seeding (`ensureSeeded`, `ensurePollSeeded`) writes defaults **only when the key is absent or unparseable**. An existing empty array is left alone, so "delete everything" stays deleted.

**The hook** is `'use client'` and wraps `useSyncExternalStore`:

- `subscribe` listens to both the custom event (same tab) and `'storage'` (other tabs).
- The *snapshot is the raw localStorage string* (several keys joined by `|` when the feature spans keys), never a parsed object — otherwise React sees a new value every render and loops.
- `getServerSnapshot` returns `null`. The hook turns that into `hydrated: false`, which is how pages render a skeleton without an effect and without a hydration mismatch. **Every page that reads stored data must handle `hydrated === false`.**

`useIsHydrated()` in `use-local-posts.ts` is the standalone version for components that only need the flag.

## Routing conventions

Feature pages are `'use client'` (they read localStorage), so `export const metadata` cannot live in them. Each route therefore has a **`layout.tsx` that exports the metadata and renders `<Navbar />`**; the home page renders its own `Navbar`. Adding a route means adding that layout, plus an entry in `navLinks` in `components/layout/navbar.tsx` and in `components/layout/footer.tsx`.

`app/blog/[slug]/page.tsx` is the one server component of note, and it does nothing but await `params` and hand the slug to a client view — the post itself only exists in the reader's browser. Non-Latin slugs arrive percent-encoded and are decoded before matching (`decodeSlug`).

## Blog specifics

- `lib/blog.ts` is **seed data only**, consumed once via `getDefaultPosts()` during seeding. Editing it does not change what an existing browser shows.
- **HTML sanitizing** (`sanitizeHtml` in `lib/local-posts.ts`) is an allow-list over `DOMParser`: unknown tags are unwrapped, `SCRIPT`/`IFRAME`/`SVG`/etc. are removed with their contents, attributes are stripped except a per-tag list, `<a>` gets forced `rel="noopener noreferrer" target="_blank"`, and images survive only with an `http(s)` src. It is browser-only and **returns `''` during SSR**, so unsanitized markup can never be rendered.
- Content is sanitized on save *and again on read* before any `dangerouslySetInnerHTML` — storage is not trusted between the two.
- Derived fields are computed at save time in `components/blog/post-editor.tsx`: plain text via `htmlToPlainText` (what the TTS player speaks), `estimateReadingTime`, `detectDirection`, `detectLanguage`, `uniqueSlug`. Keep them in sync — nothing recomputes them later.
- Cover images use a plain `<img>`, not `next/image`, because the URL is author input pointing at an arbitrary host. `next.config.ts` `remotePatterns` only covers the two hosts used by hardcoded content.

## Bidirectional text

The site is written to hold Hebrew and English in the same page. `applyAutoDirection` stamps `dir="auto"` on every block element of saved post HTML, and user-entered strings elsewhere (event titles, milestone names, contact messages) are rendered with `dir="auto"`. `dir` is on the global attribute allow-list in the sanitizer for this reason. Any new user-authored text field should carry `dir="auto"`.

## Styling

`app/globals.css` (~650 lines) holds the whole design system: HSL CSS variables for light (`:root`) and dark (`.dark`), the `@theme inline` bridge to Tailwind tokens, and hand-written utility classes the components rely on — `.glass`, `.glass-card`, `.glass-panel`, `.gradient-brand-text`, `.glow-pink|blue|orange`, `.hover-lift`, `.animate-float`, `.container-mobile`, `.rte-content` (blog prose). `components/ui/glass-card.tsx` is the component form of the glass treatment.

Brand colours are `#FF4D8E` (pink, primary), `#00C2FF` (blue), `#FF9100` (orange). Existing code frequently hardcodes these hex values in `className` alongside the CSS variables — match whichever the surrounding file uses rather than converting.

Pink text on a pink tint background does not clear WCAG contrast at small sizes (measured 2.3:1 on the calendar's event chips, `app/calendar/page.tsx`) — below the 4.5:1 minimum for text under 18px. Where a brand-colour-on-brand-tint combination fails contrast, substitute a darker/lighter pair of the same hue family (e.g. indigo `#312E81`/`#C7D2FE`) rather than forcing the literal brand hex through; check new small-text-on-tint combinations before using them.

## Commit style

History uses an imperative, sentence-case subject with no `feat:`/`fix:` prefix ("Let the cover image sit above the title or under the excerpt"), a prose body explaining *why* and listing behavioural consequences as bullets, and a `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` trailer. Work happens on branches merged via PR into `main`.
