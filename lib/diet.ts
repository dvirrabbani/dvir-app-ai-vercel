/**
 * The menu you eat off: the dishes that come round often enough to be worth
 * keeping on hand, so writing down lunch is one tap rather than typing the same
 * words for the hundredth time.
 *
 * This is not a record of anything. `lifestyle.ts` holds what was actually eaten
 * and when; this is only the standing list it gets picked from. Taking a dish off
 * the menu leaves every meal already written down exactly where it is.
 *
 * A dish is tagged with the stretches of the day it belongs at, which is what
 * keeps porridge out of the evening card — a dish tagged with none of them is
 * eaten at any hour and shows up under all three. Nothing is seeded: what
 * somebody eats is not a thing to guess at, so the menu starts empty and fills
 * up from the meals they log.
 *
 * A dish can also be a whole meal with things under it — chicken, rice and
 * salad kept under one name — so the plate you eat every Tuesday is one chip
 * rather than three. The parts are only what the meal is made of, not separate
 * dishes: they have no tags of their own, and they go into the day log with the
 * meal, so the record still says the rice was there.
 *
 * Like everything else here it lives in localStorage only — one browser's copy,
 * and a diet especially is not sent anywhere.
 */

import { DAY_PARTS, DayPart } from '@/lib/day-parts';

export interface Dish {
  id: string;
  name: string;
  /** The stretches of the day it is eaten at. Empty means every one of them. */
  parts: DayPart[];
  /** What the meal is made of. Empty for a dish that is only ever itself. */
  ingredients: string[];
  createdAt: string;
}

export const DIET_KEY = 'dvir-diet:menu';

/** Fired on `window` after any write, so open views can refresh themselves. */
export const DIET_EVENT = 'diet-changed';

export const DISH_MAX_LENGTH = 60;
export const MAX_DISHES = 60;

export const INGREDIENT_MAX_LENGTH = 40;
export const MAX_INGREDIENTS = 12;

/**
 * What stands between a meal's name and what it is made of on the one line the
 * day log keeps. Written down once here because the log both makes that line
 * (`describeDish`) and has to read it back apart again when it counts up which
 * meals a stretch of days was made of.
 */
export const MEAL_SEPARATOR = ' — ';

/* -------------------------------------------------------------------------- */
/*  Reading                                                                   */
/* -------------------------------------------------------------------------- */

function makeId(): string {
  return `dish-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Read in the day's own order, so a dish never lists its parts back to front. */
function normaliseParts(value: unknown): DayPart[] {
  if (!Array.isArray(value)) return [];
  return DAY_PARTS.filter((part) => value.includes(part));
}

/**
 * What a meal is made of, kept in the order it was written — a plate is read
 * out in the order you think of it, and re-sorting it would put the salad
 * first. The same thing twice is dropped, whatever case it was typed in: one
 * line per thing on the plate is the whole point of the list.
 */
function normaliseIngredients(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const ingredients: string[] = [];
  for (const raw of value) {
    if (typeof raw !== 'string') continue;

    const name = raw.trim().slice(0, INGREDIENT_MAX_LENGTH);
    if (!name || ingredients.some((each) => sameName(each, name))) continue;

    ingredients.push(name);
    if (ingredients.length >= MAX_INGREDIENTS) break;
  }

  return ingredients;
}

function toDish(value: unknown): Dish | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Partial<Dish>;
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string') return null;

  const name = raw.name.trim().slice(0, DISH_MAX_LENGTH);
  if (!name) return null;

  return {
    id: raw.id,
    name,
    parts: normaliseParts(raw.parts),
    // Absent on every dish written before meals could hold anything, which
    // reads as a dish that is only itself — exactly what those were.
    ingredients: normaliseIngredients(raw.ingredients),
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date(0).toISOString(),
  };
}

/**
 * The menu in the order it was written, which is the one order that does not
 * move under you: a menu that re-sorted itself as dishes were renamed would put
 * a different chip under your thumb every time.
 */
export function getMenu(): Dish[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(DIET_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(toDish)
      .filter((dish): dish is Dish => dish !== null)
      .slice(0, MAX_DISHES)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } catch {
    return [];
  }
}

/* -------------------------------------------------------------------------- */
/*  Writing                                                                   */
/* -------------------------------------------------------------------------- */

function writeMenu(menu: Dish[]) {
  try {
    window.localStorage.setItem(DIET_KEY, JSON.stringify(menu));
    window.dispatchEvent(new CustomEvent(DIET_EVENT));
  } catch {
    // Storage unavailable (private mode, quota) — the change just does not stick.
  }
}

/** Whether the menu already carries this dish, whatever case it was typed in. */
export function isOnMenu(menu: Dish[], name: string): boolean {
  return menu.some((dish) => sameName(dish.name, name));
}

/**
 * Puts a dish on the menu. The same dish twice is refused rather than added —
 * the whole point of the list is that there is one chip per thing you eat — and
 * so is a name with nothing in it.
 */
export function addDish(input: { name: string; parts?: DayPart[]; ingredients?: string[] }): Dish | null {
  const name = input.name.trim().slice(0, DISH_MAX_LENGTH);
  if (!name) return null;

  const menu = getMenu();
  if (menu.length >= MAX_DISHES || isOnMenu(menu, name)) return null;

  const dish: Dish = {
    id: makeId(),
    name,
    parts: normaliseParts(input.parts ?? []),
    ingredients: normaliseIngredients(input.ingredients ?? []),
    createdAt: new Date().toISOString(),
  };

  writeMenu([...menu, dish]);
  return dish;
}

/**
 * Renaming, moving a dish to another stretch of the day, or changing what the
 * meal is made of.
 */
export function updateDish(
  id: string,
  changes: { name?: string; parts?: DayPart[]; ingredients?: string[] }
): boolean {
  const menu = getMenu();
  const existing = menu.find((dish) => dish.id === id);
  if (!existing) return false;

  const name = (changes.name ?? existing.name).trim().slice(0, DISH_MAX_LENGTH);
  if (!name) return false;

  // Renaming onto a dish already on the menu is the duplicate case again, only
  // arrived at sideways. The dish keeping its own name is not a clash with itself.
  if (menu.some((dish) => dish.id !== id && sameName(dish.name, name))) return false;

  const parts = changes.parts === undefined ? existing.parts : normaliseParts(changes.parts);
  const ingredients =
    changes.ingredients === undefined ? existing.ingredients : normaliseIngredients(changes.ingredients);

  writeMenu(menu.map((dish) => (dish.id === id ? { ...dish, name, parts, ingredients } : dish)));
  return true;
}

/**
 * Adding one thing to a meal. Refused when the meal is already as long as a
 * plate gets, or when that thing is on it — so the caller can say why rather
 * than the line quietly vanishing.
 */
export function addIngredient(id: string, name: string): boolean {
  const trimmed = name.trim().slice(0, INGREDIENT_MAX_LENGTH);
  if (!trimmed) return false;

  const existing = getMenu().find((dish) => dish.id === id);
  if (!existing) return false;

  if (
    existing.ingredients.length >= MAX_INGREDIENTS ||
    existing.ingredients.some((each) => sameName(each, trimmed))
  ) {
    return false;
  }

  return updateDish(id, { ingredients: [...existing.ingredients, trimmed] });
}

export function removeIngredient(id: string, name: string): boolean {
  const existing = getMenu().find((dish) => dish.id === id);
  if (!existing) return false;

  return updateDish(id, { ingredients: existing.ingredients.filter((each) => !sameName(each, name)) });
}

export function deleteDish(id: string) {
  writeMenu(getMenu().filter((dish) => dish.id !== id));
}

/* -------------------------------------------------------------------------- */
/*  Reading it back against a part of the day                                 */
/* -------------------------------------------------------------------------- */

/**
 * What is on the menu for one stretch of the day: the dishes tagged for it, plus
 * the untagged ones, which are eaten at any hour and belong everywhere.
 */
export function dishesForPart(menu: Dish[], part: DayPart): Dish[] {
  return menu.filter((dish) => dish.parts.length === 0 || dish.parts.includes(part));
}

/**
 * The line a dish is written into the day log as. A meal made of things carries
 * them with it, because the log keeps a name and not a reference: reading the
 * week back should still say there was rice, even if the meal is renamed or
 * taken off the menu afterwards.
 */
export function describeDish(dish: Dish): string {
  return dish.ingredients.length === 0 ? dish.name : `${dish.name}${MEAL_SEPARATOR}${dish.ingredients.join(', ')}`;
}
