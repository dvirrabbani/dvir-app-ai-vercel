/**
 * The little bit of formatting a cell can carry: a bold word, a title over a
 * paragraph, a word struck out, a phrase under a highlighter.
 *
 * It is *stored* in the cell rather than beside it. `**this**` is bold,
 * `*this*` is italic, `~~this~~` is struck through, `==this==` is marked with a
 * highlighter, `` `this` `` is code, and a line beginning `# ` or `## ` is a
 * title. Nothing is kept but the characters that make it, which is the rule the
 * whole of `documents.ts` stands on: a column's type says how a string is *read*
 * and never rewrites it. So a column of bold notes retyped as a number column
 * still says every word it did before, asterisks and all, and retyping it back
 * brings the bold round again.
 *
 * That is also why the markers are the ordinary ones rather than something of
 * this project's own. A table read out of the backup file, or copied into a
 * message, reads as what it is instead of as tags somebody has to guess at.
 *
 * **Nobody types them.** A cell is written in a surface that shows the bold word
 * bold and never shows the asterisks at all — see
 * `components/document/rich-text.tsx`. So this module is a pair of translations
 * rather than an editor: `readRichText` turns the stored string into something
 * to draw, `writeRichText` turns what was drawn back into a stored string, and
 * the two have to be inverses or a cell would gather markers every time it was
 * opened and closed. `plainRichText` is the third direction — the words with no
 * markers at all — and it is what a text column is filtered and sorted by, so a
 * bolded "Apple" sits with the apples rather than in front of every row.
 *
 * Nothing here touches the DOM or storage: strings and plain objects in, the
 * same out.
 */

export type MarkName = 'bold' | 'italic' | 'strike' | 'highlight' | 'code';

/**
 * What each mark is written as. Both ends are the same, as they are in prose.
 *
 * Bold is `__` rather than the `**` this once wrote, and that is the one place
 * the format is chosen against habit. `*` and `**` are made of the same
 * character, so two marks meeting — a bold word with an italic one hard against
 * it — put three asterisks in a row, and `**a***b*` cannot be told apart from
 * `**a*` followed by `**b*`. Nothing decides it; both readings are real. Giving
 * bold a character of its own means the writer can never produce the run at all,
 * and a cell keeps saying what it said however its marks are arranged.
 *
 * `**` is still *read* as bold — see `READ_TOKENS` — so every cell written
 * before this still shows what it always showed.
 */
export const MARK_TOKENS: Record<MarkName, string> = {
  bold: '__',
  italic: '*',
  strike: '~~',
  highlight: '==',
  code: '`',
};

/** A run of characters that are all emphasised the same way. */
export interface RichSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  highlight?: boolean;
  code?: boolean;
}

/** One line of a cell: a title of one of two sizes, or an ordinary line. */
export interface RichLine {
  level: 0 | 1 | 2;
  spans: RichSpan[];
}

/** The deepest title a cell offers. A cell is not a document. */
export const MAX_HEADING_LEVEL = 2;

/** Everything a button or a keystroke can ask for. */
export type RichCommand = MarkName | 'title' | 'subtitle';

/**
 * Every marker that opens something, in the order they are tried.
 *
 * Bold appears twice: `__`, which is what this writes, and `**`, which is what
 * it used to write and what somebody typing markdown by hand will reach for.
 * Order matters in one place — `**` has to be tried before `*`, or every old
 * bold opener would be read as an italic one with an empty first character.
 */
const READ_TOKENS: readonly { mark: MarkName; token: string }[] = [
  { mark: 'bold', token: '__' },
  { mark: 'bold', token: '**' },
  { mark: 'strike', token: '~~' },
  { mark: 'highlight', token: '==' },
  { mark: 'code', token: '`' },
  { mark: 'italic', token: '*' },
];

/**
 * The order marks are laid down in when a cell is written back out — outermost
 * first, and the exact reverse of how `MARK_ORDER` peels them off again.
 *
 * Code is innermost because what is inside it is taken literally: a marker in
 * there is a character somebody wanted to show, which is half the reason for
 * putting it in code, so nothing may be nested inside it.
 */
const WRITE_ORDER: readonly MarkName[] = ['bold', 'strike', 'highlight', 'italic', 'code'];

const HEADING = /^(#{1,2}) (.*)$/;

/**
 * How long a run of asterisks a closing `*` or `**` may sit at the end of.
 *
 * This is only ever reached by a cell written before bold moved to `__`, since
 * nothing here can produce two asterisk marks any more. Such a run has to be
 * read whole rather than searched for a token: the three at the end of
 * `*a**b***` are a bold marker closing and an italic one closing after it, and
 * the outer mark takes the end of the run because reading works outside in. A
 * run of two is a bold marker and nothing else, which is why italic will not
 * close on one — that is the `**` in the middle of `*a **b** c*`, and it
 * belongs to the bold run inside rather than to the italic phrase around it.
 */
const ASTERISK_RUNS: Record<string, readonly number[]> = {
  '**': [2, 3],
  '*': [1, 3],
};

/* -------------------------------------------------------------------------- */
/*  Reading                                                                   */
/* -------------------------------------------------------------------------- */

type Active = Omit<RichSpan, 'text'>;

interface Opener {
  mark: MarkName;
  /** Where what is inside the markers starts and ends. */
  from: number;
  to: number;
  /** Where reading carries on, past the closing marker. */
  next: number;
}

/** How many of `character` run together from `at`. */
function runLength(text: string, at: number, character: string): number {
  let end = at;
  while (end < text.length && text[end] === character) end += 1;
  return end - at;
}

/**
 * Where the mark opened at `from` closes again, or `-1` if it never does.
 *
 * Two rules apply to every mark. A closer has to hug the word it closes, so
 * `a ~~` ends nothing; and an opener with no partner on the line is not an
 * opener at all, and comes out as the characters it is — half-typed formatting
 * shows what has been typed rather than swallowing the rest of the line.
 *
 * The asterisk marks need the third rule above: runs are measured whole, and
 * the mark being closed takes the **end** of the run. Reading works outside in,
 * so the mark looking for its closer is always the outer one, and the outer one
 * is always the last to close — that is the only split of `***` that leaves a
 * well-formed inner marker behind.
 */
function closerFor(text: string, token: string, from: number): number {
  const runs = ASTERISK_RUNS[token] ?? null;

  let at = from + 1;
  while (at < text.length) {
    const found = text.indexOf(token, at);
    if (found === -1) return -1;

    if (!runs) {
      if (!/\s/.test(text[found - 1])) return found;
      at = found + 1;
      continue;
    }

    const length = runLength(text, found, '*');
    const closer = found + length - token.length;

    if (!runs.includes(length) || closer < from || /\s/.test(text[closer - 1])) {
      at = found + length;
      continue;
    }

    return closer;
  }

  return -1;
}

/**
 * Whether a marker starts here, and where its partner is.
 *
 * The opener has to hug the word it opens — so `2 * 3 * 4` is arithmetic rather
 * than an italic three — and a marker already in force is not looked for again,
 * so the inside of a bold run cannot open another one.
 */
function openerAt(text: string, at: number, active: Active): Opener | null {
  for (const { mark, token } of READ_TOKENS) {
    if (active[mark]) continue;
    if (!text.startsWith(token, at)) continue;

    const from = at + token.length;
    if (from >= text.length || /\s/.test(text[from])) continue;

    const closer = closerFor(text, token, from);
    if (closer === -1) continue;

    return { mark, from, to: closer, next: closer + token.length };
  }

  return null;
}

/** One line's worth of emphasis, gathered into runs that are drawn as one. */
function readSpans(text: string, active: Active = {}): RichSpan[] {
  const spans: RichSpan[] = [];
  let plain = '';

  const flush = () => {
    if (plain) spans.push({ text: plain, ...active });
    plain = '';
  };

  let at = 0;
  while (at < text.length) {
    const opener = openerAt(text, at, active);

    if (!opener) {
      plain += text[at];
      at += 1;
      continue;
    }

    flush();
    const inner = text.slice(opener.from, opener.to);

    // Code is what it says it is: a marker inside it is a character somebody
    // meant to show, which is half the reason for putting it in code.
    if (opener.mark === 'code') spans.push({ text: inner, ...active, code: true });
    else spans.push(...readSpans(inner, { ...active, [opener.mark]: true }));

    at = opener.next;
  }

  flush();
  return spans;
}

/**
 * A cell as it is drawn: a line at a time, each with its title level and the
 * runs of emphasis inside it. Blank lines are kept — a gap between paragraphs
 * is something somebody typed on purpose.
 */
export function readRichText(value: string): RichLine[] {
  return value.split('\n').map((line) => {
    const heading = HEADING.exec(line);

    if (heading) {
      return { level: heading[1].length as 1 | 2, spans: readSpans(heading[2]) };
    }

    return { level: 0 as const, spans: readSpans(line) };
  });
}

/**
 * The same cell with its markers taken off — what it *says*, rather than how it
 * looks. Filtering and sorting a text column go through here, so "contains"
 * asks about the words on the screen and a title does not sort under `#`.
 */
export function plainRichText(value: string): string {
  if (
    !value.includes('*') &&
    !value.includes('_') &&
    !value.includes('~') &&
    !value.includes('=') &&
    !value.includes('`') &&
    !value.includes('#')
  ) {
    return value;
  }

  return readRichText(value)
    .map((line) => line.spans.map((span) => span.text).join(''))
    .join('\n');
}

/* -------------------------------------------------------------------------- */
/*  Writing                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A run put between its markers, with any space at either end left outside
 * them: a marker with a space against it is not a marker at all by the rule
 * above, and `** a**` would come back as four asterisks and a word. A run with
 * nothing but space in it gets no markers, since an empty `****` is a pair
 * somebody would have to delete by hand.
 */
function wrap(text: string, token: string): string {
  const body = text.trim();
  if (!body) return text;

  const lead = text.slice(0, text.length - text.trimStart().length);
  const tail = text.slice(text.trimEnd().length);

  return `${lead}${token}${body}${token}${tail}`;
}

/** The outermost mark this span still needs, given the ones already around it. */
function nextMark(span: RichSpan, applied: readonly MarkName[]): MarkName | undefined {
  return WRITE_ORDER.find((name) => span[name] && !applied.includes(name));
}

/**
 * Spans back into a line, one mark at a time from the outside in.
 *
 * Neighbouring spans are taken together only when the mark being laid down is
 * the outermost one *both* of them still want. That is stricter than "both are
 * bold" on purpose: a struck span beside a struck-and-bold one needs the bold
 * marker outside the strike on the second and nowhere at all on the first, so
 * one pair of markers cannot cover them. Where they do agree, a bold phrase
 * with one italic word in it comes out as one pair around the phrase rather
 * than a pair around each word.
 */
function writeSpans(spans: RichSpan[], applied: readonly MarkName[]): string {
  let out = '';
  let at = 0;

  while (at < spans.length) {
    const mark = nextMark(spans[at], applied);

    if (!mark) {
      out += spans[at].text;
      at += 1;
      continue;
    }

    let end = at + 1;
    while (end < spans.length && nextMark(spans[end], applied) === mark) end += 1;

    const run = spans.slice(at, end);
    // Code is last in the order, so every other mark of these spans is already
    // laid down and their text can simply be run together inside it.
    const inner =
      mark === 'code'
        ? run.map((each) => each.text).join('')
        : writeSpans(run, [...applied, mark]);

    out += wrap(inner, MARK_TOKENS[mark]);
    at = end;
  }

  return out;
}

/**
 * The cell as it is stored: the inverse of `readRichText`, and the thing that
 * makes writing in a surface with no markers on it possible at all.
 *
 * One asymmetry is deliberate and cannot be helped. There is no way to escape a
 * marker, so a line somebody has literally typed `**` into comes back bold the
 * next time the cell is opened. Every format that writes its marks into the
 * text has that property; the alternative is an escape character, which would
 * then be the thing showing up in the backup file.
 */
export function writeRichText(lines: RichLine[]): string {
  return lines
    .map((line) => {
      const body = writeSpans(line.spans, []);
      return line.level === 0 ? body : `${'#'.repeat(line.level)} ${body}`;
    })
    .join('\n');
}

/**
 * The keystroke behind a mark or a title, or nothing at all.
 *
 * The usual ones: Ctrl+B and Ctrl+I as everywhere, Ctrl+E for code,
 * Ctrl+Shift+X for a strike-through and Ctrl+Shift+H for the highlighter as the
 * writing boxes people use most do it, and Ctrl+Alt+1 / Ctrl+Alt+2 for the two
 * titles. Plain Ctrl+1 and plain Ctrl+H are the browser's own — its tabs and its
 * history — and a page cannot have them back. Plain Ctrl+X is cut, and taking
 * that away from a writing box would be a poor trade for a strike-through.
 */
export function shortcutCommand(event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): RichCommand | null {
  if (!event.ctrlKey && !event.metaKey) return null;

  const key = event.key.toLowerCase();

  if (event.altKey) {
    if (key === '1') return 'title';
    if (key === '2') return 'subtitle';
    return null;
  }

  switch (key) {
    case 'b':
      return 'bold';
    case 'i':
      return 'italic';
    case 'e':
      return 'code';
    case 'x':
      return event.shiftKey ? 'strike' : null;
    case 'h':
      return event.shiftKey ? 'highlight' : null;
    default:
      return null;
  }
}
