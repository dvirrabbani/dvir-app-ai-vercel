/**
 * The one check this repo has, and it is here because the thing it checks
 * cannot be seen by looking.
 *
 * A cell is stored as `__bold__` and written in a surface that shows the bold
 * word bold, so `readRichText` and `writeRichText` have to be exact inverses of
 * each other. If they drift, nothing breaks loudly: a cell quietly gathers
 * markers every time it is opened and closed, and by the time anybody notices
 * it says `____word____`.
 *
 * Run it after any change to `lib/rich-text.ts`:
 *
 *     bun run scripts/rich-text-roundtrip.ts
 *
 * It exits non-zero on the first handful of failures and prints the string that
 * caused each one.
 */

import {
  MarkName,
  RichLine,
  RichSpan,
  plainRichText,
  readRichText,
  writeRichText,
} from '../lib/rich-text';

const MARKS: MarkName[] = ['bold', 'italic', 'strike', 'highlight', 'code'];

let failures = 0;
const fail = (what: string, detail: string) => {
  failures += 1;
  console.log(`FAIL ${what}\n     ${detail}`);
};

/* ------------------------------------------------------------------ */
/*  1. Fixed cases: what the old parser did, and what it got wrong      */
/* ------------------------------------------------------------------ */

const reads: [string, string][] = [
  ['__bold__', 'bold'],
  ['**bold**', 'bold'],
  ['*italic*', 'italic'],
  ['~~struck~~', 'struck'],
  ['==marked==', 'marked'],
  ['`code`', 'code'],
  ['# Title', 'Title'],
  ['## Smaller', 'Smaller'],
  ['*a **b** c*', 'a b c'],
  ['*a**b***', 'ab'],
  ['**a*b***', 'ab'],
  ['***both***', 'both'],
  ['2 * 3 * 4', '2 * 3 * 4'],
  ['**unclosed', '**unclosed'],
  ['plain', 'plain'],
  ['`**not bold**`', '**not bold**'],
];

for (const [input, plain] of reads) {
  const got = plainRichText(input);
  if (got !== plain) fail(`plain(${JSON.stringify(input)})`, `got ${JSON.stringify(got)} want ${JSON.stringify(plain)}`);
}

// The two cases the old parser could not read at all.
const nested = readRichText('*a**b***')[0].spans;
if (!(nested.length === 2 && nested[0].italic && !nested[0].bold && nested[1].italic && nested[1].bold)) {
  fail('bold inside italic', JSON.stringify(nested));
}
const other = readRichText('**a*b***')[0].spans;
if (!(other.length === 2 && other[0].bold && !other[0].italic && other[1].bold && other[1].italic)) {
  fail('italic inside bold', JSON.stringify(other));
}

/* ------------------------------------------------------------------ */
/*  2. Random structures: write -> read must give the same structure    */
/* ------------------------------------------------------------------ */

let seed = 20260811;
const random = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const pick = <T,>(list: readonly T[]): T => list[Math.floor(random() * list.length)];

const WORDS = ['a', 'ab', 'hello', 'שלום', 'x y', 'one two', '3', 'a-b'];

function randomSpan(): RichSpan {
  const span: RichSpan = { text: pick(WORDS) };
  const count = Math.floor(random() * 3);
  for (let index = 0; index < count; index++) {
    const mark = pick(MARKS);
    span[mark] = true;
  }
  // Code takes everything literally, so nothing else can be inside it; the
  // writer nests it innermost, which is the same statement from the other side.
  return span;
}

/** The shape the writer is asked for, normalised the way reading gives it back. */
function normalise(lines: RichLine[]): RichLine[] {
  return lines.map((line) => {
    const spans: RichSpan[] = [];

    for (const span of line.spans) {
      if (!span.text) continue;
      const previous = spans[spans.length - 1];
      const same =
        previous &&
        MARKS.every((mark) => Boolean(previous[mark]) === Boolean(span[mark]));

      if (same) previous.text += span.text;
      else spans.push({ ...span });
    }

    return { level: line.level, spans };
  });
}

const shape = (lines: RichLine[]) =>
  JSON.stringify(
    normalise(lines).map((line) => [
      line.level,
      line.spans.map((span) => [span.text, MARKS.filter((mark) => span[mark]).join('+')]),
    ])
  );

let checked = 0;
for (let trial = 0; trial < 4000; trial++) {
  const lines: RichLine[] = [];
  const lineCount = 1 + Math.floor(random() * 3);

  for (let index = 0; index < lineCount; index++) {
    const spanCount = Math.floor(random() * 4);
    lines.push({
      level: pick([0, 0, 0, 1, 2]) as 0 | 1 | 2,
      spans: Array.from({ length: spanCount }, randomSpan),
    });
  }

  const written = writeRichText(lines);
  const back = readRichText(written);
  checked += 1;

  if (shape(lines) !== shape(back)) {
    fail('round trip', `${JSON.stringify(written)}\n     want ${shape(lines)}\n     got  ${shape(back)}`);
    if (failures > 8) break;
  }

  // Writing what was read must be stable: opening and closing a cell twice
  // cannot keep adding markers to it.
  const again = writeRichText(back);
  if (again !== written) {
    fail('not stable', `${JSON.stringify(written)} -> ${JSON.stringify(again)}`);
    if (failures > 8) break;
  }
}

/* ------------------------------------------------------------------ */
/*  3. Opening and closing a cell repeatedly must reach a fixed point   */
/* ------------------------------------------------------------------ */

const typed = [
  'a_b_c',
  '__init__',
  'snake_case_name',
  '2*3*4',
  '2 * 3 * 4',
  'a ** b',
  '****',
  '___',
  '# not a title? it is',
  'C:\\path\\to_file__name',
  'הטקסט __מודגש__ כאן',
  '`a` `b` `c`',
  '==a==*b*__c__~~d~~`e`',
];

for (const start of typed) {
  const once = writeRichText(readRichText(start));
  const twice = writeRichText(readRichText(once));
  if (once !== twice) fail(`unstable ${JSON.stringify(start)}`, `${JSON.stringify(once)} -> ${JSON.stringify(twice)}`);

  // Whatever it decides the markers mean, the words must survive.
  if (plainRichText(once) !== plainRichText(start)) {
    fail(`words lost ${JSON.stringify(start)}`, `${JSON.stringify(plainRichText(start))} -> ${JSON.stringify(plainRichText(once))}`);
  }
}

/* ------------------------------------------------------------------ */
/*  4. Storage is user-writable: a hostile cell must not hang the tab   */
/* ------------------------------------------------------------------ */

const CELL_MAX = 2000;
const hostile = ['*', '**', '***', '_', '__', '~', '~~', '=', '==', '`', '#', '*_~=`']
  .map((unit) => unit.repeat(Math.ceil(CELL_MAX / unit.length)).slice(0, CELL_MAX));

for (const cell of hostile) {
  const started = performance.now();
  plainRichText(cell);
  writeRichText(readRichText(cell));
  const spent = performance.now() - started;
  if (spent > 250) fail('slow', `${JSON.stringify(cell.slice(0, 12))}… took ${spent.toFixed(0)}ms`);
}

console.log(`${checked} random structures checked, ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
