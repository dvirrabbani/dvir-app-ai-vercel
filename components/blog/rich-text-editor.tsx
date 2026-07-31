'use client';

import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Heading2,
  Heading3,
  Pilcrow,
  List,
  ListOrdered,
  Quote,
  Code,
  Link2,
  Link2Off,
  Minus,
  Undo2,
  Redo2,
  RemoveFormatting,
  PilcrowLeft,
  PilcrowRight,
  Check,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { countWords, sanitizeHtml } from '@/lib/local-posts';

const EMPTY_PARAGRAPH = '<p><br></p>';

export interface RichTextEditorHandle {
  /** Current HTML of the editable surface. */
  getHtml: () => string;
  /** Replaces the content (used for resets and restored drafts). */
  setHtml: (html: string) => void;
  focus: () => void;
}

/** `null` lets the browser choose per the first strong character typed. */
export type EditorDirection = 'ltr' | 'rtl' | null;

interface RichTextEditorProps {
  /** Read once, on mount — the editor is uncontrolled from then on. */
  initialHtml?: string;
  placeholder?: string;
  className?: string;
  onBlur?: (html: string) => void;
  direction?: EditorDirection;
  onDirectionChange?: (direction: EditorDirection) => void;
  ref?: React.Ref<RichTextEditorHandle>;
}

/**
 * The editor is deliberately uncontrolled: the contentEditable DOM is the source
 * of truth, and nothing here re-renders while the user types.
 *
 * Writing `value` back into a contentEditable on every keystroke means rebuilding
 * its text nodes underneath a live caret, which is where controlled rich-text
 * editors typically go wrong. Instead, word count, toolbar state and the
 * placeholder are updated imperatively, and the page *pulls* the HTML through the
 * ref handle at the few moments it needs it (preview, autosave, save).
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const STATEFUL_COMMANDS = ['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList'];

function ToolbarButton({
  onClick,
  command,
  title,
  children,
  active,
}: {
  onClick: () => void;
  /** Marks the button as stateful; `block:h2` style values track the block type. */
  command?: string;
  title: string;
  children: React.ReactNode;
  /** For buttons driven by React state rather than by `refreshUi`. */
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      data-command={command}
      data-active={active === undefined ? undefined : String(active)}
      // Keep the caret in the editor: mousedown would otherwise blur it first.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors',
        'hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10',
        'data-[active=true]:bg-[#FF4D8E]/10 data-[active=true]:text-[#FF4D8E]'
      )}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />;
}

export function RichTextEditor({
  initialHtml,
  placeholder,
  className,
  onBlur,
  direction = null,
  onDirectionChange,
  ref,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  const savedRangeRef = useRef<Range | null>(null);

  // The only React state here: the link bar, which is opened by a click, never by typing.
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  /* ---------------------------------------------------------------------- */
  /*  Imperative UI updates                                                  */
  /* ---------------------------------------------------------------------- */

  const refreshUi = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const text = editor.textContent ?? '';

    if (countRef.current) {
      const words = countWords(text);
      countRef.current.textContent = `${words} ${words === 1 ? 'word' : 'words'}`;
    }

    if (surfaceRef.current) {
      const empty = !text.trim() && !editor.querySelector('hr, img');
      surfaceRef.current.dataset.empty = String(empty);
    }

    const toolbar = toolbarRef.current;
    const selection = window.getSelection();
    const insideEditor = Boolean(selection?.anchorNode && editor.contains(selection.anchorNode));
    if (!toolbar || !insideEditor) return;

    let block = 'p';
    try {
      block = (document.queryCommandValue('formatBlock') || 'p').toLowerCase();
    } catch {
      // Some browsers throw when there is no usable selection.
    }

    for (const button of Array.from(toolbar.querySelectorAll<HTMLButtonElement>('[data-command]'))) {
      const command = button.dataset.command ?? '';
      let active = false;

      if (command.startsWith('block:')) {
        const tag = command.slice('block:'.length);
        active = tag === 'p' ? block === 'p' || block === 'div' || block === '' : block === tag;
      } else if (STATEFUL_COMMANDS.includes(command)) {
        try {
          active = document.queryCommandState(command);
        } catch {
          active = false;
        }
      }

      button.dataset.active = String(active);
      button.setAttribute('aria-pressed', String(active));
    }
  }, []);

  /* ---------------------------------------------------------------------- */
  /*  Mount + external control                                               */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    editor.innerHTML = initialHtml || EMPTY_PARAGRAPH;
    refreshUi();

    try {
      // Without this the browser wraps new blocks in <div>; we want <p>.
      document.execCommand('defaultParagraphSeparator', false, 'p');
    } catch {
      // Not supported everywhere — the sanitizer normalises stray <div>s anyway.
    }
    // Intentionally mount-only: the editor is uncontrolled after this point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      getHtml: () => editorRef.current?.innerHTML ?? '',
      setHtml: (html: string) => {
        const editor = editorRef.current;
        if (!editor) return;
        editor.innerHTML = html || EMPTY_PARAGRAPH;
        refreshUi();
      },
      focus: () => editorRef.current?.focus(),
    }),
    [refreshUi]
  );

  useEffect(() => {
    const onSelectionChange = () => refreshUi();
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, [refreshUi]);

  /* ---------------------------------------------------------------------- */
  /*  Commands                                                               */
  /* ---------------------------------------------------------------------- */

  const exec = useCallback(
    (command: string, argument?: string) => {
      editorRef.current?.focus();
      document.execCommand(command, false, argument);
      refreshUi();
    },
    [refreshUi]
  );

  const currentBlock = useCallback((): string => {
    try {
      return (document.queryCommandValue('formatBlock') || 'p').toLowerCase();
    } catch {
      return 'p';
    }
  }, []);

  const toggleBlock = useCallback(
    (tag: 'h2' | 'h3' | 'blockquote' | 'p') => {
      // Pressing an active block button returns the line to a paragraph.
      exec('formatBlock', currentBlock() === tag ? '<p>' : `<${tag}>`);
    },
    [currentBlock, exec]
  );

  const wrapInCode = useCallback(() => {
    const text = window.getSelection()?.toString();
    if (!text) return;
    exec('insertHTML', `<code>${escapeHtml(text)}</code>`);
  }, [exec]);

  const openLinkInput = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

    // The input steals focus, so remember where the link should go.
    savedRangeRef.current = selection.getRangeAt(0).cloneRange();
    setLinkUrl('https://');
    setLinkOpen(true);
  }, []);

  const applyLink = useCallback(() => {
    const url = linkUrl.trim();
    const range = savedRangeRef.current;
    setLinkOpen(false);

    if (!url || url === 'https://' || !range) return;

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    exec('createLink', url);
  }, [exec, linkUrl]);

  /* ---------------------------------------------------------------------- */
  /*  Input handling                                                         */
  /* ---------------------------------------------------------------------- */

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      event.preventDefault();
      const html = event.clipboardData.getData('text/html');
      const text = event.clipboardData.getData('text/plain');

      if (html) {
        document.execCommand('insertHTML', false, sanitizeHtml(html));
      } else {
        document.execCommand('insertText', false, text);
      }
      refreshUi();
    },
    [refreshUi]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!event.metaKey && !event.ctrlKey) return;

      // Ctrl/Cmd+B/I/U are handled by the browser; add the block shortcuts.
      if (event.altKey && event.key === '2') {
        event.preventDefault();
        toggleBlock('h2');
      } else if (event.altKey && event.key === '3') {
        event.preventDefault();
        toggleBlock('h3');
      } else if (event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openLinkInput();
      }
    },
    [openLinkInput, toggleBlock]
  );

  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-white/60 dark:bg-white/5 backdrop-blur-md overflow-hidden',
        'focus-within:border-[#FF4D8E]/50 focus-within:ring-2 focus-within:ring-[#FF4D8E]/20 transition-colors',
        className
      )}
    >
      {/* Toolbar */}
      <div
        ref={toolbarRef}
        className="flex flex-wrap items-center gap-0.5 border-b border-border bg-black/[0.02] dark:bg-white/[0.03] px-2 py-1.5"
      >
        <ToolbarButton command="bold" title="Bold (Ctrl+B)" onClick={() => exec('bold')}>
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton command="italic" title="Italic (Ctrl+I)" onClick={() => exec('italic')}>
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton command="underline" title="Underline (Ctrl+U)" onClick={() => exec('underline')}>
          <Underline className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton command="strikeThrough" title="Strikethrough" onClick={() => exec('strikeThrough')}>
          <Strikethrough className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton command="block:p" title="Paragraph" onClick={() => toggleBlock('p')}>
          <Pilcrow className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton command="block:h2" title="Heading (Ctrl+Alt+2)" onClick={() => toggleBlock('h2')}>
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton command="block:h3" title="Subheading (Ctrl+Alt+3)" onClick={() => toggleBlock('h3')}>
          <Heading3 className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton command="insertUnorderedList" title="Bulleted list" onClick={() => exec('insertUnorderedList')}>
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton command="insertOrderedList" title="Numbered list" onClick={() => exec('insertOrderedList')}>
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton command="block:blockquote" title="Quote" onClick={() => toggleBlock('blockquote')}>
          <Quote className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Inline code" onClick={wrapInCode}>
          <Code className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Divider" onClick={() => exec('insertHorizontalRule')}>
          <Minus className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton title="Add link (Ctrl+K)" onClick={openLinkInput}>
          <Link2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Remove link" onClick={() => exec('unlink')}>
          <Link2Off className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Clear formatting" onClick={() => exec('removeFormat')}>
          <RemoveFormatting className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          title="Right-to-left (Hebrew, Arabic)"
          active={direction === 'rtl'}
          onClick={() => onDirectionChange?.(direction === 'rtl' ? null : 'rtl')}
        >
          {direction === 'rtl' ? <PilcrowRight className="h-4 w-4" /> : <PilcrowLeft className="h-4 w-4" />}
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton title="Undo (Ctrl+Z)" onClick={() => exec('undo')}>
          <Undo2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Redo (Ctrl+Shift+Z)" onClick={() => exec('redo')}>
          <Redo2 className="h-4 w-4" />
        </ToolbarButton>
      </div>

      {/* Link input */}
      {linkOpen && (
        <div className="flex items-center gap-2 border-b border-border bg-[#FF4D8E]/5 px-2 py-2">
          <Link2 className="h-4 w-4 shrink-0 text-[#FF4D8E]" />
          <input
            autoFocus
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                applyLink();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setLinkOpen(false);
              }
            }}
            placeholder="https://example.com"
            aria-label="Link URL"
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-[#FF4D8E]/50"
          />
          <button
            type="button"
            onClick={applyLink}
            title="Apply link"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[#FF4D8E] text-white hover:bg-[#FF4D8E]/90"
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setLinkOpen(false)}
            title="Cancel"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Editable surface */}
      <div ref={surfaceRef} data-empty="true" className="group/rte relative">
        <p className="pointer-events-none absolute start-4 top-4 hidden text-sm text-muted-foreground group-data-[empty=true]/rte:block md:text-base">
          {placeholder ?? 'Write your post…'}
        </p>
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label="Post content"
          // `auto` follows the first strong character, so typing Hebrew flips it.
          dir={direction ?? 'auto'}
          onInput={refreshUi}
          onBlur={() => onBlur?.(editorRef.current?.innerHTML ?? '')}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          onKeyUp={refreshUi}
          onMouseUp={refreshUi}
          className="rte-content min-h-[320px] w-full px-4 py-4 text-sm leading-relaxed text-foreground outline-none md:text-base md:leading-[1.8]"
        />
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
        <span ref={countRef}>0 words</span>
        <span className="hidden sm:inline">Ctrl+B bold · Ctrl+K link · Ctrl+Alt+2 heading</span>
      </div>
    </div>
  );
}
