'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { motion } from 'framer-motion';
import { ArrowLeft, Send, Trash2, Check, Mail, Inbox, Info } from 'lucide-react';
import {
  ContactErrors,
  MESSAGE_MAX_LENGTH,
  NAME_MAX_LENGTH,
  SUBJECT_MAX_LENGTH,
  addMessage,
  deleteMessage,
  formatSentAt,
  validateMessage,
} from '@/lib/contact';
import { useContact } from '@/lib/use-contact';

const fieldClass =
  'w-full rounded-xl border border-gray-200 bg-white/60 px-4 py-2.5 text-sm text-[#1C1C1E] outline-none transition-colors placeholder:text-gray-500 focus:border-[#FF4D8E]/50 focus:ring-2 focus:ring-[#FF4D8E]/20 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-gray-400';

const cardClass =
  'rounded-2xl border border-white/30 bg-white/60 p-5 backdrop-blur-md dark:border-white/10 dark:bg-white/5 md:p-6';

export default function ContactPage() {
  const { messages, hydrated } = useContact();
  const { data: session } = useSession();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<ContactErrors>({});
  const [justSaved, setJustSaved] = useState(false);

  const sessionName = session?.user?.name ?? '';

  const handleSend = useCallback(() => {
    const draft = { name: name || sessionName, email, subject, message };
    const found = validateMessage(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    if (!addMessage(draft)) {
      setErrors({ message: 'That could not be saved in this browser.' });
      return;
    }

    setName('');
    setEmail('');
    setSubject('');
    setMessage('');
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 4000);
  }, [email, message, name, sessionName, subject]);

  const handleDelete = useCallback((id: string, preview: string) => {
    if (!window.confirm(`Remove "${preview.slice(0, 40)}${preview.length > 40 ? '…' : ''}"?`)) return;
    deleteMessage(id);
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#FFF5F8] via-background to-background dark:from-[#1C1C1E] dark:via-[#1C1C1E] dark:to-[#1C1C1E]">
      <div className="container mx-auto max-w-6xl px-4 pt-24 md:px-6 md:pt-28">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground md:mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>

        <motion.header
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-6 md:mb-8"
        >
          <h1 className="mb-3 text-3xl font-bold text-foreground md:text-4xl lg:text-5xl">Contact</h1>
          <p className="max-w-2xl text-base text-muted-foreground md:text-lg">
            Write a message and it will be kept here for you to read.
          </p>
        </motion.header>

        {/* Where the message actually goes */}
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-[#00C2FF]/25 bg-[#00C2FF]/5 p-4 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#00C2FF]" />
          <p className="text-muted-foreground">
            There is no server behind this form yet, so a message is saved in this browser and is not sent anywhere.
          </p>
        </div>

        {/* Form */}
        <section className={`${cardClass} mb-6`}>
          <div className="mb-4 flex items-center gap-2">
            <Mail className="h-5 w-5 text-[#FF4D8E]" />
            <h2 className="text-lg font-semibold text-foreground md:text-xl">New message</h2>
          </div>

          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="contact-name" className="mb-1.5 block text-sm font-medium text-foreground">
                  Name
                </label>
                <input
                  id="contact-name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
                  }}
                  dir="auto"
                  maxLength={NAME_MAX_LENGTH}
                  placeholder={sessionName || 'Your name'}
                  className={fieldClass}
                />
                {errors.name && <p className="mt-1.5 text-xs text-destructive">{errors.name}</p>}
              </div>

              <div>
                <label htmlFor="contact-email" className="mb-1.5 block text-sm font-medium text-foreground">
                  Email <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <input
                  id="contact-email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
                  }}
                  placeholder="you@example.com"
                  className={fieldClass}
                />
                {errors.email && <p className="mt-1.5 text-xs text-destructive">{errors.email}</p>}
              </div>
            </div>

            <div>
              <label htmlFor="contact-subject" className="mb-1.5 block text-sm font-medium text-foreground">
                Subject <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <input
                id="contact-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                dir="auto"
                maxLength={SUBJECT_MAX_LENGTH}
                placeholder="What is this about?"
                className={fieldClass}
              />
            </div>

            <div>
              <label htmlFor="contact-message" className="mb-1.5 block text-sm font-medium text-foreground">
                Message
              </label>
              <textarea
                id="contact-message"
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                  if (errors.message) setErrors((prev) => ({ ...prev, message: undefined }));
                }}
                dir="auto"
                rows={5}
                maxLength={MESSAGE_MAX_LENGTH}
                placeholder="Say what you came to say."
                className={`${fieldClass} resize-y`}
              />
              <div className="mt-1.5 flex items-center justify-between gap-3">
                {errors.message ? (
                  <p className="text-xs text-destructive">{errors.message}</p>
                ) : (
                  <span />
                )}
                <span className="text-xs text-muted-foreground">
                  {message.length}/{MESSAGE_MAX_LENGTH}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              {justSaved ? (
                <p className="inline-flex items-center gap-2 text-xs text-[#10B981]">
                  <Check className="h-4 w-4" />
                  Saved below
                </p>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={handleSend}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#FF4D8E] px-6 py-2.5 text-sm font-medium text-white shadow-lg shadow-[#FF4D8E]/25 transition-colors hover:bg-[#FF4D8E]/90"
              >
                <Send className="h-4 w-4" />
                Save message
              </button>
            </div>
          </div>
        </section>

        {/* Saved messages */}
        <section className="pb-16 md:pb-24">
          <div className="mb-4 flex items-center gap-2">
            <Inbox className="h-5 w-5 text-[#8B5CF6]" />
            <h2 className="text-lg font-semibold text-foreground md:text-xl">
              Messages {hydrated && messages.length > 0 && (
                <span className="font-normal text-muted-foreground">({messages.length})</span>
              )}
            </h2>
          </div>

          {!hydrated ? (
            <div className="space-y-3" aria-hidden>
              {Array.from({ length: 2 }).map((_, index) => (
                <div key={index} className="h-24 animate-pulse rounded-2xl bg-foreground/5" />
              ))}
            </div>
          ) : messages.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Nothing here yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {messages.map((item) => (
                <li key={item.id} className={cardClass}>
                  <div className="mb-2 flex items-start justify-between gap-3">
                    {/* Fills the row, so a Hebrew subject lands against the right
                        edge rather than inside a box the width of its own words. */}
                    <div className="min-w-0 flex-1">
                      {item.subject && (
                        <p dir="auto" className="text-sm font-semibold text-foreground">
                          {item.subject}
                        </p>
                      )}
                      <p dir="auto" className="text-xs text-muted-foreground">
                        {item.name}
                        {item.email && ` · ${item.email}`} · {formatSentAt(item.createdAt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id, item.subject || item.message)}
                      title="Remove this message"
                      aria-label={`Remove message from ${item.name}`}
                      className="shrink-0 rounded-full p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  {/* Plain text, rendered as text — never as markup. */}
                  <p dir="auto" className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                    {item.message}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
