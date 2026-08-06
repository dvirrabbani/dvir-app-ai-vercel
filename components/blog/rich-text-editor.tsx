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
  ImagePlus,
  FolderOpen,
  Table,
  Rows3,
  Columns3,
  TableRowsSplit,
  TableColumnsSplit,
  BetweenHorizonalStart,
  Check,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  countWords,
  isImageUrl,
  isSafeImageSrc,
  sanitizeHtml,
} from '@/lib/local-posts';
import {
  FolderStatus,
  IMAGE_FOLDER_EVENT,
  folderName,
  folderStatus,
  folderSupported,
  forgetFolder,
  pickFolder,
  reconnectFolder,
  saveImage,
} from '@/lib/image-folder';
import { LOCAL_IMAGE_ATTR, prepareLocalImages, restoreLocalImages, useLocalImages } from '@/lib/use-local-images';

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

/** Which kind of URL the inline input is collecting, or `null` when it is closed. */
type UrlMode = 'link' | 'image' | null;

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
  requiresTable,
}: {
  onClick: () => void;
  /** Marks the button as stateful; `block:h2` style values track the block type. */
  command?: string;
  title: string;
  children: React.ReactNode;
  /** For buttons driven by React state rather than by `refreshUi`. */
  active?: boolean;
  /** Disabled unless the caret is inside a table. */
  requiresTable?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      data-command={command}
      // `disabled` is driven imperatively by refreshUi. Setting it here as well
      // would let React own the prop, and React suppresses onClick for a button
      // it believes is disabled — even after the DOM property is flipped back.
      data-requires-table={requiresTable ? '' : undefined}
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
  const columnTargetRef = useRef<{ table: HTMLTableElement; index: number } | null>(null);

  // The only React state here: the inline bars, opened by a click, never by typing.
  const [urlMode, setUrlMode] = useState<UrlMode>(null);
  const [urlValue, setUrlValue] = useState('');
  const [tableOpen, setTableOpen] = useState(false);
  const [tableRows, setTableRows] = useState(3);
  const [tableColumns, setTableColumns] = useState(3);
  const [columnOpen, setColumnOpen] = useState(false);
  const [columnWidth, setColumnWidth] = useState('');
  const [folderOpen, setFolderOpen] = useState(false);
  const [folderState, setFolderState] = useState<FolderStatus>('none');
  const [folderLabel, setFolderLabel] = useState<string | null>(null);
  const [folderNotice, setFolderNotice] = useState<string | null>(null);

  // Pasted images are references until something reads them out of the folder.
  useLocalImages(editorRef);

  const refreshFolder = useCallback(async () => {
    setFolderState(await folderStatus());
    setFolderLabel(await folderName());
  }, []);

  useEffect(() => {
    void refreshFolder();
    const onChange = () => void refreshFolder();
    window.addEventListener(IMAGE_FOLDER_EVENT, onChange);
    return () => window.removeEventListener(IMAGE_FOLDER_EVENT, onChange);
  }, [refreshFolder]);

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
    const anchor = selection?.anchorNode ?? null;
    const insideEditor = Boolean(anchor && editor.contains(anchor));

    // Runs before the early return below, so these start out disabled on mount
    // and switch off again as soon as the caret leaves the table.
    if (toolbar) {
      const anchorElement = insideEditor
        ? anchor!.nodeType === Node.ELEMENT_NODE
          ? (anchor as Element)
          : anchor!.parentElement
        : null;
      const insideTable = Boolean(anchorElement?.closest('td, th'));

      for (const button of Array.from(toolbar.querySelectorAll<HTMLButtonElement>('[data-requires-table]'))) {
        button.disabled = !insideTable;
      }
    }

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

    editor.innerHTML = prepareLocalImages(initialHtml || '') || EMPTY_PARAGRAPH;
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
      // Never the raw innerHTML: pasted images are showing blob URLs, and a blob
      // URL saved into a post would be dropped by the sanitizer as unreadable.
      getHtml: () => (editorRef.current ? restoreLocalImages(editorRef.current) : ''),
      setHtml: (html: string) => {
        const editor = editorRef.current;
        if (!editor) return;
        editor.innerHTML = prepareLocalImages(html || '') || EMPTY_PARAGRAPH;
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

  const insertImage = useCallback(
    (url: string) => {
      if (!isSafeImageSrc(url)) return;
      exec('insertHTML', `<img src="${escapeHtml(url.trim())}" alt="">`);
    },
    [exec]
  );

  /* ---------------------------------------------------------------------- */
  /*  Tables                                                                 */
  /* ---------------------------------------------------------------------- */

  /** The cell the caret sits in, or null when the caret is outside a table. */
  const currentCell = useCallback((): HTMLTableCellElement | null => {
    const editor = editorRef.current;
    const node = window.getSelection()?.anchorNode;
    if (!editor || !node || !editor.contains(node)) return null;

    const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
    return (element?.closest('td, th') as HTMLTableCellElement | null) ?? null;
  }, []);

  /**
   * The table's `<colgroup>`, created if missing and always holding exactly one
   * `<col>` per column. Column widths live here rather than on the cells: one
   * place per column instead of one per row, which is also what survives a row
   * being added or deleted.
   */
  const syncColgroup = useCallback((table: HTMLTableElement): HTMLTableColElement[] => {
    const columns = table.rows[0]?.children.length ?? 0;

    let group = table.querySelector('colgroup');
    if (!group) {
      group = document.createElement('colgroup');
      table.prepend(group);
    }

    while (group.children.length < columns) group.appendChild(document.createElement('col'));
    while (group.children.length > columns) group.lastElementChild?.remove();

    return Array.from(group.children) as HTMLTableColElement[];
  }, []);

  /** The column the caret sits in, as a table and an index into its columns. */
  const currentColumn = useCallback((): { table: HTMLTableElement; index: number } | null => {
    const cell = currentCell();
    const table = cell?.closest('table');
    if (!cell || !table) return null;

    const index = Array.from(cell.parentElement?.children ?? []).indexOf(cell);
    return index < 0 ? null : { table, index };
  }, [currentCell]);

  const openColumnWidth = useCallback(() => {
    const target = currentColumn();
    if (!target) return;

    // The input below takes focus, so the column is remembered rather than
    // looked up again when Apply is pressed.
    columnTargetRef.current = target;

    const existing = target.table.querySelectorAll('colgroup > col')[target.index]?.getAttribute('width');
    setColumnWidth(existing ?? '');
    setUrlMode(null);
    setTableOpen(false);
    setColumnOpen(true);
  }, [currentColumn]);

  const applyColumnWidth = useCallback(
    (width: number | null) => {
      const target = columnTargetRef.current;
      if (!target || !target.table.isConnected) return;

      const col = syncColgroup(target.table)[target.index];
      if (!col) return;

      if (width === null) {
        col.removeAttribute('width');
      } else {
        const clamped = Math.min(Math.max(Math.trunc(width) || 0, MIN_COLUMN_WIDTH), MAX_COLUMN_WIDTH);
        col.setAttribute('width', String(clamped));
      }

      // A colgroup holding no widths at all is noise, and leaving it behind would
      // keep the wrapping rule on. Drop it so the table goes back to sizing itself.
      const group = target.table.querySelector('colgroup');
      if (group && !group.querySelector('col[width]')) group.remove();

      setColumnOpen(false);
      editorRef.current?.focus();
      refreshUi();
    },
    [refreshUi, syncColgroup]
  );

  const insertTable = useCallback(
    (rows: number, columns: number) => {
      const safeRows = Math.min(Math.max(Math.trunc(rows) || 0, 1), 20);
      const safeColumns = Math.min(Math.max(Math.trunc(columns) || 0, 1), 10);

      const headerCells = Array.from({ length: safeColumns }, () => '<th><br></th>').join('');
      const bodyRow = `<tr>${Array.from({ length: safeColumns }, () => '<td><br></td>').join('')}</tr>`;
      // The first row is the header, so the remaining rows are the body.
      const bodyRows = Array.from({ length: safeRows - 1 }, () => bodyRow).join('');

      exec(
        'insertHTML',
        `<table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table><p><br></p>`
      );
    },
    [exec]
  );

  // Row and column edits change the DOM directly: there is no execCommand for
  // them, which also means the browser's undo stack does not cover these.
  const addRow = useCallback(() => {
    const cell = currentCell();
    const row = cell?.parentElement as HTMLTableRowElement | null;
    if (!cell || !row) return;

    const columns = row.children.length;
    const fresh = document.createElement('tr');
    for (let index = 0; index < columns; index++) {
      fresh.appendChild(document.createElement('td')).appendChild(document.createElement('br'));
    }

    // A row added from the header belongs at the top of the body.
    const table = row.closest('table');
    const body = table?.querySelector('tbody');
    if (row.parentElement?.tagName === 'THEAD' && body) body.prepend(fresh);
    else row.after(fresh);

    refreshUi();
  }, [currentCell, refreshUi]);

  const addColumn = useCallback(() => {
    const cell = currentCell();
    const table = cell?.closest('table');
    if (!cell || !table) return;

    const index = Array.from(cell.parentElement?.children ?? []).indexOf(cell);

    for (const row of Array.from(table.rows)) {
      const isHeaderRow = row.parentElement?.tagName === 'THEAD';
      const fresh = document.createElement(isHeaderRow ? 'th' : 'td');
      fresh.appendChild(document.createElement('br'));
      const reference = row.children[index];
      if (reference) reference.after(fresh);
      else row.appendChild(fresh);
    }

    // The new column needs its own <col>, or every width after it would shift
    // one place to the left.
    const group = table.querySelector('colgroup');
    if (group) {
      const fresh = document.createElement('col');
      const reference = group.children[index];
      if (reference) reference.after(fresh);
      else group.appendChild(fresh);
    }

    refreshUi();
  }, [currentCell, refreshUi]);

  const removeRow = useCallback(() => {
    const cell = currentCell();
    const row = cell?.parentElement as HTMLTableRowElement | null;
    const table = row?.closest('table');
    if (!row || !table) return;

    // Removing the last row would leave an empty table behind.
    if (table.rows.length <= 1) table.remove();
    else row.remove();

    editorRef.current?.focus();
    refreshUi();
  }, [currentCell, refreshUi]);

  const removeColumn = useCallback(() => {
    const cell = currentCell();
    const table = cell?.closest('table');
    if (!cell || !table) return;

    const index = Array.from(cell.parentElement?.children ?? []).indexOf(cell);

    if ((table.rows[0]?.children.length ?? 0) <= 1) {
      table.remove();
    } else {
      for (const row of Array.from(table.rows)) row.children[index]?.remove();

      const group = table.querySelector('colgroup');
      group?.children[index]?.remove();
      // The remaining columns may all be back on auto, which needs no colgroup.
      if (group && !group.querySelector('col[width]')) group.remove();
    }

    editorRef.current?.focus();
    refreshUi();
  }, [currentCell, refreshUi]);

  const openUrlInput = useCallback((mode: UrlMode) => {
    const selection = window.getSelection();
    // A link needs text to attach to; an image just needs a caret position.
    if (mode === 'link' && (!selection || selection.rangeCount === 0 || selection.isCollapsed)) return;

    if (selection && selection.rangeCount > 0) {
      // The input steals focus, so remember where this belongs.
      savedRangeRef.current = selection.getRangeAt(0).cloneRange();
    }
    setUrlValue('https://');
    setUrlMode(mode);
  }, []);

  const applyUrl = useCallback(() => {
    const url = urlValue.trim();
    const mode = urlMode;
    const range = savedRangeRef.current;
    setUrlMode(null);

    if (!url || url === 'https://' || !mode) return;

    const selection = window.getSelection();
    if (range) {
      selection?.removeAllRanges();
      selection?.addRange(range);
    }

    if (mode === 'image') {
      insertImage(url);
    } else {
      exec('createLink', url);
    }
  }, [exec, insertImage, urlMode, urlValue]);

  /* ---------------------------------------------------------------------- */
  /*  Input handling                                                         */
  /* ---------------------------------------------------------------------- */

  /**
   * Writes a pasted screenshot to the author's image folder and drops a
   * reference to it in at the caret. The bytes never touch the post itself.
   */
  const insertPastedImage = useCallback(
    async (blob: Blob, range: Range | null) => {
      const name = await saveImage(blob);

      // Restore where the caret was: awaiting the write let it go.
      const selection = window.getSelection();
      if (range && selection) {
        selection.removeAllRanges();
        selection.addRange(range);
      }
      editorRef.current?.focus();

      if (!name) {
        setFolderNotice('That image could not be saved to the folder. Try reconnecting it.');
        return;
      }

      // Inserted as a reference, not a `local:` src: the browser cannot fetch
      // that scheme and would log a failed request for it. The hook fills in the
      // real src, and `restoreLocalImages` turns it back into `local:` on save.
      document.execCommand('insertHTML', false, `<img ${LOCAL_IMAGE_ATTR}="${escapeHtml(name)}" alt="">`);
      setFolderNotice(null);
      refreshUi();
    },
    [refreshUi]
  );

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      const html = event.clipboardData.getData('text/html');
      const text = event.clipboardData.getData('text/plain');

      // A screenshot arrives as a file with no useful text beside it. Take that
      // branch first, or the empty text below would swallow it.
      const image = Array.from(event.clipboardData.items).find(
        (item) => item.kind === 'file' && item.type.startsWith('image/')
      );

      if (image && !isImageUrl(text)) {
        event.preventDefault();
        const blob = image.getAsFile();
        if (!blob) return;

        if (!folderSupported()) {
          setFolderNotice('Pasting images needs Chrome or Edge — this browser cannot write to a folder.');
          return;
        }

        const selection = window.getSelection();
        const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;

        void folderStatus().then((status) => {
          if (status !== 'ready') {
            setFolderNotice(
              status === 'none'
                ? 'Choose a folder to keep pasted images in first.'
                : 'Reconnect the image folder to paste images into it.'
            );
            setFolderOpen(true);
            return;
          }
          void insertPastedImage(blob, range);
        });
        return;
      }

      event.preventDefault();

      // Pasting the address of an image drops the image in, not its URL.
      if (isImageUrl(text)) {
        document.execCommand('insertHTML', false, `<img src="${escapeHtml(text.trim())}" alt="">`);
      } else if (html) {
        document.execCommand('insertHTML', false, sanitizeHtml(html));
      } else {
        document.execCommand('insertText', false, text);
      }
      refreshUi();
    },
    [insertPastedImage, refreshUi]
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
        openUrlInput('link');
      }
    },
    [openUrlInput, toggleBlock]
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

        <ToolbarButton title="Insert image from URL" onClick={() => openUrlInput('image')}>
          <ImagePlus className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Image folder (for pasted screenshots)"
          active={folderOpen}
          onClick={() => {
            setUrlMode(null);
            setTableOpen(false);
            setColumnOpen(false);
            setFolderOpen((prev) => !prev);
          }}
        >
          <FolderOpen className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          title="Insert table"
          active={tableOpen}
          onClick={() => {
            setUrlMode(null);
            setTableOpen((prev) => !prev);
          }}
        >
          <Table className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Add row below" requiresTable onClick={addRow}>
          <Rows3 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Add column after" requiresTable onClick={addColumn}>
          <Columns3 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Delete row" requiresTable onClick={removeRow}>
          <TableRowsSplit className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Delete column" requiresTable onClick={removeColumn}>
          <TableColumnsSplit className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Column width" requiresTable active={columnOpen} onClick={openColumnWidth}>
          <BetweenHorizonalStart className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton title="Add link (Ctrl+K)" onClick={() => openUrlInput('link')}>
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

      {/* Link / image URL input */}
      {urlMode && (
        <div className="flex items-center gap-2 border-b border-border bg-[#FF4D8E]/5 px-2 py-2">
          {urlMode === 'image' ? (
            <ImagePlus className="h-4 w-4 shrink-0 text-[#FF4D8E]" />
          ) : (
            <Link2 className="h-4 w-4 shrink-0 text-[#FF4D8E]" />
          )}
          <input
            autoFocus
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                applyUrl();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setUrlMode(null);
              }
            }}
            placeholder={urlMode === 'image' ? 'https://example.com/photo.jpg' : 'https://example.com'}
            aria-label={urlMode === 'image' ? 'Image URL' : 'Link URL'}
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-[#FF4D8E]/50"
          />
          <button
            type="button"
            onClick={applyUrl}
            title={urlMode === 'image' ? 'Insert image' : 'Apply link'}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[#FF4D8E] text-white hover:bg-[#FF4D8E]/90"
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setUrlMode(null)}
            title="Cancel"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Table size input */}
      {tableOpen && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-[#FF4D8E]/5 px-2 py-2">
          <Table className="h-4 w-4 shrink-0 text-[#FF4D8E]" />
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Rows
            <input
              type="number"
              min={1}
              max={20}
              value={tableRows}
              onChange={(e) => setTableRows(Number(e.target.value))}
              aria-label="Number of rows"
              className="w-16 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-[#FF4D8E]/50"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Columns
            <input
              type="number"
              min={1}
              max={10}
              value={tableColumns}
              onChange={(e) => setTableColumns(Number(e.target.value))}
              aria-label="Number of columns"
              className="w-16 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-[#FF4D8E]/50"
            />
          </label>
          <span className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                insertTable(tableRows, tableColumns);
                setTableOpen(false);
              }}
              title="Insert table"
              className="inline-flex h-7 items-center gap-1.5 rounded-md bg-[#FF4D8E] px-3 text-xs font-medium text-white hover:bg-[#FF4D8E]/90"
            >
              <Check className="h-3.5 w-3.5" />
              Insert
            </button>
            <button
              type="button"
              onClick={() => setTableOpen(false)}
              title="Cancel"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </button>
          </span>
          <p className="w-full text-xs text-muted-foreground">The first row becomes the header.</p>
        </div>
      )}

      {/* Image folder */}
      {folderOpen && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-[#FF4D8E]/5 px-2 py-2">
          <FolderOpen className="h-4 w-4 shrink-0 text-[#FF4D8E]" />
          <span className="text-xs text-muted-foreground">
            {folderState === 'unsupported'
              ? 'This browser cannot write to a folder — pasted screenshots need Chrome or Edge.'
              : folderState === 'none'
                ? 'No folder chosen yet.'
                : folderState === 'needs-permission'
                  ? `“${folderLabel}” needs permission again.`
                  : `Saving pasted images to “${folderLabel}”.`}
          </span>

          {folderState !== 'unsupported' && (
            <span className="ml-auto flex items-center gap-1">
              {folderState === 'needs-permission' && (
                <button
                  type="button"
                  onClick={() => void reconnectFolder()}
                  className="inline-flex h-7 items-center gap-1.5 rounded-md bg-[#FF4D8E] px-3 text-xs font-medium text-white hover:bg-[#FF4D8E]/90"
                >
                  <Check className="h-3.5 w-3.5" />
                  Reconnect
                </button>
              )}
              <button
                type="button"
                onClick={() => void pickFolder()}
                className="inline-flex h-7 items-center rounded-md border border-border px-3 text-xs font-medium text-foreground hover:border-[#FF4D8E]/40"
              >
                {folderState === 'none' ? 'Choose folder' : 'Change'}
              </button>
              {folderState !== 'none' && (
                <button
                  type="button"
                  onClick={() => void forgetFolder()}
                  title="Forget this folder. Nothing inside it is deleted."
                  className="inline-flex h-7 items-center rounded-md px-3 text-xs text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10"
                >
                  Forget
                </button>
              )}
              <button
                type="button"
                onClick={() => setFolderOpen(false)}
                title="Cancel"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </span>
          )}

          <p className="w-full text-xs text-muted-foreground">
            Screenshots pasted into the post are written here as files; the post keeps only their names. Removing one
            from the post and saving deletes its file, unless another post still uses it.
          </p>
        </div>
      )}

      {/* A paste that could not be saved says so here rather than failing quietly. */}
      {folderNotice && !folderOpen && (
        <div className="flex items-center gap-2 border-b border-border bg-destructive/5 px-2 py-2">
          <FolderOpen className="h-4 w-4 shrink-0 text-destructive" />
          <span className="text-xs text-destructive">{folderNotice}</span>
          <button
            type="button"
            onClick={() => setFolderNotice(null)}
            title="Dismiss"
            className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Column width */}
      {columnOpen && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-[#FF4D8E]/5 px-2 py-2">
          <BetweenHorizonalStart className="h-4 w-4 shrink-0 text-[#FF4D8E]" />
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Width
            <input
              autoFocus
              type="number"
              min={MIN_COLUMN_WIDTH}
              max={MAX_COLUMN_WIDTH}
              step={10}
              value={columnWidth}
              onChange={(e) => setColumnWidth(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applyColumnWidth(Number(columnWidth) || null);
                }
                if (e.key === 'Escape') setColumnOpen(false);
              }}
              placeholder="auto"
              aria-label="Column width in pixels"
              className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-[#FF4D8E]/50"
            />
            px
          </label>
          <span className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => applyColumnWidth(Number(columnWidth) || null)}
              title="Apply column width"
              className="inline-flex h-7 items-center gap-1.5 rounded-md bg-[#FF4D8E] px-3 text-xs font-medium text-white hover:bg-[#FF4D8E]/90"
            >
              <Check className="h-3.5 w-3.5" />
              Apply
            </button>
            <button
              type="button"
              onClick={() => applyColumnWidth(null)}
              title="Let this column size itself"
              className="inline-flex h-7 items-center rounded-md px-3 text-xs font-medium text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10"
            >
              Auto
            </button>
            <button
              type="button"
              onClick={() => setColumnOpen(false)}
              title="Cancel"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </button>
          </span>
          <p className="w-full text-xs text-muted-foreground">
            Applies to the column the caret is in, between {MIN_COLUMN_WIDTH} and {MAX_COLUMN_WIDTH}px.
          </p>
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
          onBlur={() => onBlur?.(editorRef.current ? restoreLocalImages(editorRef.current) : '')}
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
