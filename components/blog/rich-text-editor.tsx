'use client';

import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  Hash,
  Search,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  countWords,
  isImageUrl,
  TABLE_SCROLL_CLASS,
  isSafeImageSrc,
  sanitizeHtml,
  unwrapTables,
  wrapTables,
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

/**
 * Whether a new table's header row counts itself, and from which end.
 *
 * The count always leaves the first header cell empty — that is the stub the row
 * labels live under — and numbers the rest 1..n. `from-left` puts the 1 next to
 * the stub and counts rightwards; `from-right` puts the 1 in the final column
 * and counts back towards the stub, which is what a Hebrew table wants.
 */
export type HeaderNumbering = 'none' | 'from-left' | 'from-right';

/** A numbered table needs the stub column plus at least one counted column. */
const MIN_NUMBERED_COLUMNS = 2;
const MAX_TABLE_COLUMNS = 10;

/**
 * The header row a given width and mode produces, as plain strings — `''` is the
 * empty stub. The insert and the preview in the toolbar both read from here, so
 * what the bar promises and what lands in the post cannot drift apart.
 */
function headerLabels(columns: number, numbering: HeaderNumbering): string[] {
  const least = numbering === 'none' ? 1 : MIN_NUMBERED_COLUMNS;
  const total = Math.min(Math.max(Math.trunc(columns) || 0, least), MAX_TABLE_COLUMNS);
  const counted = total - 1;

  return Array.from({ length: total }, (_, index) => {
    if (numbering === 'none' || index === 0) return '';
    return String(numbering === 'from-left' ? index : counted - index + 1);
  });
}

/** Takes the scrolling strip with it, rather than leaving an empty one behind. */
function removeTable(table: HTMLTableElement) {
  const strip = table.parentElement;
  if (strip?.classList.contains(TABLE_SCROLL_CLASS) && strip.children.length === 1) strip.remove();
  else table.remove();
}

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

/* -------------------------------------------------------------------------- */
/*  Slash menu                                                                */
/* -------------------------------------------------------------------------- */

interface SlashItem {
  /** Dispatch key for `runSlashItem`; the marks use their execCommand name. */
  id: string;
  label: string;
  hint: string;
  /** Extra words the query matches against, so `/line` finds the divider. */
  keywords: string;
  Icon: React.ComponentType<{ className?: string }>;
}

/** Ordered by how often a post reaches for them: an empty query shows them all. */
const SLASH_ITEMS: SlashItem[] = [
  { id: 'h2', label: 'Heading', hint: 'Large section title', keywords: 'h2 title big', Icon: Heading2 },
  { id: 'h3', label: 'Subheading', hint: 'Smaller section title', keywords: 'h3 title small', Icon: Heading3 },
  { id: 'ul', label: 'Bulleted list', hint: 'A list of points', keywords: 'ul bullet unordered dot', Icon: List },
  { id: 'ol', label: 'Numbered list', hint: 'A list in order', keywords: 'ol number ordered', Icon: ListOrdered },
  { id: 'blockquote', label: 'Quote', hint: 'Set text apart', keywords: 'blockquote citation', Icon: Quote },
  {
    id: 'hr',
    label: 'Divider',
    hint: 'A horizontal line',
    keywords: 'hr rule line separator horizontal break',
    Icon: Minus,
  },
  { id: 'table', label: 'Table', hint: 'Rows and columns', keywords: 'grid cells', Icon: Table },
  {
    id: 'table-numbered',
    label: 'Numbered table',
    hint: 'Header counts 1, 2, 3…',
    keywords: 'grid cells numbered counting count header series question',
    Icon: Hash,
  },
  { id: 'image', label: 'Image', hint: 'From a URL', keywords: 'picture photo img', Icon: ImagePlus },
  { id: 'p', label: 'Paragraph', hint: 'Plain text', keywords: 'text body normal', Icon: Pilcrow },
  { id: 'bold', label: 'Bold', hint: 'Start bold text', keywords: 'strong b', Icon: Bold },
  { id: 'italic', label: 'Italic', hint: 'Start italic text', keywords: 'em i', Icon: Italic },
  { id: 'underline', label: 'Underline', hint: 'Start underlined text', keywords: 'u', Icon: Underline },
  { id: 'strikeThrough', label: 'Strikethrough', hint: 'Start struck-through text', keywords: 's strike', Icon: Strikethrough },
];

// Used to guess the menu's height before it exists, which is what decides
// whether it hangs below the caret or sits above it.
const SLASH_ITEM_HEIGHT = 48;
const SLASH_LIST_MAX_HEIGHT = 264;
/** Below this the menu stops shrinking and simply overlaps — it has to stay usable. */
const SLASH_LIST_MIN_HEIGHT = 96;
const SLASH_HEADER_HEIGHT = 30;
const SLASH_FOOTER_HEIGHT = 30;
const SLASH_MENU_WIDTH = 272;
const SLASH_MENU_GAP = 8;

/** Where the `/` sits, so its text can be taken back out when an item is run. */
interface SlashContext {
  node: Text;
  /** Index of the `/` itself within `node`. */
  offset: number;
  query: string;
}

/**
 * Viewport coordinates of the thing a popover hangs from — the `/` for the menu,
 * the caret for the step that follows it. Popovers are portalled to the body, so
 * these are viewport coordinates rather than offsets within the editor.
 */
interface AnchorRect {
  left: number;
  top: number;
  bottom: number;
}

/** Width of a step panel floating beside the caret. */
const PANEL_WIDTH = 320;

/**
 * Which side of the anchor something of this height belongs on, and how much
 * room it has there. Below unless that would run off the bottom and there is
 * more room above — a popover covers the line being written only as a last resort.
 */
function anchorSide(rect: AnchorRect, wantedHeight: number): { above: boolean; room: number } {
  const margin = SLASH_MENU_GAP + 8;
  const spaceBelow = window.innerHeight - rect.bottom - margin;
  const spaceAbove = rect.top - margin;
  const above = wantedHeight > spaceBelow && spaceAbove > spaceBelow;

  return { above, room: above ? spaceAbove : spaceBelow };
}

/** Viewport-clamped coordinates, so a scrolled-away anchor cannot take the popover with it. */
function anchorPosition(rect: AnchorRect, width: number, height: number, above: boolean): React.CSSProperties {
  const top = above ? rect.top - SLASH_MENU_GAP - height : rect.bottom + SLASH_MENU_GAP;

  return {
    width,
    left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
    top: Math.max(8, Math.min(top, window.innerHeight - height - 8)),
  };
}

/** The caret's own rect, for a step opened by a shortcut rather than by the menu. */
function selectionRect(editor: HTMLElement): AnchorRect | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  if (!editor.contains(range.startContainer)) return null;

  const { left, top, bottom } = range.getBoundingClientRect();
  // A collapsed range in an empty block can measure as nothing at all.
  if (!left && !top && !bottom) return null;

  return { left, top, bottom };
}

/**
 * Every word of the query has to land somewhere in the label or the keywords,
 * in any order — so `list bullet` finds the bulleted list just as `bul` does.
 * Results are ranked, because whatever comes back first is what Enter picks.
 */
function filterSlashItems(query: string): SlashItem[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return SLASH_ITEMS;

  const matched: { item: SlashItem; rank: number }[] = [];
  for (const item of SLASH_ITEMS) {
    const label = item.label.toLowerCase();
    // Labels match anywhere, so `/head` still reaches Subheading. Keywords match
    // only at the start of one of their words, which keeps `/ta` from dragging
    // in the quote through `ci-ta-tion`.
    const keywords = item.keywords.split(' ');
    const hits = (word: string) => label.includes(word) || keywords.some((key) => key.startsWith(word));
    if (!words.every(hits)) continue;

    // A label the query opens wins, then a keyword it names outright, then a
    // label it merely appears inside — so `/hr` leads with the divider.
    const [first] = words;
    const rank = label.startsWith(first) ? 0 : keywords.includes(first) ? 1 : label.includes(first) ? 2 : 3;
    matched.push({ item, rank });
  }

  // Sort is stable, so SLASH_ITEMS order still settles ties.
  return matched.sort((a, b) => a.rank - b.rank).map((entry) => entry.item);
}

/**
 * The `/` before the caret and whatever has been typed since, or `null` when the
 * caret is not sitting after one. The `/` has to start a word, which is what
 * keeps `https://` and `and/or` from opening a menu mid-sentence.
 */
function readSlashContext(editor: HTMLElement): SlashContext | null {
  const selection = window.getSelection();
  if (!selection || !selection.isCollapsed || selection.rangeCount === 0) return null;

  const node = selection.anchorNode;
  if (!node || node.nodeType !== Node.TEXT_NODE || !editor.contains(node)) return null;

  const text = (node as Text).data.slice(0, selection.anchorOffset);
  // The query runs to the caret and may hold spaces, so `/bulleted list` is
  // searchable; excluding `/` both ends it at a path and anchors the match to
  // the *last* slash, which is the one just typed.
  const match = /(?:^|[\s\u00a0])\/([^/\n]*)$/.exec(text);
  if (!match) return null;

  // A long run with nothing chosen is someone writing, not picking.
  const query = match[1];
  if (query.length > 32) return null;

  return { node: node as Text, offset: selection.anchorOffset - query.length - 1, query };
}

/** Null once the text node has gone — a reset or an undo can take it away. */
function slashRect(context: SlashContext): AnchorRect | null {
  if (!context.node.isConnected) return null;

  const length = context.node.data.length;
  const range = document.createRange();
  range.setStart(context.node, Math.min(context.offset, length));
  range.setEnd(context.node, Math.min(context.offset + 1, length));

  const { left, top, bottom } = range.getBoundingClientRect();
  return { left, top, bottom };
}

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

  // The inline bars, opened by a click. The slash menu below is the one piece of
  // state that typing does move — see the note on it.
  const [urlMode, setUrlMode] = useState<UrlMode>(null);
  const [urlValue, setUrlValue] = useState('');
  const [tableOpen, setTableOpen] = useState(false);
  const [tableRows, setTableRows] = useState(3);
  const [tableColumns, setTableColumns] = useState(3);
  const [tableNumbering, setTableNumbering] = useState<HeaderNumbering>('none');
  const [columnOpen, setColumnOpen] = useState(false);
  const [columnWidth, setColumnWidth] = useState('');
  const [folderOpen, setFolderOpen] = useState(false);
  const [folderState, setFolderState] = useState<FolderStatus>('none');
  const [folderLabel, setFolderLabel] = useState<string | null>(null);
  const [folderNotice, setFolderNotice] = useState<string | null>(null);

  /**
   * The slash menu, and the one thing here that does re-render while the user
   * types. That is safe only because the editor div has no children in the JSX:
   * React owns the menu and never touches the contentEditable's innerHTML.
   *
   * `slashRef` is the open/closed truth and survives without a render; `slash`
   * is what the menu draws itself from.
   */
  const [slash, setSlash] = useState<{ query: string; index: number; rect: AnchorRect } | null>(null);

  /**
   * Where a follow-up step should appear. `null` puts it inline under the
   * toolbar, which is where the eye already is when a toolbar button opened it;
   * a rect floats it beside the caret, so a step chosen from the slash menu
   * halfway down a long post does not send the writer back up to the toolbar.
   */
  const [panelAnchor, setPanelAnchor] = useState<AnchorRect | null>(null);
  const [panelHeight, setPanelHeight] = useState(0);
  const panelResizeRef = useRef<ResizeObserver | null>(null);

  /**
   * Measures the floating panel, since where it goes depends on how tall it is
   * and that changes with its contents — the table panel grows a preview row.
   */
  const measurePanel = useCallback((node: HTMLDivElement | null) => {
    panelResizeRef.current?.disconnect();
    panelResizeRef.current = null;

    if (!node) {
      setPanelHeight(0);
      return;
    }

    setPanelHeight(node.offsetHeight);
    const observer = new ResizeObserver(() => setPanelHeight(node.offsetHeight));
    observer.observe(node);
    panelResizeRef.current = observer;
  }, []);
  const slashRef = useRef<SlashContext | null>(null);
  const slashListRef = useRef<HTMLDivElement>(null);

  // Declared up here rather than with the rest of the slash menu: `setHtml` and
  // the blur handler both close the menu, and they are defined further up still.
  const closeSlashMenu = useCallback(() => {
    slashRef.current = null;
    setSlash(null);
  }, []);

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

    editor.innerHTML = wrapTables(prepareLocalImages(initialHtml || '')) || EMPTY_PARAGRAPH;
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
      getHtml: () => (editorRef.current ? unwrapTables(restoreLocalImages(editorRef.current)) : ''),
      setHtml: (html: string) => {
        const editor = editorRef.current;
        if (!editor) return;
        // The text node the menu was anchored to is about to be thrown away.
        closeSlashMenu();
        editor.innerHTML = wrapTables(prepareLocalImages(html || '')) || EMPTY_PARAGRAPH;
        refreshUi();
      },
      focus: () => editorRef.current?.focus(),
    }),
    [closeSlashMenu, refreshUi]
  );

  // The selectionchange listener lives further down, with the slash menu: it
  // drives both, and the dependency array cannot name a callback declared later.

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
    (rows: number, columns: number, numbering: HeaderNumbering) => {
      const safeRows = Math.min(Math.max(Math.trunc(rows) || 0, 1), 20);

      // The width is whatever `headerLabels` settled on, so a numbered table can
      // never come out narrower than the two columns the counting needs.
      const labels = headerLabels(columns, numbering);
      const safeColumns = labels.length;

      // An empty cell keeps its `<br>`: without one it has no line box and the
      // caret cannot be put in it.
      const headerCells = labels.map((label) => `<th>${label || '<br>'}</th>`).join('');
      const bodyRow = `<tr>${Array.from({ length: safeColumns }, () => '<td><br></td>').join('')}</tr>`;
      // The first row is the header, so the remaining rows are the body.
      const bodyRows = Array.from({ length: safeRows - 1 }, () => bodyRow).join('');

      // Wrapped on the way in, so a wide one scrolls while it is being written
      // rather than only once the post is saved. The strip comes off again when
      // the editor is read back.
      exec(
        'insertHTML',
        `<div class="${TABLE_SCROLL_CLASS}"><table><thead><tr>${headerCells}</tr></thead>` +
          `<tbody>${bodyRows}</tbody></table></div><p><br></p>`
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
    if (table.rows.length <= 1) removeTable(table);
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
      removeTable(table);
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

  /** Dismisses whichever follow-up step is open and hands the caret back. */
  const closeStep = useCallback(() => {
    setUrlMode(null);
    setTableOpen(false);
    setPanelAnchor(null);
    editorRef.current?.focus();
  }, []);

  /** `anchor` floats the input beside the caret; `null` puts it under the toolbar. */
  const openUrlInput = useCallback((mode: UrlMode, anchor: AnchorRect | null) => {
    const selection = window.getSelection();
    // A link needs text to attach to; an image just needs a caret position.
    if (mode === 'link' && (!selection || selection.rangeCount === 0 || selection.isCollapsed)) return;

    if (selection && selection.rangeCount > 0) {
      // The input steals focus, so remember where this belongs.
      savedRangeRef.current = selection.getRangeAt(0).cloneRange();
    }
    // One step at a time: two floating cards at the same anchor would overlap.
    setTableOpen(false);
    setColumnOpen(false);
    setFolderOpen(false);
    setPanelAnchor(anchor);
    setUrlValue('https://');
    setUrlMode(mode);
  }, []);

  const applyUrl = useCallback(() => {
    const url = urlValue.trim();
    const mode = urlMode;
    const range = savedRangeRef.current;
    setUrlMode(null);
    setPanelAnchor(null);

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
  /*  Slash menu                                                             */
  /* ---------------------------------------------------------------------- */

  /**
   * `opening` is true only for the keystroke that produced the `/` itself.
   * Everything else may keep an open menu in step or close it, but may not open
   * one — otherwise moving the caret next to an old slash would spring it open.
   */
  const syncSlashMenu = useCallback(
    (opening: boolean) => {
      const editor = editorRef.current;
      if (!editor || (!opening && !slashRef.current)) return;

      const context = readSlashContext(editor);
      const rect = context && slashRect(context);
      if (!context || !rect) {
        closeSlashMenu();
        return;
      }

      // A query that finds nothing stays open saying so, so a typo can be
      // backspaced away. A space is what settles it: once one has been typed,
      // anything that is not finding something is prose — `and / or`, `3 / 4` —
      // and the menu gets out of the way.
      const spaced = /[\s ]/.test(context.query);
      if (spaced && (context.query.trim() === '' || filterSlashItems(context.query).length === 0)) {
        closeSlashMenu();
        return;
      }

      slashRef.current = context;
      setSlash((prev) => {
        // Same query in the same place: hand back the old object, so a caret
        // event that changed nothing does not re-render.
        if (prev && prev.query === context.query && prev.rect.left === rect.left && prev.rect.top === rect.top) {
          return prev;
        }
        return { query: context.query, index: prev?.query === context.query ? prev.index : 0, rect };
      });
    },
    [closeSlashMenu]
  );

  const runSlashItem = useCallback(
    (item: SlashItem) => {
      const editor = editorRef.current;
      const context = slashRef.current;
      // Read before the text goes, so a step that follows opens where the menu
      // was rather than back up at the toolbar.
      const anchor = context && slashRect(context);
      closeSlashMenu();
      if (!editor) return;

      editor.focus();

      // Take `/query` back out first, or it ends up inside the heading or list
      // that replaces it.
      if (context?.node.isConnected) {
        const length = context.node.data.length;
        const range = document.createRange();
        range.setStart(context.node, Math.min(context.offset, length));
        range.setEnd(context.node, Math.min(context.offset + 1 + context.query.length, length));

        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);

        // `delete` rather than `range.deleteContents()`: the browser normalises
        // the emptied paragraph back to `<p><br></p>` instead of leaving a bare
        // text node behind, which formatBlock would otherwise orphan as a stray
        // empty paragraph. It also puts the removal on the undo stack.
        document.execCommand('delete');
      }

      switch (item.id) {
        case 'h2':
        case 'h3':
        case 'blockquote':
        case 'p':
          // Set rather than toggle: the menu was asked for this block by name.
          exec('formatBlock', `<${item.id}>`);
          break;
        case 'ul':
          exec('insertUnorderedList');
          break;
        case 'ol':
          exec('insertOrderedList');
          break;
        case 'hr':
          exec('insertHorizontalRule');
          break;
        case 'image':
          openUrlInput('image', anchor);
          break;
        case 'table':
        case 'table-numbered': {
          const numbered = item.id === 'table-numbered';
          setUrlMode(null);
          setColumnOpen(false);
          setFolderOpen(false);
          setPanelAnchor(anchor);
          // Each entry is named for what it makes, so it sets the mode rather
          // than inheriting whatever the bar was left on last time.
          setTableNumbering(numbered ? 'from-left' : 'none');
          if (numbered) setTableColumns((columns) => Math.max(columns, MIN_NUMBERED_COLUMNS));
          setTableOpen(true);
          break;
        }
        default:
          // The marks carry their own execCommand name as an id, and apply to
          // whatever is typed next.
          exec(item.id);
      }
    },
    [closeSlashMenu, exec, openUrlInput]
  );

  useEffect(() => {
    const onSelectionChange = () => {
      refreshUi();
      // Cannot open the menu, but closes it when the caret leaves the query.
      syncSlashMenu(false);
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, [refreshUi, syncSlashMenu]);

  const slashOpen = slash !== null;

  // The caret keeps its place on the page while the page moves under it.
  useEffect(() => {
    if (!slashOpen) return;

    const reposition = () => {
      const context = slashRef.current;
      const rect = context && slashRect(context);
      if (rect) setSlash((prev) => (prev ? { ...prev, rect } : prev));
    };

    // Capture, so a scroll in any ancestor counts, not just the window.
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [slashOpen]);

  // Arrowing past the fold should bring the row with it.
  useEffect(() => {
    slashListRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [slash?.index]);

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

  const handleInput = useCallback(
    (event: React.FormEvent<HTMLDivElement>) => {
      refreshUi();
      // Only a typed `/` may open the menu; anything else can merely keep it in
      // step. `data` is null for deletions and some IME input, which is correct.
      syncSlashMenu((event.nativeEvent as InputEvent).data === '/');
    },
    [refreshUi, syncSlashMenu]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      // The slash menu takes the navigation keys before anything else does —
      // but only while it has something to navigate. Showing "no matches" must
      // not swallow Enter and leave the writer unable to start a new line.
      if (slash) {
        const items = filterSlashItems(slash.query);
        if (items.length === 0) {
          if (event.key === 'Escape') {
            event.preventDefault();
            closeSlashMenu();
            return;
          }
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          const step = event.key === 'ArrowDown' ? 1 : -1;
          setSlash((prev) => (prev ? { ...prev, index: (prev.index + step + items.length) % items.length } : prev));
          return;
        } else if (event.key === 'Enter' || event.key === 'Tab') {
          event.preventDefault();
          runSlashItem(items[slash.index] ?? items[0]);
          return;
        } else if (event.key === 'Escape') {
          event.preventDefault();
          closeSlashMenu();
          return;
        }
      }

      // Enter inside a list that lives in a table cell is done here rather than
      // left to the browser, which is inclined to leave the cell and carry the
      // next item into the row below instead of adding it to the list.
      if (event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const node = window.getSelection()?.anchorNode;
        const element = node?.nodeType === Node.ELEMENT_NODE ? (node as Element) : node?.parentElement;
        const item = element?.closest('li');

        if (item && item.closest('td, th')) {
          event.preventDefault();
          document.execCommand('insertParagraph');
          refreshUi();
          return;
        }
      }

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
        // Opened from the keyboard, so it belongs at the caret rather than at
        // the top of an editor the writer may be a long way down.
        const editor = editorRef.current;
        openUrlInput('link', editor ? selectionRect(editor) : null);
      }
    },
    [closeSlashMenu, openUrlInput, refreshUi, runSlashItem, slash, toggleBlock]
  );

  const slashItems = slash ? filterSlashItems(slash.query) : [];

  // Worked out here rather than in the JSX below: it needs the filtered length,
  // and `window` must not be touched during the server render.
  let slashStyle: React.CSSProperties | null = null;
  let slashListStyle: React.CSSProperties | undefined;
  if (slash && typeof window !== 'undefined') {
    // The empty state still occupies a row's worth of height.
    const rows = Math.max(slashItems.length, 1);
    const chrome = SLASH_HEADER_HEIGHT + SLASH_FOOTER_HEIGHT;
    const wanted = Math.min(rows * SLASH_ITEM_HEIGHT + 8, SLASH_LIST_MAX_HEIGHT) + chrome;
    const { above, room } = anchorSide(slash.rect, wanted);

    // On a short viewport the list scrolls rather than hanging off the screen.
    const listHeight = Math.max(SLASH_LIST_MIN_HEIGHT, Math.min(SLASH_LIST_MAX_HEIGHT, room - chrome));
    slashListStyle = { maxHeight: listHeight };

    const height = chrome + Math.min(listHeight, rows * SLASH_ITEM_HEIGHT + 8);
    slashStyle = anchorPosition(slash.rect, SLASH_MENU_WIDTH, height, above);
  }

  // The floating step that a slash-menu pick or a shortcut opens. Hidden for the
  // first frame, while `measurePanel` finds out how tall it turned out to be.
  let panelStyle: React.CSSProperties | null = null;
  if (panelAnchor && typeof window !== 'undefined') {
    const { above } = anchorSide(panelAnchor, panelHeight || 120);
    panelStyle = {
      ...anchorPosition(panelAnchor, PANEL_WIDTH, panelHeight, above),
      visibility: panelHeight ? 'visible' : 'hidden',
    };
  }

  /**
   * A follow-up step, put wherever it was asked for: a strip under the toolbar
   * when a toolbar button opened it, a card beside the caret when the slash menu
   * or a shortcut did. Same controls either way — only the frame differs.
   */
  const stepPanel = (content: React.ReactNode) =>
    panelStyle
      ? createPortal(
          <div
            ref={measurePanel}
            style={panelStyle}
            className="fixed z-50 rounded-xl border border-black/10 bg-white shadow-xl dark:border-white/10 dark:bg-[#1C1C1E]"
          >
            <div className="flex flex-wrap items-center gap-2 px-2.5 py-2">{content}</div>
          </div>,
          document.body
        )
      : (
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-[#FF4D8E]/5 px-2 py-2">
            {content}
          </div>
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

        <ToolbarButton title="Insert image from URL" onClick={() => openUrlInput('image', null)}>
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
            // Opened from the toolbar, so it belongs under the toolbar.
            setPanelAnchor(null);
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

        <ToolbarButton title="Add link (Ctrl+K)" onClick={() => openUrlInput('link', null)}>
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
      {urlMode &&
        stepPanel(
          <>
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
                  closeStep();
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
              onClick={closeStep}
              title="Cancel"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        )}

      {/* Table size input */}
      {tableOpen &&
        stepPanel(
          <>
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
              min={tableNumbering === 'none' ? 1 : MIN_NUMBERED_COLUMNS}
              max={10}
              value={tableColumns}
              onChange={(e) => setTableColumns(Number(e.target.value))}
              aria-label="Number of columns"
              className="w-16 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-[#FF4D8E]/50"
            />
          </label>

          {/* Header numbering */}
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Hash className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span id="table-numbering-label">Number header</span>
            <span role="group" aria-labelledby="table-numbering-label" className="flex items-center gap-1">
              {(
                [
                  ['none', 'Off', 'Leave the header row empty'],
                  ['from-left', 'From left', 'First column empty, then 1, 2, 3… rightwards'],
                  ['from-right', 'From right', 'Counts back from the last column, for a right-to-left table'],
                ] as const
              ).map(([mode, label, title]) => (
                <button
                  key={mode}
                  type="button"
                  title={title}
                  aria-pressed={tableNumbering === mode}
                  data-active={tableNumbering === mode}
                  onClick={() => {
                    setTableNumbering(mode);
                    // A single column has nothing to count once the stub is taken.
                    if (mode !== 'none') setTableColumns((columns) => Math.max(columns, MIN_NUMBERED_COLUMNS));
                  }}
                  className="inline-flex h-7 items-center rounded-md border border-border px-2 text-xs text-[#1C1C1E]/70 hover:border-[#FF4D8E]/40 data-[active=true]:border-[#D81B60] data-[active=true]:text-[#D81B60] dark:text-white/70 dark:data-[active=true]:border-[#FF8FB8] dark:data-[active=true]:text-[#FF8FB8]"
                >
                  {label}
                </button>
              ))}
            </span>
          </span>

            <span className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  insertTable(tableRows, tableColumns, tableNumbering);
                  closeStep();
                }}
                title="Insert table"
                className="inline-flex h-7 items-center gap-1.5 rounded-md bg-[#FF4D8E] px-3 text-xs font-medium text-white hover:bg-[#FF4D8E]/90"
              >
                <Check className="h-3.5 w-3.5" />
                Insert
              </button>
              <button
                type="button"
                onClick={closeStep}
                title="Cancel"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </span>
            <p className="w-full text-xs text-muted-foreground">
              The first row becomes the header.
              {tableNumbering !== 'none' && ' The first column stays empty for row labels.'}
            </p>

            {/* Exactly the header row that is about to be inserted, so the choice
                of direction is something to look at rather than work out. */}
            {tableNumbering !== 'none' && (
              <span className="flex w-full flex-wrap items-center gap-1" aria-hidden>
                {headerLabels(tableColumns, tableNumbering).map((label, index) => (
                  <span
                    key={index}
                    className="inline-flex h-6 min-w-8 items-center justify-center rounded border border-border px-1.5 text-xs tabular-nums text-[#1C1C1E]/70 dark:text-white/70"
                  >
                    {label || '—'}
                  </span>
                ))}
              </span>
            )}
          </>
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
          onInput={handleInput}
          onBlur={() => {
            // A click on the menu prevents its own mousedown, so this does not
            // fire out from under a pick.
            closeSlashMenu();
            onBlur?.(editorRef.current ? unwrapTables(restoreLocalImages(editorRef.current)) : '');
          }}
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
        <span className="hidden sm:inline">Type / for options · Ctrl+B bold · Ctrl+K link</span>
      </div>

      {/* Slash menu.

          Portalled to the body rather than positioned inside the editor: the
          container above is `overflow-hidden`, and its `backdrop-blur` makes it
          the containing block for fixed children, so a menu left in place would
          be both clipped and mispositioned. */}
      {slash &&
        slashStyle &&
        createPortal(
          <div
            role="listbox"
            aria-label="Insert"
            style={slashStyle}
            className="fixed z-50 overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl dark:border-white/10 dark:bg-[#1C1C1E]"
          >
            {/* The query lives in the post, not in an input — this is what says
                so, and what makes the menu legible as a search. */}
            <div className="flex items-center gap-2 border-b border-black/10 px-3 py-1.5 dark:border-white/10">
              <Search className="h-3.5 w-3.5 shrink-0 text-[#1C1C1E]/40 dark:text-white/40" />
              <span dir="auto" className="min-w-0 flex-1 truncate text-xs text-[#1C1C1E] dark:text-white">
                {slash.query || <span className="text-[#1C1C1E]/40 dark:text-white/40">Type to search…</span>}
              </span>
              <span className="shrink-0 text-[11px] tabular-nums text-[#1C1C1E]/40 dark:text-white/40">
                {slashItems.length}
              </span>
            </div>

            <div ref={slashListRef} style={slashListStyle} className="overflow-y-auto py-1">
              {slashItems.length === 0 && (
                <p className="px-3 py-3 text-sm text-[#1C1C1E]/50 dark:text-white/50">
                  Nothing matches — keep typing or backspace.
                </p>
              )}
              {slashItems.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={index === slash.index}
                  data-active={index === slash.index}
                  // Keep the caret in the editor, exactly as the toolbar does.
                  onMouseDown={(e) => e.preventDefault()}
                  // Hover and the keyboard drive the same highlight, so the two
                  // can never disagree about what Enter would pick.
                  onMouseEnter={() => setSlash((prev) => (prev ? { ...prev, index } : prev))}
                  onClick={() => runSlashItem(item)}
                  className="group flex w-full items-center gap-3 px-3 py-2 text-start data-[active=true]:bg-[#FF4D8E]/12 dark:data-[active=true]:bg-[#FF4D8E]/20"
                >
                  {/* The accent is carried by the icon, not the label: pink text
                      on a pink tint does not clear contrast at this size. */}
                  <item.Icon className="h-4 w-4 shrink-0 text-[#1C1C1E]/45 group-data-[active=true]:text-[#D81B60] dark:text-white/50 dark:group-data-[active=true]:text-[#FF8FB8]" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-[#1C1C1E] dark:text-white">{item.label}</span>
                    <span className="block truncate text-xs text-[#1C1C1E]/50 dark:text-white/50">{item.hint}</span>
                  </span>
                </button>
              ))}
            </div>
            <div className="border-t border-black/10 px-3 py-1.5 text-[11px] text-[#1C1C1E]/50 dark:border-white/10 dark:text-white/50">
              {slashItems.length === 0 ? 'Esc dismiss' : '↑↓ move · Enter choose · Esc dismiss'}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
