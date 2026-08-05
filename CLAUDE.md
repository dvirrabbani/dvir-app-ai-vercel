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
| `milestones.ts` | `use-milestones.ts` | `app/milestones` |
| `contact.ts` | `use-contact.ts` | `app/contact` |

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
