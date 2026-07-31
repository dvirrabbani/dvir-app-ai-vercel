import { BlogPost, getDefaultPosts } from '@/lib/blog';

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

export const POST_CATEGORIES = ['Engineering', 'Design', 'Framework', 'Product', 'Personal'];

/* -------------------------------------------------------------------------- */
/*  HTML sanitizing                                                           */
/* -------------------------------------------------------------------------- */

const ALLOWED_TAGS = new Set([
  'P', 'BR', 'HR', 'DIV', 'SPAN',
  'STRONG', 'B', 'EM', 'I', 'U', 'S', 'STRIKE',
  'H1', 'H2', 'H3', 'H4',
  'UL', 'OL', 'LI',
  'BLOCKQUOTE', 'CODE', 'PRE', 'A', 'IMG',
]);

// Removed with their contents, rather than unwrapped.
const DROPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'FORM', 'INPUT', 'SVG']);

const ALLOWED_ATTRS: Record<string, string[]> = {
  A: ['href', 'target', 'rel'],
  IMG: ['src', 'alt', 'title'],
};

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

    // An image whose source is not a plain http(s) URL is dropped outright.
    if (child.tagName === 'IMG' && !isSafeImageSrc(child.getAttribute('src') ?? '')) {
      child.remove();
      continue;
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

const BLOCK_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'LI', 'BLOCKQUOTE', 'PRE']);

/**
 * Marks each block with `dir="auto"` so the browser picks its direction from its
 * own first strong character. That is what lets one post hold both a Hebrew
 * paragraph and an English one and have each align correctly.
 */
export function applyAutoDirection(html: string): string {
  if (typeof window === 'undefined') return html;

  const doc = new DOMParser().parseFromString(`<body><div id="rte-root">${html}</div></body>`, 'text/html');
  const root = doc.getElementById('rte-root');
  if (!root) return html;

  for (const block of Array.from(root.querySelectorAll('*'))) {
    // Leave an explicit direction alone — the author chose it.
    if (BLOCK_TAGS.has(block.tagName) && !block.hasAttribute('dir')) {
      block.setAttribute('dir', 'auto');
    }
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
    .replace(/<\/(p|h1|h2|h3|h4|li|blockquote|pre|div)>/gi, '\n\n');

  const doc = new DOMParser().parseFromString(`<body>${withBreaks}</body>`, 'text/html');

  return (doc.body.textContent ?? '')
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
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
