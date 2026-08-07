---
description: Commit the current branch, size the diff to pick a review model, review it, open the PR, and merge after approval
argument-hint: "[opus|sonnet|haiku] [notes for the reviewer]"
---

# PR and merge

Take the work sitting on the current branch and get it onto `main`: commit it, verify it, size it, have it reviewed by a model matched to the risk, open the PR, and merge once the user says go.

Sizing the diff before reviewing it is the cheapest decision in this whole workflow. A copy tweak handed to Opus burns minutes and tokens for nothing. A change to `sanitizeHtml` handed to Haiku is how an XSS hole reaches `main`. Spend thirty seconds deciding, and the rest of the workflow costs what it should.

## Arguments

`$ARGUMENTS`

If that's empty, run the whole workflow as described below.

If it names a model (`opus`, `sonnet`, `haiku`), skip the judgment in step 3 and use that tier — the user has looked at the change and made the call. Still say in one line what you'd have picked on your own, so a mismatch is visible before the review runs rather than after.

Anything else in the arguments is context for the reviewer — "watch the RTL handling", "the storage migration is the risky part" — so pass it through verbatim in step 4's prompt.

## Preflight

These fail fast and cheap, so run them first:

```bash
gh auth status && git branch --show-current && git status --porcelain
```

- **`gh` not authenticated.** It's installed in this repo's environment but the tool shell often doesn't carry credentials. `gh auth login` is interactive — you can't complete it. Stop and ask the user to run it, then resume.
- **Current branch is `main`.** Never commit onto it. Create a branch first, named in the existing style: `feat/`, `fix/`, or `chore/` plus a kebab-case description of the outcome — `feat/editable-post-categories`, `fix/table-lists-scroll-and-rtl`, `chore/avatar-initials`. Then `git switch -c` and carry the working tree over.

## Step 1 — Commit the work

Stage and commit anything uncommitted. Match the history exactly (see `git log` for a dozen examples):

- Imperative, sentence-case subject with **no `feat:`/`fix:` prefix** — "Let the cover image sit above the title or under the excerpt", not "feat: add cover image position".
- A prose body explaining *why* the change exists, then bullets listing the behavioural consequences a user would notice.
- Trailer: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

Don't push yet. The review in step 4 may turn up something worth fixing, and it's cleaner to fix it before the PR exists than to push a follow-up commit onto an open PR.

## Step 2 — Verify

There is no test suite here, so verification means the type checker, the linter, and (for anything non-trivial) a real build:

```bash
npx tsc --noEmit
```

```bash
bun run lint
```

`next dev` does not surface type errors, so `tsc` is the only thing standing between a type bug and `main`. Run `bun run build` too whenever the change touches routing, `next.config.ts`, server components, or metadata — those break at build time and nowhere earlier.

If anything fails, fix it and re-run before going further. Reporting a green review on top of a red typecheck is worse than not reviewing at all.

## Step 3 — Size the change, then pick the model

Get the shape of the diff:

```bash
git diff main...HEAD --stat
```

Then read the changed file paths and decide. The signals below are about *blast radius*, not line count alone — a four-line change to a type guard can wipe a visitor's stored data, and a four-hundred-line change to page copy cannot.

### Opus — if **any** of these is true

- The diff touches `sanitizeHtml`, its tag/attribute allow-lists, or anything whose output reaches `dangerouslySetInnerHTML`. This is the security boundary of the entire site.
- It touches a storage module (`lib/local-posts.ts`, `lib/poll.ts`, `lib/calendar.ts`, `lib/milestones.ts`, `lib/contact.ts`) — type guards, seeding logic, storage key names, or the `write*` helpers. There is no backend and no backup: a visitor's localStorage is the only copy of their data, and a bad read filter silently deletes it.
- It touches a hook (`lib/use-*.ts`) — snapshot identity in `useSyncExternalStore`, `getServerSnapshot`, or the `hydrated` flag. Mistakes here cause infinite render loops or hydration mismatches that dev mode hides.
- It touches `app/api/auth/**`, `next.config.ts`, middleware, or adds/upgrades a dependency in `package.json`.
- It's large or invasive: roughly 400+ changed lines, 15+ files, or it moves and rewrites existing code rather than adding new code alongside it.

### Haiku — only if **all** of these hold

- The change is confined to copy, `className` and styling, docs, static content, or seed data in `lib/blog.ts` (which only affects browsers that haven't seeded yet).
- Roughly under 50 changed lines across 1–3 files.
- No new control flow, no new stored fields, and no change to what gets written to localStorage.

### Sonnet — everything else

The ordinary case: a new page, a component, a self-contained bug fix, a feature that reads existing stored data without changing its shape.

**When two tiers both look defensible, take the higher one.** Over-reviewing costs a slow minute. Under-reviewing costs a bug on `main` that nobody notices until a visitor's data is already wrong.

Tell the user your pick and the reason in one line before you spawn anything — `Sizing as Sonnet: new calendar filter component, 6 files, no storage-shape change.` They may know something about the change that the diff doesn't show, and this is their chance to say so.

## Step 4 — Delegate the review and the PR text

Spawn **one** `general-purpose` subagent with `model` set to the tier from step 3, `run_in_background: false` (you need the result before you can proceed). One agent does both jobs because it has to read the whole diff either way.

Give it a prompt along these lines, filling in the specifics:

> Review the changes on branch `<branch>` against `main` in `<repo path>`, then draft PR text for them.
>
> Read `CLAUDE.md` first — this is a Next.js App Router site with **no backend**; every feature's data lives in the visitor's `localStorage`, and `lib/<feature>.ts` + `lib/use-<feature>.ts` pairs follow strict conventions documented there.
>
> Start with `git diff main...HEAD` and `git log main..HEAD`. Read the full surrounding files for anything the diff touches — a diff hunk alone rarely shows whether a change is correct.
>
> <any reviewer notes passed in the arguments>
>
> **Do not edit, commit, push, or run `gh`.** You are reviewing only.
>
> Report in two parts:
>
> 1. **Review.** Blocking issues first (correctness, data loss, XSS, hydration, broken RTL/`dir="auto"` handling, contrast failures on small text), then non-blocking notes. For each: file:line, what breaks, and the concrete input or state that triggers it. If you find nothing, say so plainly — don't invent findings to look thorough.
> 2. **PR title and body**, matching this repo's style: imperative sentence-case title with no `feat:`/`fix:` prefix; body is a short prose paragraph on *why*, then bullets of the behavioural consequences a visitor would notice.

When it comes back:

- **Blocking findings** — relay them to the user, fix them, re-run step 2's verification, amend or add a commit. Don't open the PR on top of a known bug.
- **Non-blocking notes** — mention them; let the user decide whether to fold them in now or leave them.
- **Clean** — say so and move on.

Take the findings seriously but not on faith. If something looks wrong, check the file yourself before acting on it — a review agent working from a cold start can misread intent.

## Step 5 — Open the PR

Push, then create it with the drafted text:

```bash
git push -u origin HEAD
```

Use `gh pr create` with the title and body from step 4. End the body with:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Give the user the PR URL as a markdown link.

## Step 6 — Ask, then merge

**Stop here and wait for an explicit go-ahead.** Merging is outward-facing and awkward to undo, and the user asked for this checkpoint deliberately. Summarize in a couple of lines — what the PR does, which model reviewed it and why, whether anything came back — and ask.

Silence, a thumbs-up on the review, or approval of an earlier step is not approval to merge. Wait for the word.

Once they say go, match the history's merge-commit style (`Merge pull request #22 from dvirrabbani/feat/editable-post-categories`), and note that branches are kept, not deleted:

```bash
gh pr merge <number> --merge
```

Then bring the local checkout back in line:

```bash
git checkout main && git pull
```

Report the merge commit and confirm `main` is clean.
