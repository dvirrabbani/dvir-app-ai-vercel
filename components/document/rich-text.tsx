'use client';

/**
 * The two halves of a formatted cell: what it looks like, and the buttons that
 * put the formatting there.
 *
 * `lib/rich-text.ts` owns the markers and every rule about them. This is the
 * surface — the runs of emphasis drawn, and a row of buttons that hands a field
 * and its selection to one of that module's edits.
 *
 * One thing here is deliberate and easy to undo by accident: nothing rendered
 * by `RichText` carries a `dir` of its own. A cell reads in its own direction
 * from the `dir="auto"` on the box around it, and that is read from the first
 * strong character *outside* any descendant setting its own — a `dir` on a
 * line in here would hide the whole cell's writing from it.
 */

import { useMemo } from 'react';
import { Bold, Code, Heading1, Heading2, Italic, Strikethrough } from 'lucide-react';
import {
  EditFn,
  MarkName,
  RichSpan,
  readRichText,
  toggleHeading,
  toggleMark,
} from '@/lib/rich-text';

/** Literal greys: `text-muted-foreground` resolves to nothing in this project. */
const MUTED = 'text-[#4B5563] dark:text-[#9CA3AF]';

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

function Piece({ span }: { span: RichSpan }) {
  const marks = [
    span.bold ? 'font-semibold' : '',
    span.italic ? 'italic' : '',
    span.strike ? 'line-through' : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (span.code) {
    return (
      <code
        className={`rounded bg-black/[0.06] px-1 py-px font-mono text-[0.9em] dark:bg-white/10 ${marks}`}
      >
        {span.text}
      </code>
    );
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
            ? ' '
            : line.spans.map((span, at) => <Piece key={at} span={span} />)}
        </span>
      ))}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Putting it there                                                          */
/* -------------------------------------------------------------------------- */

/**
 * One edit applied to a live field.
 *
 * The whole value is replaced through `setRangeText` rather than assigned, so
 * the browser keeps the change on its own undo stack and Ctrl+Z after a bold
 * still works. The selection is put back where the edit asked for it, which is
 * what lets an empty "bold" leave the cursor between the two markers.
 *
 * An edit that would take the cell past its limit is simply not made: the
 * markers count towards the length like everything else, and a cell filled to
 * the brim would otherwise lose its last two characters to a pair of asterisks.
 */
export function applyEdit(
  field: HTMLTextAreaElement | HTMLInputElement,
  edit: EditFn,
  max: number,
  onChange: (value: string) => void
) {
  const next = edit(field.value, field.selectionStart ?? 0, field.selectionEnd ?? 0);
  if (next.value.length > max) return;

  field.focus();
  field.setRangeText(next.value, 0, field.value.length, 'end');
  field.setSelectionRange(next.start, next.end);
  onChange(field.value);
}

interface ToolbarButton {
  key: string;
  title: string;
  icon: typeof Bold;
  edit: EditFn;
}

const mark = (name: MarkName): EditFn => (value, start, end) => toggleMark(value, start, end, name);

const BUTTONS: readonly ToolbarButton[] = [
  { key: 'h1', title: 'Title (Ctrl+Alt+1)', icon: Heading1, edit: (value, start) => toggleHeading(value, start, 1) },
  { key: 'h2', title: 'Smaller title (Ctrl+Alt+2)', icon: Heading2, edit: (value, start) => toggleHeading(value, start, 2) },
  { key: 'bold', title: 'Bold (Ctrl+B)', icon: Bold, edit: mark('bold') },
  { key: 'italic', title: 'Italic (Ctrl+I)', icon: Italic, edit: mark('italic') },
  { key: 'strike', title: 'Strike through (Ctrl+Shift+X)', icon: Strikethrough, edit: mark('strike') },
  { key: 'code', title: 'Code (Ctrl+E)', icon: Code, edit: mark('code') },
];

/**
 * The buttons under a cell being written in.
 *
 * Each one holds the field's focus down through `mousedown`: the cell commits
 * what is in it when it loses focus, so a button that let focus go would close
 * the cell before its own click ever landed.
 */
export function FormatToolbar({
  field,
  max,
  onChange,
  className = '',
}: {
  /** The box the buttons act on. Held by the caller, which also owns its value. */
  field: React.RefObject<HTMLTextAreaElement | null>;
  max: number;
  onChange: (value: string) => void;
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
          key={button.key}
          type="button"
          title={button.title}
          aria-label={button.title}
          onClick={() => {
            const node = field.current;
            if (node) applyEdit(node, button.edit, max, onChange);
          }}
          className={`rounded p-1 transition-colors hover:bg-black/10 dark:hover:bg-white/10 ${MUTED}`}
        >
          <button.icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}
