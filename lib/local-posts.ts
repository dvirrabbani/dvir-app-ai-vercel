import { BlogPost, CoverPosition, getDefaultPosts } from '@/lib/blog';

/**
 * Every post the blog renders. They live in localStorage only — nothing is sent
 * to a server, and they are gone if the user clears site data.
 */
export interface LocalBlogPost extends BlogPost {
  createdAt: string; // ISO timestamp, used for reliable sorting
}

export const LOCAL_POSTS_KEY = 'dvir-blog:posts';
export const LOCAL_DRAFT_KEY = 'dvir-blog:draft';

/** Fired on `window` after any write, so open views can refresh themselves. */
export const LOCAL_POSTS_EVENT = 'local-posts-changed';

export const POST_CATEGORIES = [
  'Engineering',
  'Design',
  'Framework',
  'Product',
  'Personal',
  'Finance',
  'Health',
  'Community',
];

/** Badge colour per category. Add a category above and give it a colour here. */
const POST_CATEGORY_COLORS: Record<string, string> = {
  Engineering: '#FF4D8E',
  Design: '#00C2FF',
  Framework: '#FF9100',
  Product: '#8B5CF6',
  Personal: '#10B981',
  Finance: '#0D9488',
  Health: '#DC2626',
  Community: '#6366F1',
};

const FALLBACK_CATEGORY_COLOR = '#FF4D8E';

/** Colour for a category, including ones from older posts that are no longer listed. */
export function getCategoryColor(category: string): string {
  return POST_CATEGORY_COLORS[category] ?? FALLBACK_CATEGORY_COLOR;
}

/* -------------------------------------------------------------------------- */
/*  HTML sanitizing                                                           */
/* -------------------------------------------------------------------------- */

const ALLOWED_TAGS = new Set([
  'P', 'BR', 'HR', 'DIV', 'SPAN',
  'STRONG', 'B', 'EM', 'I', 'U', 'S', 'STRIKE',
  'H1', 'H2', 'H3', 'H4',
  'UL', 'OL', 'LI',
  'BLOCKQUOTE', 'CODE', 'PRE', 'A', 'IMG',
  'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TH', 'TD', 'CAPTION', 'COLGROUP', 'COL',
]);

// Removed with their contents, rather than unwrapped.
const DROPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'FORM', 'INPUT', 'SVG']);

const ALLOWED_ATTRS: Record<string, string[]> = {
  A: ['href', 'target', 'rel'],
  IMG: ['src', 'alt', 'title'],
  TD: ['colspan', 'rowspan'],
  TH: ['colspan', 'rowspan', 'scope'],
  COL: ['width'],
};

const SPAN_ATTRS = ['colspan', 'rowspan'];
const MAX_CELL_SPAN = 50;

/**
 * Bounds for a column width, in pixels. The floor matches the 5rem minimum the
 * stylesheet already puts on every cell, so a stored width is never something
 * the layout will quietly refuse to honour.
 */
export const MIN_COLUMN_WIDTH = 80;
export const MAX_COLUMN_WIDTH = 1000;

// Allowed on any element: needed for mixed Hebrew/English posts.
const GLOBAL_ATTRS = ['dir'];
const DIR_VALUES = new Set(['ltr', 'rtl', 'auto']);

function isSafeHref(href: string): boolean {
  const value = href.trim().toLowerCase();
  if (value.startsWith('javascript:') || value.startsWith('data:') || value.startsWith('vbscript:')) {
    return false;
  }
  return true;
}

/** Images are only ever loaded over http(s) — never from a data: or script URL. */
export function isSafeImageSrc(src: string): boolean {
  try {
    const { protocol } = new URL(src.trim(), window.location.origin);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * A screenshot pasted into a post is written to a folder the author picked on
 * their own machine, and the post keeps only its file name behind this scheme.
 * Nothing resolves it but this browser: the bytes never enter localStorage, so
 * a few screenshots cannot fill the quota the posts themselves live in.
 */
export const LOCAL_IMAGE_PREFIX = 'local:';

// A bare file name and nothing else: no slashes, no `..`, no query. Whatever is
// stored has to be safe to hand straight to `getFileHandle`.
const LOCAL_IMAGE_NAME = /^[a-z0-9][a-z0-9_-]{0,63}\.(png|jpe?g|gif|webp|avif)$/i;

export function isLocalImageName(name: string): boolean {
  return LOCAL_IMAGE_NAME.test(name);
}

export function localImageSrc(name: string): string {
  return `${LOCAL_IMAGE_PREFIX}${name}`;
}

/** The file name behind a `local:` src, or null when it is anything else. */
export function localImageName(src: string): string | null {
  const trimmed = src.trim();
  if (!trimmed.startsWith(LOCAL_IMAGE_PREFIX)) return null;

  const name = trimmed.slice(LOCAL_IMAGE_PREFIX.length);
  return isLocalImageName(name) ? name : null;
}

/** Every folder-backed image this HTML refers to, for working out what is still in use. */
export function localImageNamesIn(html: string): Set<string> {
  const names = new Set<string>();
  if (typeof window === 'undefined' || !html) return names;

  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  for (const image of Array.from(doc.querySelectorAll('img'))) {
    const name = localImageName(image.getAttribute('src') ?? '');
    if (name) names.add(name);
  }

  return names;
}

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i;

/** True for a URL that clearly points at an image, which is what makes pasting one work. */
export function isImageUrl(value: string): boolean {
  const text = value.trim();
  if (/\s/.test(text) || !isSafeImageSrc(text)) return false;

  try {
    return IMAGE_EXTENSIONS.test(new URL(text).pathname);
  } catch {
    return false;
  }
}

function cleanElement(el: Element) {
  // Walk a static copy — the list mutates as we unwrap/remove nodes.
  for (const child of Array.from(el.children)) {
    if (DROPPED_TAGS.has(child.tagName)) {
      child.remove();
      continue;
    }

    cleanElement(child);

    if (!ALLOWED_TAGS.has(child.tagName)) {
      child.replaceWith(...Array.from(child.childNodes));
      continue;
    }

    const allowed = [...(ALLOWED_ATTRS[child.tagName] ?? []), ...GLOBAL_ATTRS];
    for (const attr of Array.from(child.attributes)) {
      if (!allowed.includes(attr.name.toLowerCase())) {
        child.removeAttribute(attr.name);
      }
    }

    const dir = child.getAttribute('dir');
    if (dir !== null && !DIR_VALUES.has(dir.toLowerCase())) {
      child.removeAttribute('dir');
    }

    // A cell span has to be a small positive integer; anything else is dropped
    // rather than handed to the layout engine.
    for (const attr of SPAN_ATTRS) {
      const raw = child.getAttribute(attr);
      if (raw === null) continue;

      const span = Number(raw);
      if (!Number.isInteger(span) || span < 1 || span > MAX_CELL_SPAN) {
        child.removeAttribute(attr);
      }
    }

    // A column width is a bare pixel count inside the range the editor offers.
    // Anything else — a percentage, a calc(), a negative — is dropped.
    if (child.tagName === 'COL') {
      const raw = child.getAttribute('width');
      if (raw !== null) {
        const width = Number(raw);
        if (!Number.isInteger(width) || width < MIN_COLUMN_WIDTH || width > MAX_COLUMN_WIDTH) {
          child.removeAttribute('width');
        }
      }
    }

    // Turning paragraphs into a list leaves `<p><ul>…</ul></p>`, which the parser
    // splits into empty paragraphs on either side. Drop those, but keep <p><br></p>
    // since that is a deliberate blank line.
    if (child.tagName === 'P' && child.childNodes.length === 0) {
      child.remove();
      continue;
    }

    // Browsers still emit <div> blocks in places; normalise them to paragraphs
    // so saved content is consistently styled.
    if (child.tagName === 'DIV') {
      const paragraph = child.ownerDocument.createElement('p');
      paragraph.append(...Array.from(child.childNodes));
      child.replaceWith(paragraph);
      continue;
    }

    if (child.tagName === 'A') {
      const href = child.getAttribute('href') ?? '';
      if (!isSafeHref(href)) {
        child.removeAttribute('href');
      } else {
        child.setAttribute('rel', 'noopener noreferrer');
        child.setAttribute('target', '_blank');
      }
    }

    // An image is dropped outright unless its source is a plain http(s) URL or a
    // `local:` reference to a file in the author's own image folder.
    if (child.tagName === 'IMG') {
      const src = child.getAttribute('src') ?? '';
      if (!isSafeImageSrc(src) && !localImageName(src)) {
        child.remove();
        continue;
      }
    }
  }
}

/**
 * Strips everything that is not on the allow-list. Browser-only (uses DOMParser);
 * returns an empty string during SSR so nothing unsanitized can ever be rendered.
 */
export function sanitizeHtml(html: string): string {
  if (typeof window === 'undefined') return '';

  const doc = new DOMParser().parseFromString(`<body><div id="rte-root">${html}</div></body>`, 'text/html');
  const root = doc.getElementById('rte-root');
  if (!root) return '';

  cleanElement(root);
  return root.innerHTML;
}

/**
 * The list carries the direction, not its items.
 *
 * `dir="auto"` reads the first strong character of an element's *own* text, and
 * skips anything inside a descendant that has a `dir` of its own. Marking every
 * `<li>` therefore left the `<ul>` around them with no text to judge by, so it
 * fell back to left-to-right — and a list's indent and its bullets follow the
 * list box, not the words. A Hebrew list came out indented from the left with
 * its markers stranded away from the text.
 */
const BLOCK_TAGS = new Set([
  'P', 'H1', 'H2', 'H3', 'H4', 'UL', 'OL', 'BLOCKQUOTE', 'PRE', 'TH', 'TD', 'CAPTION',
]);

/**
 * Marks each block with `dir="auto"` so the browser picks its direction from its
 * own first strong character. That is what lets one post hold both a Hebrew
 * paragraph and an English one and have each align correctly.
 *
 * Safe to run more than once: it only ever adds what is missing, and clears the
 * `dir="auto"` this function itself used to put on list items so older posts
 * come right without being edited again.
 */
export function applyAutoDirection(html: string): string {
  if (typeof window === 'undefined') return html;

  const doc = new DOMParser().parseFromString(`<body><div id="rte-root">${html}</div></body>`, 'text/html');
  const root = doc.getElementById('rte-root');
  if (!root) return html;

  // An item holding its own `dir="auto"` is what blinds the list above it. A
  // direction the author set deliberately is left alone.
  for (const item of Array.from(root.querySelectorAll('li[dir="auto"]'))) {
    item.removeAttribute('dir');
  }

  for (const block of Array.from(root.querySelectorAll('*'))) {
    // Leave an explicit direction alone — the author chose it.
    if (BLOCK_TAGS.has(block.tagName) && !block.hasAttribute('dir')) {
      block.setAttribute('dir', 'auto');
    }
  }

  return root.innerHTML;
}

/** The strip a table scrolls inside. Added for display only, never stored. */
export const TABLE_SCROLL_CLASS = 'rte-table-scroll';

/**
 * Puts each table inside a scrolling strip.
 *
 * A table cannot be both the thing that clips and the thing that overflows, so
 * on its own it has to choose: capped at the column of text, or free to be as
 * wide as its columns ask for and pushing the page sideways. Wrapping gives it
 * both — the strip is capped, the table inside it is not — which is what lets
 * column widths adding up to more than the page survive rather than being
 * squeezed to fit.
 *
 * The wrapper is a rendering detail. It never reaches storage: the sanitizer
 * strips unknown classes and turns a bare `<div>` into a paragraph, so anything
 * read back out of the editor goes through `unwrapTables` first.
 */
export function wrapTables(html: string): string {
  if (typeof window === 'undefined' || !html || !html.includes('<table')) return html;

  const doc = new DOMParser().parseFromString(`<body><div id="wrap-root">${html}</div></body>`, 'text/html');
  const root = doc.getElementById('wrap-root');
  if (!root) return html;

  for (const table of Array.from(root.querySelectorAll('table'))) {
    // Already wrapped, or nested somewhere a strip would not help.
    if (table.parentElement?.classList.contains(TABLE_SCROLL_CLASS)) continue;

    const strip = doc.createElement('div');
    strip.className = TABLE_SCROLL_CLASS;
    table.replaceWith(strip);
    strip.appendChild(table);
  }

  return root.innerHTML;
}

/** Takes the strips back off, so what is saved is the table on its own. */
export function unwrapTables(html: string): string {
  if (typeof window === 'undefined' || !html || !html.includes(TABLE_SCROLL_CLASS)) return html;

  const doc = new DOMParser().parseFromString(`<body><div id="unwrap-root">${html}</div></body>`, 'text/html');
  const root = doc.getElementById('unwrap-root');
  if (!root) return html;

  for (const strip of Array.from(root.querySelectorAll(`div.${TABLE_SCROLL_CLASS}`))) {
    strip.replaceWith(...Array.from(strip.childNodes));
  }

  return root.innerHTML;
}

/* -------------------------------------------------------------------------- */
/*  Derived fields                                                            */
/* -------------------------------------------------------------------------- */

/** Flattens HTML into readable plain text — this is what the TTS player speaks. */
export function htmlToPlainText(html: string): string {
  if (typeof window === 'undefined') return '';

  const withBreaks = html
    .replace(/<br\s*\/?>/gi, '\n')
    // Read a table row as one line of comma-separated cells.
    .replace(/<\/(td|th)>/gi, ', ')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/(p|h1|h2|h3|h4|li|blockquote|pre|div|caption)>/gi, '\n\n');

  const doc = new DOMParser().parseFromString(`<body>${withBreaks}</body>`, 'text/html');

  return (doc.body.textContent ?? '')
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    // The last cell of a row leaves a dangling separator.
    .replace(/,\s*(?=\n|$)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* -------------------------------------------------------------------------- */
/*  Text direction                                                            */
/* -------------------------------------------------------------------------- */

// Hebrew, Arabic, Syriac, Thaana, N'Ko and the Arabic presentation forms.
const RTL_CHARS = /[֐-׿؀-ۿ܀-ݏހ-޿߀-߿יִ-﷿ﹰ-﻿]/;
const LTR_CHARS = /[A-Za-zÀ-ʯͰ-֏]/;

const HEBREW_CHARS = /[֐-׿יִ-ﭏ]/;
const ARABIC_CHARS = /[؀-ۿﭐ-﷿ﹰ-﻿]/;

/**
 * Direction of the first strong character, which is the same rule the browser
 * applies for `dir="auto"`.
 */
export function detectDirection(text: string): 'ltr' | 'rtl' {
  for (const char of text) {
    if (RTL_CHARS.test(char)) return 'rtl';
    if (LTR_CHARS.test(char)) return 'ltr';
  }
  return 'ltr';
}

/** Coarse language tag for the TTS voice and for assistive tech. */
export function detectLanguage(text: string): string {
  if (HEBREW_CHARS.test(text)) return 'he';
  if (ARABIC_CHARS.test(text)) return 'ar';
  return 'en';
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function estimateReadingTime(plainText: string): number {
  return Math.max(1, Math.round(countWords(plainText) / 200));
}

export function formatPostDate(date: Date): string {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    // Letters from any script, so a Hebrew title keeps a readable slug rather
    // than being stripped down to nothing.
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

/** Appends -2, -3, … until the slug no longer collides with a saved post. */
export function uniqueSlug(title: string, ignoreSlug?: string): string {
  const base = slugify(title) || 'untitled-post';
  const taken = new Set(getLocalPosts().map((post) => post.slug));
  if (ignoreSlug) taken.delete(ignoreSlug);

  if (!taken.has(base)) return base;

  let counter = 2;
  while (taken.has(`${base}-${counter}`)) counter++;
  return `${base}-${counter}`;
}

/* -------------------------------------------------------------------------- */
/*  Storage                                                                   */
/* -------------------------------------------------------------------------- */

function isLocalBlogPost(value: unknown): value is LocalBlogPost {
  if (typeof value !== 'object' || value === null) return false;
  const post = value as Partial<LocalBlogPost>;
  return typeof post.slug === 'string' && typeof post.title === 'string' && typeof post.contentHtml === 'string';
}

export function getLocalPosts(): LocalBlogPost[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(LOCAL_POSTS_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(isLocalBlogPost)
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  } catch {
    // Corrupted or unreadable storage — behave as if there were no posts.
    return [];
  }
}

/**
 * Creates the posts from `lib/blog.ts` when this browser has no stored posts at
 * all. An existing entry is left alone even when it is an empty list, so deleting
 * every post stays deleted — only a missing (or unreadable) entry seeds again.
 */
export function ensureSeeded(): void {
  if (typeof window === 'undefined') return;

  try {
    const raw = window.localStorage.getItem(LOCAL_POSTS_KEY);
    if (raw !== null && Array.isArray(JSON.parse(raw))) return;
  } catch {
    // Unparseable entry — treat it as missing and write the defaults over it.
  }

  try {
    writeLocalPosts(
      getDefaultPosts().map<LocalBlogPost>((post) => ({
        ...post,
        // Fall back to the published date when the seed carries no timestamp.
        createdAt: post.createdAt ?? new Date(post.date).toISOString(),
      }))
    );
  } catch {
    // Storage unavailable (private mode, blocked cookies) — the blog stays empty.
  }
}

export function getLocalPostBySlug(slug: string): LocalBlogPost | undefined {
  return getLocalPosts().find((post) => post.slug === slug);
}

function writeLocalPosts(posts: LocalBlogPost[]) {
  window.localStorage.setItem(LOCAL_POSTS_KEY, JSON.stringify(posts));
  window.dispatchEvent(new CustomEvent(LOCAL_POSTS_EVENT));
}

export function saveLocalPost(post: LocalBlogPost) {
  const posts = getLocalPosts().filter((existing) => existing.slug !== post.slug);
  writeLocalPosts([post, ...posts]);
}

export function deleteLocalPost(slug: string) {
  writeLocalPosts(getLocalPosts().filter((post) => post.slug !== slug));
}

/* -------------------------------------------------------------------------- */
/*  Drafts                                                                    */
/* -------------------------------------------------------------------------- */

export interface PostDraft {
  title: string;
  excerpt: string;
  category: string;
  authorName: string;
  contentHtml: string;
  /** Explicit direction the author picked, or null for automatic. */
  direction?: 'ltr' | 'rtl' | null;
  coverImage?: string;
  coverPosition?: CoverPosition;
  savedAt: string;
}

export function saveDraft(draft: Omit<PostDraft, 'savedAt'>) {
  if (typeof window === 'undefined') return;
  const payload: PostDraft = { ...draft, savedAt: new Date().toISOString() };
  window.localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify(payload));
}

export function getDraft(): PostDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_DRAFT_KEY);
    return raw ? (JSON.parse(raw) as PostDraft) : null;
  } catch {
    return null;
  }
}

export function clearDraft() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(LOCAL_DRAFT_KEY);
}
