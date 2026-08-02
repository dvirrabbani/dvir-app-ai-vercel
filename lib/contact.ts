/**
 * Contact messages. There is no server behind this form, so a message is kept
 * in the browser it was written in and goes nowhere else. The page says as much
 * rather than pretending it was sent.
 */

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  createdAt: string;
}

export const CONTACT_KEY = 'dvir-contact:messages';

/** Fired on `window` after any write, so open views can refresh themselves. */
export const CONTACT_EVENT = 'contact-changed';

export const NAME_MAX_LENGTH = 60;
export const SUBJECT_MAX_LENGTH = 80;
export const MESSAGE_MAX_LENGTH = 2000;

/** Deliberately loose: enough to catch a typo, not to police valid addresses. */
export function isValidEmail(email: string): boolean {
  const value = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isMessage(value: unknown): value is ContactMessage {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Partial<ContactMessage>;
  return typeof item.id === 'string' && typeof item.message === 'string';
}

export function getMessages(): ContactMessage[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(CONTACT_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Newest first: the most recent message is the one worth seeing.
    return parsed.filter(isMessage).sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  } catch {
    return [];
  }
}

function writeMessages(messages: ContactMessage[]) {
  try {
    window.localStorage.setItem(CONTACT_KEY, JSON.stringify(messages));
    window.dispatchEvent(new CustomEvent(CONTACT_EVENT));
  } catch {
    // Storage unavailable (private mode, quota) — the message just does not stick.
  }
}

export interface ContactErrors {
  name?: string;
  email?: string;
  message?: string;
}

/** Checks a message before saving; an empty object means it is good to go. */
export function validateMessage(input: { name: string; email: string; message: string }): ContactErrors {
  const errors: ContactErrors = {};

  if (!input.name.trim()) errors.name = 'Tell us who this is from.';
  if (!input.message.trim()) errors.message = 'The message is empty.';
  // An address is optional, but a wrong one is worse than none.
  if (input.email.trim() && !isValidEmail(input.email)) errors.email = 'That does not look like an email address.';

  return errors;
}

export function addMessage(input: {
  name: string;
  email: string;
  subject: string;
  message: string;
}): ContactMessage | null {
  if (Object.keys(validateMessage(input)).length > 0) return null;

  const message: ContactMessage = {
    id: `message-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: input.name.trim().slice(0, NAME_MAX_LENGTH),
    email: input.email.trim(),
    subject: input.subject.trim().slice(0, SUBJECT_MAX_LENGTH),
    message: input.message.trim().slice(0, MESSAGE_MAX_LENGTH),
    createdAt: new Date().toISOString(),
  };

  writeMessages([message, ...getMessages()]);
  return message;
}

export function deleteMessage(id: string) {
  writeMessages(getMessages().filter((message) => message.id !== id));
}

export function formatSentAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
