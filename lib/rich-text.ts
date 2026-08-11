/**
 * The little bit of formatting a cell can carry: a bold word, a title over a
 * paragraph, a word struck out.
 *
 * It is written *in* the cell rather than beside it. `**this**` is bold, `*this*`
 * is italic, `~~this~~` is struck through, `` `this` `` is code, and a line
 * beginning `# ` or `## ` is a title. Nothing is stored but the characters that
 * were typed, which is the rule the whole of `documents.ts` stands on: a
 * column's type says how a string is *read* and never rewrites it. So a column
 * of bold notes retyped as a number column still says every word it did before,
 * asterisks and all, and retyping it back brings the bold round again.
 *
 * That is also why the markers are the ordinary ones rather than something of
 * this project's own. A table read out of the backup file, or copied into a
 * message, reads as what it is instead of as tags somebody has to guess at.
 *
 * Reading is `readRichText`. `plainRichText` is the other direction — the line
 * with its markers taken off — and it is what a text column is filtered and
 * sorted by, so a bolded "Apple" sits with the apples rather than in front of
 * every row in the table.
 *
 * Nothing here touches the DOM or storage: it is a string in, and either
 * something to draw or a string and a selection back out.
 */

export type MarkName = 'bold' | 'italic' | 'strike' | 'code';

/** What each mark is written as. Both ends are the same, as they are in prose. */
export const MARK_TOKENS: Record<MarkName, string> = {
  bold: '**',
  italic: '*',
  strike: '~~',
  code: '`',
};

/** A run of characters that are all emphasised the same way. */
export interface RichSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
}

/** One line of a cell: a title of one of two sizes, or an ordinary line. */
export interface RichLine {
  level: 0 | 1 | 2;
  spans: RichSpan[];
}

/** The deepest title a cell offers. A cell is not a document. */
export const MAX_HEADING_LEVEL = 2;

/**
 * The order marks are looked for in, which matters in exactly one place: `**`
 * has to be tried before `*`, or every bold opener would be read as an italic
 * one with an empty first character.
 */
const MARK_ORDER: readonly MarkName[] = ['bold', 'strike', 'code', 'italic'];

const HEADING = /^(#{1,2}) (.*)$/;

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

/**
 * Whether a marker starts here, and where its partner is.
 *
 * Two rules keep ordinary writing out of trouble. The opener has to hug the
 * word it opens and the closer has to hug the word it closes — so `2 * 3 * 4`
 * is arithmetic rather than an italic three — and a marker already in force is
 * not looked for again, so the inside of a bold run cannot open another one.
 * An opener with no partner on the line is not an opener at all, and comes out
 * as the character it is: half-typed formatting shows what has been typed so
 * far rather than swallowing the rest of the line.
 */
function openerAt(text: string, at: number, active: Active): Opener | null {
  for (const mark of MARK_ORDER) {
    if (active[mark]) continue;

    const token = MARK_TOKENS[mark];
    if (!text.startsWith(token, at)) continue;

    const from = at + token.length;
    if (from >= text.length || /\s/.test(text[from])) continue;

    let closer = text.indexOf(token, from + 1);
    while (closer !== -1) {
      // A single asterisk that is really half of a `**` belongs to the bold run
      // inside this one, not to this one: `*a **b** c*` is one italic phrase.
      const partOfLonger = mark === 'italic' && (text[closer - 1] === '*' || text[closer + 1] === '*');

      if (!partOfLonger && !/\s/.test(text[closer - 1])) break;
      closer = text.indexOf(token, closer + 1);
    }

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
  if (!value.includes('*') && !value.includes('~') && !value.includes('`') && !value.includes('#')) {
    return value;
  }

  return readRichText(value)
    .map((line) => line.spans.map((span) => span.text).join(''))
    .join('\n');
}

/* -------------------------------------------------------------------------- */
/*  Writing                                                                   */
/* -------------------------------------------------------------------------- */

/** A field's whole contents and where the selection should end up after it. */
export interface Edit {
  value: string;
  start: number;
  end: number;
}

/** What a button or a shortcut does to a field: text and selection in, both out. */
export type EditFn = (value: string, start: number, end: number) => Edit;

/**
 * A mark put on the selection or taken back off it.
 *
 * Whitespace at either end of the selection is left outside the markers, since
 * a marker with a space against it is not a marker at all by the rule above —
 * selecting a word by double-clicking often takes the space after it, and
 * "bold" would silently do nothing.
 *
 * With nothing selected it lays down the pair and stands between them, so the
 * next thing typed comes out bold. That is what makes the button usable before
 * the words exist rather than only after.
 */
export function toggleMark(value: string, start: number, end: number, mark: MarkName): Edit {
  const token = MARK_TOKENS[mark];

  let from = start;
  let to = end;
  while (from < to && /\s/.test(value[from])) from += 1;
  while (to > from && /\s/.test(value[to - 1])) to -= 1;

  const inner = value.slice(from, to);

  if (!inner) {
    const next = `${value.slice(0, start)}${token}${token}${value.slice(start)}`;
    return { value: next, start: start + token.length, end: start + token.length };
  }

  // Already wrapped, with the markers just outside what is selected — which is
  // what you get by selecting the word and pressing the button a second time.
  if (value.slice(from - token.length, from) === token && value.slice(to, to + token.length) === token) {
    const next = value.slice(0, from - token.length) + inner + value.slice(to + token.length);
    return { value: next, start: from - token.length, end: to - token.length };
  }

  // Already wrapped, with the markers inside the selection — dragging across
  // the whole of `**word**` and pressing the button.
  if (inner.length > token.length * 2 && inner.startsWith(token) && inner.endsWith(token)) {
    const bare = inner.slice(token.length, -token.length);
    return { value: value.slice(0, from) + bare + value.slice(to), start: from, end: from + bare.length };
  }

  const next = `${value.slice(0, from)}${token}${inner}${token}${value.slice(to)}`;
  return { value: next, start: from + token.length, end: to + token.length };
}

/**
 * The line the cursor is on made into a title, or made back into a line. Asking
 * for the level it already is takes it off — one button rather than two.
 */
export function toggleHeading(value: string, start: number, level: 1 | 2): Edit {
  const lineStart = start === 0 ? 0 : value.lastIndexOf('\n', start - 1) + 1;
  const break_ = value.indexOf('\n', start);
  const lineEnd = break_ === -1 ? value.length : break_;

  const line = value.slice(lineStart, lineEnd);
  const existing = HEADING.exec(line);
  const bare = existing ? existing[2] : line;

  const wanted = existing && existing[1].length === level ? bare : `${'#'.repeat(level)} ${bare}`;
  const next = value.slice(0, lineStart) + wanted + value.slice(lineEnd);

  const at = Math.max(lineStart, start + (wanted.length - line.length));
  return { value: next, start: at, end: at };
}

/**
 * The keystroke behind a mark, or nothing at all.
 *
 * The usual ones: Ctrl+B and Ctrl+I as everywhere, Ctrl+E for code and
 * Ctrl+Shift+X for a strike-through as the writing boxes people use most do it,
 * and Ctrl+Alt+1 / Ctrl+Alt+2 for the two titles. Ctrl+1 is not offered because
 * the browser keeps it for its own tabs and a page cannot have it back.
 */
export function shortcutEdit(event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): EditFn | null {
  if (!event.ctrlKey && !event.metaKey) return null;

  const key = event.key.toLowerCase();

  if (event.altKey) {
    if (key === '1') return (value, start) => toggleHeading(value, start, 1);
    if (key === '2') return (value, start) => toggleHeading(value, start, 2);
    return null;
  }

  switch (key) {
    case 'b':
      return (value, start, end) => toggleMark(value, start, end, 'bold');
    case 'i':
      return (value, start, end) => toggleMark(value, start, end, 'italic');
    case 'e':
      return (value, start, end) => toggleMark(value, start, end, 'code');
    // Plain Ctrl+X is cut, and taking that away from a writing box would be a
    // poor trade for a strike-through.
    case 'x':
      return event.shiftKey ? (value, start, end) => toggleMark(value, start, end, 'strike') : null;
    default:
      return null;
  }
}
