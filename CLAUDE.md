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

The one exception is `bun run scripts/rich-text-roundtrip.ts` — a standalone
check that a table cell's stored markers and its editing surface stay exact
inverses. It needs no runner, and the invariant it guards is invisible until a
cell has quietly grown a dozen underscores. See the rich-text section below.

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
| `documents.ts` | `use-documents.ts` | `app/document` |
| `contact.ts` | `use-contact.ts` | `app/contact` |
| `backup.ts` | `use-backup.ts` | `app/backup` |

`backup.ts` is the odd one out: it stores nothing of its own. It is a registry of
every *other* feature's keys and events, so a browser's whole store can be written
to one JSON file and read back on another device — the only way two devices share
anything, there being no server. Adding a feature means adding it to
`BACKUP_FEATURES` too, or it silently stops travelling.

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
width, and reading a fortnight back is not something you do while logging lunch.
That inner route has a
`layout.tsx` for its metadata only: the navbar comes from `app/routines/layout.tsx`,
which wraps it too, and rendering another would put two on the screen.

The editor itself is neither page's:
`components/routines/day-log-editor.tsx` holds it, and both render it against
whatever day they mean. The routines page gives it the day picked below it, in
three columns; every row of the summary's day-by-day list opens the same editor
under itself in one column, because a week read back is where you notice that
Tuesday's bedtime was never written down, and having to go back and re-pick
Tuesday to fix it is what stops it being fixed. There is no save button on either
— each field writes through `lifestyle.ts` as it is changed, so the averages
above the open day re-add themselves as it is filled in.

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

A dish can also be a whole meal with `ingredients` under it — chicken, rice and
salad kept under one name — so a plate is one chip rather than three. Those are
only what the meal is made of: they carry no day-part tags of their own, they are
deduplicated case-insensitively within the meal (`addIngredient` refuses a repeat
or a thirteenth), and `describeDish` is what actually reaches the day log,
`Name — a, b, c`. The log stores that string and not a reference, so renaming the
meal or taking it off the menu leaves every day already written down saying there
was rice. `ENTRY_MAX_LENGTH` in `lifestyle.ts` is sized for that line rather than
a bare name.

`components/routines/diet-menu.tsx` holds both halves: `DishChips`, the tap-to-log
row inside each part, and `DietMenuPanel`, the whole menu behind the salad icon in
the day's heading — one panel rather than three, because a dish moves between the
parts by its tags and three editors would hide that. Each row in the panel carries
its own `IngredientEditor` underneath, in the open rather than behind a disclosure:
two plates with the same name are told apart only by what is under them.

The summary page is a chosen date range (`summariseRange`,
`components/routines/lifestyle-summary.tsx`), opening on the week ending today and
staying where it is put after that. Averages are taken over the days that have the thing written down,
not over the whole range — three logged days out of thirty read as three days of
habit rather than twenty-seven lie-ins. `mealsEaten` is the same range read as
*what* was eaten rather than how much: every logged meal gathered by name
(`MealTally`), most eaten first, with how often, what it was last made of and
when in the day it falls. The name is taken off the front of the logged line with
`splitMeal`, which is why `MEAL_SEPARATOR` lives in `diet.ts` and is imported
here — the line is written by one and read apart by the other, and two copies of
`' — '` would drift. Grouping is case-insensitive and keeps the most recent
spelling, so a meal typed by hand one day and tapped off the menu the next is one
thing eaten twice. Bedtimes are averaged with anything before
noon counted past 24:00, so 23:40 and 00:20 average to 00:00 instead of to midday.
The day-by-day list keeps the blank days visible, because a gap is the finding —
and now because a blank day is the one you open to fill in. That list is rendered
outside the "nothing logged yet" branch for the same reason: a range with nothing
in it is exactly the one worth writing into, and hiding the days would leave no
way to. One day is open at a time, and the list is given more height while it is,
since it is a scroll box sized for one-line rows. A show is not a routine: it comes
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

`documents.ts` is the odd feature out in shape: a table is columns, rows and the
*view* — the filters, the sort and whether the headings are pinned — kept
together in one record, because a way of
looking at a table is part of the table and setting it up again every visit is
the thing that makes a filter not worth having. Cells are stored as the string
that was typed and the column's type only says how that string is *read*
(compared as a number, ordered as a day, matched as text), so retyping a column
can never lose what somebody wrote. Deleting a column takes its cells, its
filters and its sort with it (`deleteColumn`, and `toFilter` on the way back in),
since a filter on a column that is gone hides rows for a reason nothing on screen
could explain. `visibleRows` is the only thing the grid renders from; the stored
row order is never rearranged by a sort.

**`check`** ("Tick box") is the column type that proves the rule about types
only changing how a string is *read*: a tick writes `TICKED` (`'yes'`) and an
untick empties the cell, but `isTicked` accepts any of a small set of spellings
(`yes`, `y`, `true`, `1`, `x`, `✓`, `done`, `ok`), so a column somebody has been
filling in by hand becomes a column of ticked boxes the moment it is retyped —
and retyping it back gives every word return. It offers two filter operators and
no more, and it is the one type `compareCells` treats an empty cell as an answer
rather than a blank, since "not ticked" is half the column rather than a gap in
it. There is no editor: Enter, Space and a click all just turn the box over.

A column type, **`note`** ("Text & pictures"), holds writing and
screenshots in the same cell. The file names live on the row beside the cells
(`Row.images`, column id → names) rather than inside the cell string, so
filtering and sorting still work on the text and a picture is an extra layer
rather than a special value. The bytes go to the **same folder the blog's pasted
screenshots go to** — `lib/image-folder.ts`, one folder per browser — because a
dozen screenshots in localStorage would fill the quota and take the tables down
with it. `lib/use-folder-image.ts` is the React-side counterpart to the blog's
`use-local-images.ts`: a name in, a cached blob URL out, shared by every cell
showing that file. Deleting a cell's picture, a row, a column or a table sweeps
the files through `discardTableImages`, which only removes what *nothing* —
no other cell and no post — still points at; that is what makes a duplicated
row, which points at the very same files, safe. `components/document/picture-folder.tsx`
holds the folder controls (its own copy: the blog's live inside the post
editor's toolbar) and `keepPicture`, which is where every refusal is worded.

A picture is **never stored at less than its full resolution** — `saveImage`
writes the blob it was handed — so how readable one is is only ever a question
of the room it is given. `Thumb` forces no height on it: it is drawn at its own
measurements, shrunk only by the width of the cell or by `capFor` (280px for a
picture on its own, 130px when a cell holds several and is a contact sheet). A
snip small enough to fit therefore comes out at one image pixel per screen
pixel, which is the only size small text in a screenshot is legible at; forcing
a height, as this once did, made everything the other case and a 36-pixel strip
of a screenshot says nothing. The rest is `components/document/picture-viewer.tsx`,
opened by clicking a picture in a cell or in the panel: the whole window, the
arrow keys between the pictures of that cell, and **two sizes that answer
different questions** — fit, to find the part you want, and full size at 1:1 with
the window scrolling, to read it. Its own measurements are on the bar so which
one you are looking at is never a guess. It sits at `z-[70]`, above the page's
own full screen at `z-[60]`, and takes Escape **in the capture phase** — the page
leaves full screen from a listener on the same window, and only getting in front
of it keeps Escape unwinding one layer at a time. The backdrop closes on a click,
but ignores one with `detail > 1`, or the second half of a double-click on a
thumbnail would shut the picture the first half just opened. The note panel
stays open behind it by ignoring mousedowns inside `[VIEWER_MARK]`.

`components/document/table-grid.tsx` is the surface, written to be used the way a
spreadsheet is: click to put the cursor on a cell, type to replace it, Enter down
(adding a row at the bottom), Tab across and round, arrows to move, Escape to put
back. There is no edit button anywhere on purpose.

`app/document` is the one page that is **not** in the site's `max-w-6xl` reading
column: the table takes the window's full width (the heading and the footnote
keep a measure of their own), because a table with eight columns is the widest
thing on this site. Two things follow from that and are easy to undo by accident.
The `<table>` states an explicit width — the sum of what its columns declare —
since `table-fixed` only honours a column's width if the table has one of its
own; left to size itself the browser measures the content instead and a column
dragged to 130px comes out at whatever its heading needs. And the empty column at
the right-hand end declares *no* width, so it soaks up all the slack on a wide
screen instead of the surplus being spread across the data columns. The live
width during a drag is held by the grid rather than the header, because that
total has to move as the handle does.

The headings stick to the top of the scroll box, which is `stickyHeader` on the
table and on by default; the row-number column is always stuck to the left and
is not part of the option. A sticky header needs the line under it drawn as an
inset `box-shadow` rather than a border: `border-collapse` gives a cell's borders
to the *table* to paint, and the table does not travel with the stuck row, so the
border vanishes at exactly the moment it is needed.

A **text cell holds lines, not a line**. It is written in a `contentEditable`
(`RichCellEditor`) that grows with what is in it, so the row grows too and
nothing scrolls inside a slot; the cell renders it back with
`whitespace-pre-wrap`, exactly as a cell in a post's table does. Plain Enter
still commits and goes down — that is what makes a long column quick — and a
break inside the cell is Enter with **any** of Alt, Shift, Ctrl or Cmd held. All
four go through `insertBreak` rather than letting the browser's own default
action do it for Shift, so which modifier a person reaches for cannot change what
happens — and a line begun at the end of a title is a plain line, as it is
everywhere. Number and date cells stay single-line `<input>`s and keep their
ellipsis; they are the reason `onKeyDown` is handed a `read()` rather than
reading `event.currentTarget.value`, since the surface a text cell is written in
has no `value` to read. A `note` cell is the one thing
edited in a panel rather than in place — a screenshot and a paragraph do not fit
on one line of a grid — opened against the cell with `position: fixed` so the
scroll box cannot clip it, committing its writing on unmount because a click
away closes it from a `mousedown` before any blur could fire. A snip pasted onto
the cell itself skips the panel entirely. The page's full screen is a
`fixed inset-0` overlay rather than the browser's own Fullscreen API — the same
workspace, given the whole window, without hiding the browser's chrome as well.
Escape unwinds one layer at a time: the edit, then the cell, then full screen.

Those lines can carry **formatting, stored in the cell rather than beside it**
(`lib/rich-text.ts`, drawn and written by `components/document/rich-text.tsx`):
`__bold__`, `*italic*`, `~~struck~~`, `==marked==` (the highlighter),
`` `code` ``, and a line opening `# ` or `## ` as a title. It is markers rather
than a second field for one reason — the rule that a cell stores the string that
was typed and the type only says how it is *read*. A bold column retyped as a
number keeps every underscore and gives all of it back when it is retyped again.

**Nobody ever sees a marker.** A cell is written in a `contentEditable` showing
the bold word bold, so the markers are only a storage format — you select what
you mean and press a button, as in any other writing box. That makes
`lib/rich-text.ts` a pair of translations that have to be exact inverses:
`readRichText` into something to draw, `writeRichText` back into the string. If
they ever drift, a cell gains markers every time it is opened and closed — not
loudly, just `____word____` a fortnight later. `scripts/rich-text-roundtrip.ts`
is the check for exactly that (write → read → write over random span
structures, plus stability on hand-typed markers and a timing bound on hostile
input); run it after any change to either.

Two consequences to know before touching the format:

- **Bold is `__`, not `**`.** `*` and `**` share a character, so a bold word with
  an italic one hard against it puts three asterisks in a row and `**a***b*`
  cannot be told apart from `**a*` followed by `**b*` — both readings are real
  and nothing decides between them. Giving bold a character of its own means the
  writer can never produce the run. `**` is still *read* as bold, so every cell
  written before this still says what it said.
- **The look is stated twice.** `Piece`/`blockClass` draw the finished cell in
  Tailwind classes; `.rich-cell` in `app/globals.css` dresses the one being
  written, because half of what is in that one is put there by the browser's own
  commands and arrives as a bare `<b>` or `<mark>` with no class on it. The
  values have to match — the whole promise is that a cell looks the same being
  written as it does written.

Marks are put on by Ctrl+B / Ctrl+I / Ctrl+E / Ctrl+Shift+X / Ctrl+Shift+H,
titles by Ctrl+Alt+1 and Ctrl+Alt+2 (Ctrl+1 and plain Ctrl+H belong to the
browser and cannot be had), and by the `FormatToolbar` under the cell being
written in — whose buttons hold the surface's focus down through `mousedown`,
since letting it go would commit and close the cell before the click ever
landed, taking the selection with it. With nothing selected a mark lands on the
word the caret is in: a surface with no markers on it has nowhere to show an
empty pair. Bold, italic and strike are the browser's own commands and Ctrl+Z
reaches them; the highlighter and code move nodes by hand and it does not, since
`insertHTML` rewrites a `<mark>` into a `<span>` with the colours frozen into a
`style` and a mark that is a colour stops matching the theme. Pasting puts in
text and never the clipboard's HTML — what arrives from another page is
arbitrary markup and the marks a cell can hold are the six on the toolbar.

Reading the markers back, an opener has to hug the word it opens and a closer
the word it closes, so `2 * 3 * 4` is arithmetic; an unclosed marker stays the
character it is. Filtering and sorting a `text` or `note` column go through
`plainRichText` (`readable` in `documents.ts`), so "is" asks about the words on
the screen and a bolded *Zebra* sorts under Z rather than in front of the table
under an underscore. Nothing `RichText` draws sets a `dir` of its own, for the
reason given above; the surface itself carries `dir="auto"` so a Hebrew cell
reads right-to-left while it is being written as well as after.

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

A table cell reads in its own direction, on both sides of the edit: the display
element and the field it is typed in both carry `dir="auto"`, so a Hebrew line
and an English one can sit in the same column and each hug its own edge. The
table itself never turns round — the columns stay in the order they were made and
the row numbers stay on the left. One trap worth knowing: `dir="auto"` reads the
first strong character *outside* any descendant that sets its own `dir`, so the
text inside `NoteCellBody` deliberately has none. Giving it one would hide it
from the wrapper and leave the pictures above it facing the other way.

## Styling

`app/globals.css` (~650 lines) holds the whole design system: HSL CSS variables for light (`:root`) and dark (`.dark`), the `@theme inline` bridge to Tailwind tokens, and hand-written utility classes the components rely on — `.glass`, `.glass-card`, `.glass-panel`, `.gradient-brand-text`, `.glow-pink|blue|orange`, `.hover-lift`, `.animate-float`, `.container-mobile`, `.rte-content` (blog prose). `components/ui/glass-card.tsx` is the component form of the glass treatment.

Brand colours are `#FF4D8E` (pink, primary), `#00C2FF` (blue), `#FF9100` (orange). Existing code frequently hardcodes these hex values in `className` alongside the CSS variables — match whichever the surrounding file uses rather than converting.

Pink text on a pink tint background does not clear WCAG contrast at small sizes (measured 2.3:1 on the calendar's event chips, `app/calendar/page.tsx`) — below the 4.5:1 minimum for text under 18px. Where a brand-colour-on-brand-tint combination fails contrast, substitute a darker/lighter pair of the same hue family (e.g. indigo `#312E81`/`#C7D2FE`) rather than forcing the literal brand hex through; check new small-text-on-tint combinations before using them.

## Commit style

History uses an imperative, sentence-case subject with no `feat:`/`fix:` prefix ("Let the cover image sit above the title or under the excerpt"), a prose body explaining *why* and listing behavioural consequences as bullets, and a `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` trailer. Work happens on branches merged via PR into `main`.
