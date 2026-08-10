/**
 * The three stretches a day is read in — the morning, the noon, the evening.
 *
 * Kept apart from any one feature because more than one thing is placed by this
 * same clock: the routines falling due, and the meals, wake-ups and bathroom
 * trips written down beside them.
 */

export type DayPart = 'morning' | 'noon' | 'evening';

export const DAY_PARTS: DayPart[] = ['morning', 'noon', 'evening'];

export const DAY_PART_LABELS: Record<DayPart, string> = {
  morning: 'Morning',
  noon: 'Noon',
  evening: 'Evening',
};

/** The same three read into a sentence: "what you ate at noon". */
export const DAY_PART_WHEN: Record<DayPart, string> = {
  morning: 'in the morning',
  noon: 'at noon',
  evening: 'in the evening',
};

/** Where noon takes over from the morning, and the evening from noon. */
const NOON_HOUR = 12;
const EVENING_HOUR = 17;

export const DAY_PART_HOURS: Record<DayPart, string> = {
  morning: 'Until 12:00',
  noon: '12:00 – 17:00',
  evening: 'From 17:00',
};

/**
 * The hour something added to a part of the day starts out at. It is only a
 * starting point — the time is the one thing deciding which part something
 * shows up in, so it has to be one this part actually covers.
 */
export const DAY_PART_DEFAULT_TIME: Record<DayPart, string> = {
  morning: '08:00',
  noon: '13:00',
  evening: '19:00',
};

/**
 * Which stretch of the day a time falls in. Something with no time at all has
 * nothing to place it, so it sits in the morning — where an untimed day starts
 * — rather than being hidden.
 */
export function partOfDay(time: string): DayPart {
  const hour = Number(time.slice(0, 2));
  if (!Number.isFinite(hour) || hour < NOON_HOUR) return 'morning';
  return hour < EVENING_HOUR ? 'noon' : 'evening';
}

/** A clock time from a date, in the HH:MM the rest of this code stores. */
export function toTimeKey(date: Date): string {
  return `${date.getHours()}`.padStart(2, '0') + ':' + `${date.getMinutes()}`.padStart(2, '0');
}

/**
 * What to put in a time field for this part. Now, when now is inside the part —
 * logging lunch at lunchtime should not need the clock typing in — and the
 * part's own hour otherwise, including on any day that is not today.
 */
export function defaultTimeFor(part: DayPart, now?: Date): string {
  if (!now) return DAY_PART_DEFAULT_TIME[part];

  const time = toTimeKey(now);
  return partOfDay(time) === part ? time : DAY_PART_DEFAULT_TIME[part];
}
