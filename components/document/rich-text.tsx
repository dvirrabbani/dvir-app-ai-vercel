'use client';

/**
 * The two halves of a formatted cell: what it looks like, and the surface it is
 * written in.
 *
 * `lib/rich-text.ts` owns the markers and every rule about them. Nothing here
 * shows one. A cell is *stored* as `__bold__`, and it is written in a
 * contentEditable that shows the word bold — you select what you mean and press
 * the button, exactly as in any other writing box, and the markers are what the
 * cell turns into on its way to storage. That is the whole point of this file:
 * `editorHtml` takes the stored string into something to write in, `linesFromDom`
 * takes it back out, and `writeRichText` turns that into the string again.
 *
 * The surface is deliberately **uncontrolled**: the DOM is the truth while a
 * cell is open, and nothing re-renders it as the writer types. Writing a value
 * back into a contentEditable on every keystroke means rebuilding its text nodes
 * underneath a live caret, which is where editors of this kind go wrong — the
 * blog's editor is written the same way and says the same thing.
 *
 * One thing here is deliberate and easy to undo by accident: nothing rendered by
 * `RichText` carries a `dir` of its own. A cell reads in its own direction from
 * the `dir="auto"` on the box around it, and that is read from the first strong
 * character *outside* any descendant setting its own — a `dir` on a line in here
 * would hide the whole cell's writing from it.
 */

import { useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { Bold, Code, Heading1, Heading2, Highlighter, Italic, Strikethrough } from 'lucide-react';
import {
  MARK_TOKENS,
  MarkName,
  RichCommand,
  RichLine,
  RichSpan,
  readRichText,
  writeRichText,
} from '@/lib/rich-text';

/** Literal greys: `text-muted-foreground` resolves to nothing in this project. */
const MUTED = 'text-[#4B5563] dark:text-[#9CA3AF]';

const MARK_NAMES = Object.keys(MARK_TOKENS) as MarkName[];

/* -------------------------------------------------------------------------- */
/*  Drawing it                                                                */
/* -------------------------------------------------------------------------- */

/**
 * A title is a size rather than a heading element: this is a table cell, and a
 * grid full of `<h1>`s would read to a screen reader as a document with four
 * hundred sections in it. The gap above one is only there when something comes
 * before it, so a cell that opens with a title does not start with a blank line.
 */
function blockClass(level: 0 | 1 | 2): string {
  if (level === 1) return 'block text-base font-bold leading-tight [&:not(:first-child)]:mt-1.5';
  if (level === 2) return 'block text-sm font-bold leading-tight [&:not(:first-child)]:mt-1.5';
  return 'block';
}

/**
 * The highlighter, as a literal pair of colours.
 *
 * A mark has to carry its own text colour rather than letting the cell's
 * through: the same ink that reads on the page's background is what disappears
 * against a yellow one, and a highlight nobody can read out of is worse than no
 * highlight. Each theme therefore states both halves — near-black on pale
 * yellow, pale yellow on dark amber — instead of tinting one and hoping.
 *
 * The same pair is stated once more, in `.rich-cell` in `app/globals.css`, which
 * is what dresses the surface a cell is written in. The two have to match: the
 * whole promise of that surface is that a cell looks the same being written as
 * it does written.
 */
const HIGHLIGHT = 'rounded-[3px] bg-[#FDE68A] px-0.5 text-[#1F2937] dark:bg-[#78350F] dark:text-[#FEF3C7]';

function Piece({ span }: { span: RichSpan }) {
  const marks = [
    span.bold ? 'font-semibold' : '',
    span.italic ? 'italic' : '',
    span.strike ? 'line-through' : '',
    span.highlight ? HIGHLIGHT : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (span.code) {
    // Highlighted code wears the highlighter instead of code's own grey: two
    // backgrounds on one run leaves whichever wins looking like neither.
    const shell = span.highlight ? '' : 'rounded bg-black/[0.06] px-1 py-px dark:bg-white/10';

    return <code className={`font-mono text-[0.9em] ${shell} ${marks}`}>{span.text}</code>;
  }

  return marks ? <span className={marks}>{span.text}</span> : <>{span.text}</>;
}

/**
 * A cell's writing, drawn. Every line is a block of its own rather than the
 * newlines being left to `whitespace-pre-wrap`, because a title has to be a
 * line to be a size — and an empty line keeps its height with a space, so a gap
 * somebody typed between two paragraphs is still there.
 */
export function RichText({ value }: { value: string }) {
  const lines = useMemo(() => readRichText(value), [value]);

  return (
    <>
      {lines.map((line, index) => (
        <span key={index} className={blockClass(line.level)}>
          {line.spans.length === 0
            ? ' '
            : line.spans.map((span, at) => <Piece key={at} span={span} />)}
        </span>
      ))}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  The stored string, as something to write in                               */
/* -------------------------------------------------------------------------- */

/**
 * A title is an attribute on an ordinary block rather than an `<h1>`, for the
 * reason given above — and because it means every block in the surface is the
 * same kind of thing, so splitting one with Enter cannot change what it is.
 */
const TITLE_ATTR = 'data-title';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Nested outermost-first in the same order `writeRichText` lays the markers
 * down, so what is built here and what is read back are the same shape.
 */
function spanHtml(span: RichSpan): string {
  let html = escapeHtml(span.text);

  if (span.code) html = `<code>${html}</code>`;
  if (span.italic) html = `<i>${html}</i>`;
  if (span.highlight) html = `<mark>${html}</mark>`;
  if (span.strike) html = `<s>${html}</s>`;
  if (span.bold) html = `<b>${html}</b>`;

  return html;
}

/** The stored cell as the surface's contents. */
function editorHtml(value: string): string {
  return readRichText(value)
    .map((line) => {
      // An empty block has no line box without one, and the caret cannot be put
      // in a block it cannot measure.
      const inner = line.spans.map(spanHtml).join('') || '<br>';
      const title = line.level === 0 ? '' : ` ${TITLE_ATTR}="${line.level}"`;

      return `<div${title}>${inner}</div>`;
    })
    .join('');
}

/* -------------------------------------------------------------------------- */
/*  …and back out again                                                       */
/* -------------------------------------------------------------------------- */

/**
 * What a tag means. More than one spelling per mark because these come from
 * three places: what `spanHtml` built, what `execCommand` leaves behind — which
 * is `<b>` in one browser and `<strong>` in another — and whatever survives a
 * paste.
 */
const MARK_TAGS: Record<string, MarkName> = {
  B: 'bold',
  STRONG: 'bold',
  I: 'italic',
  EM: 'italic',
  S: 'strike',
  STRIKE: 'strike',
  DEL: 'strike',
  MARK: 'highlight',
  CODE: 'code',
};

/** The marks an element puts on everything inside it. */
function marksOf(element: HTMLElement): MarkName[] {
  const found: MarkName[] = [];

  const tag = MARK_TAGS[element.tagName];
  if (tag) found.push(tag);

  // `styleWithCSS` is turned off on the way in, but a browser that ignores that
  // — or a paste — can still arrive as a style rather than a tag.
  const style = element.style;
  const weight = style.fontWeight;

  if (weight === 'bold' || weight === 'bolder' || Number(weight) >= 600) found.push('bold');
  if (style.fontStyle === 'italic') found.push('italic');
  if (`${style.textDecorationLine} ${style.textDecoration}`.includes('line-through')) found.push('strike');

  const background = style.backgroundColor;
  if (background && background !== 'transparent' && !background.startsWith('rgba(0, 0, 0, 0)')) {
    found.push('highlight');
  }

  return found;
}

function titleOf(block: HTMLElement): 0 | 1 | 2 {
  if (block.tagName === 'H1') return 1;
  if (block.tagName === 'H2') return 2;

  const level = Number(block.getAttribute(TITLE_ATTR));
  return level === 1 || level === 2 ? level : 0;
}

/** Runs that are emphasised the same way become one, which keeps the stored
 *  string as short as what it says rather than as long as how it was typed. */
function merge(spans: RichSpan[]): RichSpan[] {
  const out: RichSpan[] = [];

  for (const span of spans) {
    if (!span.text) continue;

    const previous = out[out.length - 1];
    const same = previous && MARK_NAMES.every((mark) => Boolean(previous[mark]) === Boolean(span[mark]));

    if (same) previous.text += span.text;
    else out.push({ ...span });
  }

  return out;
}

/**
 * One block's worth of lines. A `<br>` starts another: browsers put one in an
 * empty block to give it a height, and a paste can bring any number of them.
 */
function blockLines(block: HTMLElement): RichSpan[][] {
  const lines: RichSpan[][] = [[]];

  const walk = (node: Node, active: MarkName[]) => {
    if (node.nodeType === Node.TEXT_NODE) {
      // A contentEditable writes a run of spaces as non-breaking ones. They are
      // spaces to everybody looking at the cell, so they are spaces in it.
      const text = (node as Text).data.replace(/\u00a0/g, ' ');
      if (!text) return;

      const span: RichSpan = { text };
      for (const mark of active) span[mark] = true;
      lines[lines.length - 1].push(span);
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as HTMLElement;

    if (element.tagName === 'BR') {
      lines.push([]);
      return;
    }

    const next = [...active, ...marksOf(element)];
    for (const child of Array.from(element.childNodes)) walk(child, next);
  };

  for (const child of Array.from(block.childNodes)) walk(child, []);

  // The `<br>` holding an empty block open is not a line break somebody made,
  // and neither is the one a browser leaves at the end of a block it has just
  // been typed into.
  if (lines.length > 1 && lines[lines.length - 1].length === 0 && block.lastChild?.nodeName === 'BR') {
    lines.pop();
  }

  return lines;
}

/** The whole surface, as lines to be written back into the cell. */
function linesFromDom(root: HTMLElement): RichLine[] {
  const blocks = Array.from(root.children).filter((child) => child.nodeName !== 'BR') as HTMLElement[];

  // Nothing but text, which is what a browser can leave behind after the last
  // block in the surface has been deleted.
  if (blocks.length === 0) {
    return blockLines(root).map((spans) => ({ level: 0 as const, spans: merge(spans) }));
  }

  const lines: RichLine[] = [];

  for (const block of blocks) {
    const level = titleOf(block);
    for (const spans of blockLines(block)) lines.push({ level, spans: merge(spans) });
  }

  return lines;
}

/** What the surface currently says, in the form the cell is stored as. */
function readEditor(root: HTMLElement): string {
  return writeRichText(linesFromDom(root));
}

/* -------------------------------------------------------------------------- */
/*  Putting the formatting there                                              */
/* -------------------------------------------------------------------------- */

/** The three marks a browser has a command of its own for. */
const EXEC: Partial<Record<RichCommand, string>> = {
  bold: 'bold',
  italic: 'italic',
  strike: 'strikeThrough',
};

function select(range: Range) {
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function currentRange(root: HTMLElement): Range | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  return root.contains(range.commonAncestorContainer) ? range : null;
}

/** The block of the surface the caret is in — always a direct child of it. */
function blockOf(root: HTMLElement, node: Node | null): HTMLElement | null {
  let at: Node | null = node;
  while (at && at.parentNode && at.parentNode !== root) at = at.parentNode;

  return at && at.nodeType === Node.ELEMENT_NODE && at.parentNode === root ? (at as HTMLElement) : null;
}

/** The nearest element of this kind at or above `node`, stopping at the surface. */
function ancestorTag(root: HTMLElement, node: Node | null, tag: string): HTMLElement | null {
  let at: Node | null = node;

  while (at && at !== root) {
    if (at.nodeType === Node.ELEMENT_NODE && (at as Element).tagName === tag) return at as HTMLElement;
    at = at.parentNode;
  }

  return null;
}

/**
 * The element a mark would be taken *off* — the one the whole selection sits
 * inside — or null, in which case the mark goes on instead.
 *
 * Both ends have to be in the same one, which is the rule that keeps the button
 * a toggle rather than a coin toss. Selecting a marked word and pressing the
 * button again takes the mark off; selecting a whole line that happens to have
 * one marked word in it puts the mark on the line, because the line as a whole
 * is not marked yet and that is plainly what was asked for.
 */
function enclosing(root: HTMLElement, tag: string): HTMLElement | null {
  const range = currentRange(root);
  if (!range) return null;

  const from = ancestorTag(root, range.startContainer, tag);
  return from && from === ancestorTag(root, range.endContainer, tag) ? from : null;
}

/**
 * With nothing selected, a mark lands on the word the caret is in.
 *
 * A surface with no markers on it has nowhere to put an empty pair — the old
 * box could lay down `****` and stand between them, and there is no drawing of
 * that. Taking the word instead means the buttons still work without reaching
 * for the mouse, and it is what the writer meant nine times in ten. Returns
 * false when there is no word to take, which is when a mark does nothing.
 */
function selectWord(root: HTMLElement): boolean {
  const range = currentRange(root);
  if (!range) return false;
  if (!range.collapsed) return true;

  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return false;

  const text = (node as Text).data;
  let from = range.startOffset;
  let to = range.startOffset;

  while (from > 0 && !/\s/.test(text[from - 1])) from -= 1;
  while (to < text.length && !/\s/.test(text[to])) to += 1;
  if (from === to) return false;

  const word = document.createRange();
  word.setStart(node, from);
  word.setEnd(node, to);
  select(word);

  return true;
}

/** An element replaced by what was inside it, with the selection put back over it. */
function unwrap(element: HTMLElement) {
  const parent = element.parentNode;
  if (!parent) return;

  const children = Array.from(element.childNodes);
  for (const child of children) parent.insertBefore(child, element);
  element.remove();

  if (children.length === 0) return;

  const range = document.createRange();
  range.setStartBefore(children[0]);
  range.setEndAfter(children[children.length - 1]);
  select(range);
}

/** One line's worth of a selection wrapped in a mark, or null if there was none. */
function wrapRange(range: Range, tag: 'MARK' | 'CODE'): HTMLElement | null {
  const element = document.createElement(tag.toLowerCase());
  const contents = range.extractContents();

  // Code is taken literally wherever it is read, so it is taken literally here
  // too: nothing survives inside it but the words.
  if (tag === 'CODE') element.textContent = contents.textContent ?? '';
  else element.appendChild(contents);

  if (!element.textContent) return null;

  range.insertNode(element);
  return element;
}

/**
 * The two marks a browser has no command of its own for, put on and taken off
 * again.
 *
 * Nodes are moved by hand rather than through `insertHTML`, which is the way
 * that would have kept these on the browser's undo stack. It cannot be used:
 * `insertHTML` rewrites what it is given to preserve how it looked — a `<mark>`
 * comes back as a `<span>` with the highlighter's colours frozen into a `style`
 * — and a mark that is a colour rather than a tag is one that stops matching
 * the theme the moment the theme changes. So Ctrl+Z does not reach a highlight
 * or a code run; it does reach bold, italic and strike, which are the browser's
 * own commands and much the more used.
 *
 * A mark is applied a line at a time. Lines are separate blocks, and a `<mark>`
 * wrapped round several of them would swallow the breaks between them; going
 * block by block, backwards, means each range is still good when its turn
 * comes, since nothing before it has been touched.
 */
function toggleWrap(root: HTMLElement, tag: 'MARK' | 'CODE') {
  const inside = enclosing(root, tag);

  if (inside) {
    unwrap(inside);
    return;
  }

  const range = currentRange(root);
  if (!range || range.collapsed) return;

  const parts = (Array.from(root.children) as HTMLElement[])
    .filter((block) => range.intersectsNode(block))
    .map((block) => {
      const part = range.cloneRange();

      if (!block.contains(part.startContainer)) part.setStart(block, 0);
      if (!block.contains(part.endContainer)) part.setEnd(block, block.childNodes.length);

      return part;
    });

  // Nothing but bare text in the surface, which a browser can leave behind.
  if (parts.length === 0) parts.push(range);

  const wrapped: HTMLElement[] = [];
  for (const part of parts.reverse()) {
    const element = wrapRange(part, tag);
    if (element) wrapped.unshift(element);
  }

  if (wrapped.length === 0) return;

  // Over what is *inside* the new elements rather than over the elements
  // themselves: a selection sitting outside them reads as unmarked text, and
  // pressing the button a second time would lay a second mark on top of the
  // first instead of taking it off.
  const last = wrapped[wrapped.length - 1];
  const back = document.createRange();
  back.setStart(wrapped[0], 0);
  back.setEnd(last, last.childNodes.length);
  select(back);
}

/**
 * The line the caret is on made into a title, or made back into a line. Asking
 * for the level it already is takes it off — one button rather than two.
 *
 * Returns the way back, since a title is two or three more characters in the
 * stored cell and the cell may not have room for them.
 */
function toggleTitle(root: HTMLElement, level: 1 | 2): (() => void) | null {
  const range = currentRange(root);
  const block = blockOf(root, range?.startContainer ?? null);
  if (!block) return null;

  const was = titleOf(block);
  if (was === level) block.removeAttribute(TITLE_ATTR);
  else block.setAttribute(TITLE_ATTR, String(level));

  return () => {
    if (was === 0) block.removeAttribute(TITLE_ATTR);
    else block.setAttribute(TITLE_ATTR, String(was));
  };
}

/**
 * A new line inside the cell.
 *
 * `insertParagraph` is the browser's own, so the split lands on the undo stack
 * and a block divided in the middle keeps both halves whole. The one thing it
 * gets wrong for this surface is the title: it clones the block it split,
 * attribute and all, so Enter at the end of a title would start a second title.
 * A line begun under a heading is an ordinary line, everywhere.
 */
function insertBreak(root: HTMLElement) {
  document.execCommand('insertParagraph');

  const block = blockOf(root, currentRange(root)?.startContainer ?? null);
  if (block && titleOf(block) !== 0 && !block.textContent) block.removeAttribute(TITLE_ATTR);
}

/* -------------------------------------------------------------------------- */
/*  The surface                                                               */
/* -------------------------------------------------------------------------- */

export interface RichCellHandle {
  /** What the surface says, as the string the cell is stored as. */
  read: () => string;
  focus: () => void;
  /** A mark or a title, from a button or from a keystroke. */
  run: (command: RichCommand) => void;
  /** A line break inside the cell, for the hosts that offer one. */
  breakLine: () => void;
}

export function RichCellEditor({
  value,
  max,
  label,
  className = '',
  onChange,
  ref,
  ...rest
}: {
  /** Read once, on mount: the surface is uncontrolled from then on. */
  value: string;
  /** How long the *stored* cell may be — markers and all. */
  max: number;
  label: string;
  className?: string;
  /**
   * Every change, as the string the cell would be stored as. Only for hosts
   * that have to hold the writing somewhere of their own — the note panel is
   * closed by a click elsewhere, and by then there is no surface left to ask.
   */
  onChange?: (value: string) => void;
  ref?: React.Ref<RichCellHandle>;
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  onBlur?: (event: React.FocusEvent<HTMLDivElement>) => void;
}) {
  const box = useRef<HTMLDivElement>(null);

  /**
   * What happens after every change: the length is checked, and whoever is
   * holding a copy of the writing is told.
   *
   * An edit that would take the cell past what can be stored is simply not
   * made. The markers count towards the length like everything else, so this
   * cannot be left to a `maxLength` on the box — there is no box, and the
   * length being guarded is not the one on the screen. `revert` is for the
   * changes the browser's own undo does not cover; without one, undoing the
   * last thing typed is what puts the cell back.
   */
  const settle = useRef<(revert?: () => void) => void>(() => {});
  settle.current = (revert) => {
    const root = box.current;
    if (!root) return;

    if (readEditor(root).length > max) {
      if (revert) revert();
      else document.execCommand('undo');
    }

    onChange?.(readEditor(root));
  };

  useEffect(() => {
    const root = box.current;
    if (!root) return;

    root.innerHTML = editorHtml(value);

    try {
      // Marks as tags rather than as styles, which is the shape `marksOf` reads
      // back most reliably.
      document.execCommand('styleWithCSS', false, 'false');
      document.execCommand('defaultParagraphSeparator', false, 'div');
    } catch {
      // Not everywhere, and `marksOf` reads styles as well for that reason.
    }

    root.focus();

    // At the end of what is already there: a cell opened to be added to should
    // not have to be clicked again first.
    const range = document.createRange();
    range.selectNodeContents(root);
    range.collapse(false);
    select(range);

    // Mount only: the surface is uncontrolled after this point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      read: () => (box.current ? readEditor(box.current) : value),
      focus: () => box.current?.focus(),
      breakLine: () => {
        const root = box.current;
        if (!root) return;

        insertBreak(root);
        settle.current();
      },
      run: (command) => {
        const root = box.current;
        if (!root) return;

        root.focus();

        if (command === 'title' || command === 'subtitle') {
          const revert = toggleTitle(root, command === 'title' ? 1 : 2);
          settle.current(revert ?? undefined);
          return;
        }

        if (!selectWord(root)) return;

        const exec = EXEC[command];
        if (exec) document.execCommand(exec);
        else toggleWrap(root, command === 'highlight' ? 'MARK' : 'CODE');

        settle.current();
      },
    }),
    [value]
  );

  return (
    <div
      {...rest}
      ref={box}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline
      aria-label={label}
      // Each cell reads in its own direction, on both sides of the edit — see
      // the note at the top of this file.
      dir="auto"
      onInput={() => settle.current()}
      onPaste={(event) => {
        // A screenshot is the host's business: the note panel keeps one beside
        // the writing rather than in it.
        const image = Array.from(event.clipboardData.items).some(
          (item) => item.kind === 'file' && item.type.startsWith('image/')
        );
        if (image) return;

        // Text only, and never the clipboard's HTML. What arrives from another
        // page is arbitrary markup, and this surface has no sanitiser of its
        // own — the marks a cell can hold are the six on the toolbar.
        event.preventDefault();
        document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
        settle.current();
      }}
      className={`rich-cell outline-none ${className}`}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  The buttons                                                               */
/* -------------------------------------------------------------------------- */

interface ToolbarButton {
  command: RichCommand;
  title: string;
  icon: typeof Bold;
}

const BUTTONS: readonly ToolbarButton[] = [
  { command: 'title', title: 'Title (Ctrl+Alt+1)', icon: Heading1 },
  { command: 'subtitle', title: 'Smaller title (Ctrl+Alt+2)', icon: Heading2 },
  { command: 'bold', title: 'Bold (Ctrl+B)', icon: Bold },
  { command: 'italic', title: 'Italic (Ctrl+I)', icon: Italic },
  { command: 'strike', title: 'Strike through (Ctrl+Shift+X)', icon: Strikethrough },
  { command: 'highlight', title: 'Mark (Ctrl+Shift+H)', icon: Highlighter },
  { command: 'code', title: 'Code (Ctrl+E)', icon: Code },
];

/**
 * The buttons under a cell being written in.
 *
 * Each one holds the surface's focus down through `mousedown`: the cell commits
 * what is in it when it loses focus, so a button that let focus go would close
 * the cell before its own click ever landed — and would take the selection the
 * button was about to act on with it.
 */
export function FormatToolbar({
  editor,
  className = '',
}: {
  editor: React.RefObject<RichCellHandle | null>;
  className?: string;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      onMouseDown={(event) => event.preventDefault()}
      className={`flex flex-wrap items-center gap-0.5 ${className}`}
    >
      {BUTTONS.map((button) => (
        <button
          key={button.command}
          type="button"
          title={button.title}
          aria-label={button.title}
          onClick={() => editor.current?.run(button.command)}
          className={`rounded p-1 transition-colors hover:bg-black/10 dark:hover:bg-white/10 ${MUTED}`}
        >
          <button.icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}
