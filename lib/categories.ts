/**
 * The categories a post can be filed under.
 *
 * These used to be a list written into the source. They live in localStorage now
 * so they can be edited, which means the set is the author's rather than the
 * app's — and like everything else here, one browser's copy.
 *
 * A post stores its category as a plain name, not an id. That is what makes an
 * old post keep working when a category is gone (it simply falls back to the
 * default colour), and it is why renaming one has to go and rewrite the posts
 * that carry it.
 */

import { LocalBlogPost, getLocalPosts, updateLocalPosts } from '@/lib/local-posts';

export interface PostCategory {
  id: string;
  name: string;
  /** Badge colour, `#rrggbb`. */
  color: string;
}

export const CATEGORIES_KEY = 'dvir-blog:categories';

/** Fired on `window` after any write, so open views can refresh themselves. */
export const CATEGORIES_EVENT = 'blog-categories-changed';

export const CATEGORY_NAME_MAX_LENGTH = 24;
export const MAX_CATEGORIES = 30;

/** Used by a post whose category is no longer on the list. */
export const FALLBACK_CATEGORY_COLOR = '#FF4D8E';

/** What a new category can be coloured. Picked to stay legible on both themes. */
export const CATEGORY_COLORS = [
  '#FF4D8E',
  '#00C2FF',
  '#FF9100',
  '#8B5CF6',
  '#10B981',
  '#0D9488',
  '#DC2626',
  '#6366F1',
  '#D97706',
  '#0EA5E9',
];

/** The list as it was written in source, kept as what a fresh browser starts with. */
const DEFAULT_CATEGORIES: Array<Omit<PostCategory, 'id'>> = [
  { name: 'Engineering', color: '#FF4D8E' },
  { name: 'Design', color: '#00C2FF' },
  { name: 'Framework', color: '#FF9100' },
  { name: 'Product', color: '#8B5CF6' },
  { name: 'Personal', color: '#10B981' },
  { name: 'Finance', color: '#0D9488' },
  { name: 'Health', color: '#DC2626' },
  { name: 'Community', color: '#6366F1' },
];

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function makeId(): string {
  return `category-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/* -------------------------------------------------------------------------- */
/*  Storage                                                                   */
/* -------------------------------------------------------------------------- */

function isCategory(value: unknown): value is PostCategory {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Partial<PostCategory>;
  return typeof item.id === 'string' && typeof item.name === 'string';
}

function normalise(category: PostCategory): PostCategory {
  return {
    id: category.id,
    name: category.name.trim().slice(0, CATEGORY_NAME_MAX_LENGTH),
    color: HEX_COLOR.test(category.color) ? category.color : FALLBACK_CATEGORY_COLOR,
  };
}

export function getCategories(): PostCategory[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(CATEGORIES_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(isCategory).map(normalise).filter((category) => category.name.length > 0);
  } catch {
    return [];
  }
}

function writeCategories(categories: PostCategory[]) {
  try {
    window.localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
    window.dispatchEvent(new CustomEvent(CATEGORIES_EVENT));
  } catch {
    // Storage unavailable (private mode, quota) — the change just does not stick.
  }
}

/**
 * Writes the starting list when this browser has none stored at all. An existing
 * entry is left alone even when empty, so clearing every category stays cleared.
 */
export function ensureCategoriesSeeded(): void {
  if (typeof window === 'undefined') return;

  try {
    const raw = window.localStorage.getItem(CATEGORIES_KEY);
    if (raw !== null && Array.isArray(JSON.parse(raw))) return;
  } catch {
    // Unreadable entry — treat it as missing and write the defaults over it.
  }

  writeCategories(DEFAULT_CATEGORIES.map((category) => ({ ...category, id: makeId() })));
}

/* -------------------------------------------------------------------------- */
/*  Reading                                                                   */
/* -------------------------------------------------------------------------- */

/** Colour for a category, including ones from older posts no longer on the list. */
export function getCategoryColor(name: string): string {
  const match = getCategories().find((category) => category.name === name);
  return match?.color ?? FALLBACK_CATEGORY_COLOR;
}

/** How many stored posts carry this category, which is what blocks a delete. */
export function categoryUsage(name: string): number {
  return getLocalPosts().filter((post: LocalBlogPost) => post.category === name).length;
}

function nameTaken(categories: PostCategory[], name: string, ignoreId?: string): boolean {
  const wanted = name.trim().toLowerCase();
  return categories.some(
    (category) => category.id !== ignoreId && category.name.toLowerCase() === wanted
  );
}

/* -------------------------------------------------------------------------- */
/*  Writing                                                                   */
/* -------------------------------------------------------------------------- */

export type CategoryResult = 'ok' | 'empty' | 'duplicate' | 'full' | 'missing' | 'in-use';

export function addCategory(name: string, color: string): CategoryResult {
  const trimmed = name.trim().slice(0, CATEGORY_NAME_MAX_LENGTH);
  if (!trimmed) return 'empty';

  const categories = getCategories();
  if (categories.length >= MAX_CATEGORIES) return 'full';
  if (nameTaken(categories, trimmed)) return 'duplicate';

  writeCategories([
    ...categories,
    { id: makeId(), name: trimmed, color: HEX_COLOR.test(color) ? color : FALLBACK_CATEGORY_COLOR },
  ]);
  return 'ok';
}

/**
 * Renames a category and every post filed under it. Posts keep the name rather
 * than an id, so leaving them behind would quietly orphan them.
 */
export function renameCategory(id: string, name: string): CategoryResult {
  const trimmed = name.trim().slice(0, CATEGORY_NAME_MAX_LENGTH);
  if (!trimmed) return 'empty';

  const categories = getCategories();
  const existing = categories.find((category) => category.id === id);
  if (!existing) return 'missing';
  if (nameTaken(categories, trimmed, id)) return 'duplicate';

  if (existing.name !== trimmed) {
    updateLocalPosts((post) => (post.category === existing.name ? { ...post, category: trimmed } : post));
  }

  writeCategories(categories.map((category) => (category.id === id ? { ...category, name: trimmed } : category)));
  return 'ok';
}

export function setCategoryColor(id: string, color: string): CategoryResult {
  if (!HEX_COLOR.test(color)) return 'missing';

  const categories = getCategories();
  if (!categories.some((category) => category.id === id)) return 'missing';

  writeCategories(categories.map((category) => (category.id === id ? { ...category, color } : category)));
  return 'ok';
}

/**
 * Removes a category, but not one posts are still filed under: rewriting them as
 * a side effect of a delete is not something to do without being asked.
 */
export function deleteCategory(id: string): CategoryResult {
  const categories = getCategories();
  const existing = categories.find((category) => category.id === id);
  if (!existing) return 'missing';
  if (categoryUsage(existing.name) > 0) return 'in-use';

  writeCategories(categories.filter((category) => category.id !== id));
  return 'ok';
}
