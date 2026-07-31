'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { motion } from 'framer-motion';
import { ArrowLeft, ThumbsUp, ThumbsDown, Send, Trash2, Lightbulb, Check } from 'lucide-react';
import { PollAnswer, SUGGESTION_MAX_LENGTH, addSuggestion, castVote, deleteSuggestion } from '@/lib/poll';
import { usePoll } from '@/lib/use-poll';

const fieldClass =
  'w-full rounded-xl border border-gray-200 bg-white/60 px-4 py-3 text-sm text-[#1C1C1E] outline-none transition-colors placeholder:text-muted-foreground focus:border-[#FF4D8E]/50 focus:ring-2 focus:ring-[#FF4D8E]/20 dark:border-white/10 dark:bg-white/5 dark:text-white';

const HELPED_COLOR = '#10B981';
const NOT_HELPED_COLOR = '#F97316';

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function PollPage() {
  const { tally, myVote, suggestions, total, hydrated } = usePoll();
  const { data: session } = useSession();

  const [text, setText] = useState('');
  const [author, setAuthor] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [justShared, setJustShared] = useState(false);

  const sessionName = session?.user?.name ?? '';

  const handleVote = useCallback((answer: PollAnswer) => {
    castVote(answer);
  }, []);

  const handleShare = useCallback(() => {
    if (!text.trim()) {
      setError('Write a sentence or two first.');
      return;
    }

    const saved = addSuggestion(text, author || sessionName);
    if (!saved) {
      setError('That could not be saved in this browser.');
      return;
    }

    setText('');
    setError(null);
    setJustShared(true);
    window.setTimeout(() => setJustShared(false), 2500);
  }, [author, sessionName, text]);

  const handleDelete = useCallback((id: string, preview: string) => {
    if (!window.confirm(`Remove "${preview.slice(0, 40)}${preview.length > 40 ? '…' : ''}"?`)) return;
    deleteSuggestion(id);
  }, []);

  const percent = (count: number) => (total > 0 ? Math.round((count / total) * 100) : 0);

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#FFF5F8] via-background to-background dark:from-[#1C1C1E] dark:via-[#1C1C1E] dark:to-[#1C1C1E]">
      <div className="container mx-auto max-w-3xl px-4 pt-24 md:px-6 md:pt-28">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground md:mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>

        <motion.header initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="mb-8 md:mb-12">
          <h1 className="mb-3 text-3xl font-bold text-foreground md:text-4xl lg:text-5xl">Poll</h1>
          <p className="max-w-2xl text-base text-muted-foreground md:text-lg">
            Did what we shared actually help you? Cast your vote, and if something else worked better, tell us what it was.
          </p>
        </motion.header>

        {/* Vote */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mb-6 rounded-2xl border border-white/30 bg-white/60 p-5 backdrop-blur-md dark:border-white/10 dark:bg-white/5 md:mb-8 md:p-8"
        >
          <h2 className="mb-1 text-lg font-semibold text-foreground md:text-xl">Did this share help you?</h2>
          <p className="mb-5 text-sm text-muted-foreground">
            {myVote ? 'You can change your answer at any time.' : 'Pick the one that matches your experience.'}
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <VoteButton
              label="Yes, it helped"
              icon={<ThumbsUp className="h-5 w-5" />}
              color={HELPED_COLOR}
              active={myVote === 'helped'}
              onClick={() => handleVote('helped')}
            />
            <VoteButton
              label="No, not really"
              icon={<ThumbsDown className="h-5 w-5" />}
              color={NOT_HELPED_COLOR}
              active={myVote === 'not-helped'}
              onClick={() => handleVote('not-helped')}
            />
          </div>

          {/* Results */}
          <div className="mt-6 space-y-4">
            {!hydrated ? (
              <div className="h-20 animate-pulse rounded-xl bg-foreground/5" aria-hidden />
            ) : total === 0 ? (
              <p className="text-sm text-muted-foreground">No votes yet — yours will be the first.</p>
            ) : (
              <>
                <ResultBar label="Helped" count={tally.helped} percent={percent(tally.helped)} color={HELPED_COLOR} />
                <ResultBar label="Did not help" count={tally.notHelped} percent={percent(tally.notHelped)} color={NOT_HELPED_COLOR} />
                <p className="text-xs text-muted-foreground">
                  {total} {total === 1 ? 'vote' : 'votes'} · counted in this browser only
                </p>
              </>
            )}
          </div>
        </motion.section>

        {/* Share what worked */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mb-6 rounded-2xl border border-white/30 bg-white/60 p-5 backdrop-blur-md dark:border-white/10 dark:bg-white/5 md:mb-8 md:p-8"
        >
          <div className="mb-1 flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-[#FF9100]" />
            <h2 className="text-lg font-semibold text-foreground md:text-xl">Something else worked better?</h2>
          </div>
          <p className="mb-5 text-sm text-muted-foreground">
            Share what helped you instead, or what you would suggest to someone in the same position.
          </p>

          <div className="space-y-4">
            <div>
              <label htmlFor="suggestion" className="mb-1.5 block text-sm font-medium text-foreground">
                What worked for you
              </label>
              <textarea
                id="suggestion"
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  if (error) setError(null);
                }}
                dir="auto"
                rows={4}
                maxLength={SUGGESTION_MAX_LENGTH}
                placeholder="For example: breaking the work into smaller steps helped more than the checklist did."
                className={`${fieldClass} resize-y`}
              />
              <div className="mt-1.5 flex items-center justify-between">
                {error ? (
                  <p className="text-xs text-destructive">{error}</p>
                ) : (
                  <span className="text-xs text-muted-foreground">Shown on this page for anyone using this browser.</span>
                )}
                <span className="text-xs text-muted-foreground">
                  {text.length}/{SUGGESTION_MAX_LENGTH}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="sm:max-w-xs sm:flex-1">
                <label htmlFor="suggestion-author" className="mb-1.5 block text-sm font-medium text-foreground">
                  Your name <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <input
                  id="suggestion-author"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  dir="auto"
                  placeholder={sessionName || 'Anonymous'}
                  className={fieldClass}
                />
              </div>

              <button
                type="button"
                onClick={handleShare}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#FF4D8E] px-6 py-2.5 text-sm font-medium text-white shadow-lg shadow-[#FF4D8E]/25 transition-colors hover:bg-[#FF4D8E]/90"
              >
                {justShared ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                {justShared ? 'Shared' : 'Share it'}
              </button>
            </div>
          </div>
        </motion.section>

        {/* What others shared */}
        <section className="pb-16 md:pb-24">
          <h2 className="mb-4 text-lg font-semibold text-foreground md:text-xl">
            What people shared {hydrated && suggestions.length > 0 && (
              <span className="font-normal text-muted-foreground">({suggestions.length})</span>
            )}
          </h2>

          {!hydrated ? (
            <div className="space-y-3" aria-hidden>
              {Array.from({ length: 2 }).map((_, index) => (
                <div key={index} className="h-24 animate-pulse rounded-xl bg-foreground/5" />
              ))}
            </div>
          ) : suggestions.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Nothing shared yet. Be the first to say what worked for you.
            </p>
          ) : (
            <ul className="space-y-3">
              {suggestions.map((suggestion) => (
                <li
                  key={suggestion.id}
                  className="rounded-xl border border-white/30 bg-white/60 p-4 backdrop-blur-md dark:border-white/10 dark:bg-white/5 md:p-5"
                >
                  {/* Plain text, rendered as text — never as markup. */}
                  <p dir="auto" className="mb-3 text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                    {suggestion.text}
                  </p>
                  <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-3 dark:border-white/5">
                    <span className="text-xs text-muted-foreground">
                      {suggestion.author} · {formatWhen(suggestion.createdAt)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDelete(suggestion.id, suggestion.text)}
                      title="Remove this"
                      aria-label={`Remove suggestion by ${suggestion.author}`}
                      className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

function VoteButton({
  label,
  icon,
  color,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="flex items-center justify-center gap-2.5 rounded-xl border-2 px-4 py-3.5 text-sm font-medium transition-all hover:scale-[1.01]"
      style={{
        borderColor: active ? color : 'rgba(127,127,127,0.25)',
        backgroundColor: active ? `${color}1f` : 'transparent',
        color: active ? color : undefined,
      }}
    >
      {icon}
      {label}
      {active && <Check className="h-4 w-4" />}
    </button>
  );
}

function ResultBar({ label, count, percent, color }: { label: string; count: number; percent: number; color: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-muted-foreground">
          {percent}% · {count}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}
