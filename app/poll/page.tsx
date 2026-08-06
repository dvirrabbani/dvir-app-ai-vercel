'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, ThumbsUp, ThumbsDown, Send, Trash2, Lightbulb, Check, UserPlus, Settings2, X } from 'lucide-react';
import {
  PollAnswer,
  PollShare,
  PollSuggestion,
  PollUser,
  PollVote,
  SUGGESTION_MAX_LENGTH,
  addSuggestion,
  addUser,
  clearVote,
  deleteSuggestion,
  findVote,
  setCurrentUserId,
  setVote,
  tallyForShare,
} from '@/lib/poll';
import { usePoll } from '@/lib/use-poll';

const fieldClass =
  'w-full rounded-xl border border-gray-200 bg-white/60 px-4 py-3 text-sm text-[#1C1C1E] outline-none transition-colors placeholder:text-gray-500 focus:border-[#FF4D8E]/50 focus:ring-2 focus:ring-[#FF4D8E]/20 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-gray-400';

const HELPED_COLOR = '#10B981';
const NOT_HELPED_COLOR = '#F97316';

export default function PollPage() {
  const { users, shares, votes, suggestions, currentUser, hydrated } = usePoll();
  const [newUserName, setNewUserName] = useState('');
  const [userError, setUserError] = useState<string | null>(null);

  const handleAddUser = useCallback(() => {
    const created = addUser(newUserName);
    if (!created) {
      setUserError(newUserName.trim() ? 'Someone already goes by that name.' : 'Enter a name first.');
      return;
    }
    setCurrentUserId(created.id);
    setNewUserName('');
    setUserError(null);
  }, [newUserName]);

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
          className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between md:mb-8"
        >
          <div>
            <h1 className="mb-3 text-3xl font-bold text-foreground md:text-4xl lg:text-5xl">Poll</h1>
            <p className="max-w-2xl text-base text-muted-foreground md:text-lg">
              Which of these actually helped? Vote on each one, and add what worked better for you.
            </p>
          </div>

          <Link
            href="/poll/manage"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-gray-200 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-[#FF4D8E]/40 dark:border-white/10"
          >
            <Settings2 className="h-4 w-4" />
            Manage
          </Link>
        </motion.header>

        {/* Who is voting */}
        <section className="mb-6 rounded-2xl border border-white/30 bg-white/60 p-5 backdrop-blur-md dark:border-white/10 dark:bg-white/5 md:mb-8">
          <h2 className="mb-3 text-sm font-medium text-foreground">Voting as</h2>

          {!hydrated ? (
            <div className="h-9 w-48 animate-pulse rounded-full bg-foreground/5" aria-hidden />
          ) : (
            <>
              {users.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-2">
                  {users.map((user) => {
                    const active = currentUser?.id === user.id;
                    return (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => setCurrentUserId(active ? null : user.id)}
                        aria-pressed={active}
                        className="rounded-full border px-3.5 py-1.5 text-sm transition-colors"
                        style={{
                          borderColor: active ? '#FF4D8E' : 'rgba(127,127,127,0.3)',
                          backgroundColor: active ? 'rgba(255,77,142,0.12)' : 'transparent',
                          color: active ? '#FF4D8E' : undefined,
                        }}
                      >
                        {user.name}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={newUserName}
                  onChange={(e) => {
                    setNewUserName(e.target.value);
                    if (userError) setUserError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddUser();
                    }
                  }}
                  dir="auto"
                  placeholder={users.length ? 'Add another person' : 'Add yourself to start voting'}
                  aria-label="New voter name"
                  className={`${fieldClass} sm:max-w-xs`}
                />
                <button
                  type="button"
                  onClick={handleAddUser}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[#FF4D8E] px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-[#FF4D8E]/25 transition-colors hover:bg-[#FF4D8E]/90"
                >
                  <UserPlus className="h-4 w-4" />
                  Add
                </button>
              </div>

              {userError && <p className="mt-2 text-xs text-destructive">{userError}</p>}
              {!currentUser && users.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">Pick a name above to cast a vote.</p>
              )}
            </>
          )}
        </section>

        {/* Shares */}
        <section className="space-y-5 pb-16 md:pb-24">
          {!hydrated ? (
            <div className="space-y-5" aria-hidden>
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-52 animate-pulse rounded-2xl bg-foreground/5" />
              ))}
            </div>
          ) : shares.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-10 text-center">
              <h2 className="mb-2 text-lg font-semibold text-foreground">No shares yet</h2>
              <p className="mx-auto mb-6 max-w-md text-sm text-muted-foreground">
                Add the first thing for people to vote on from the manage page.
              </p>
              <Link
                href="/poll/manage"
                className="inline-flex items-center gap-2 rounded-full bg-[#FF4D8E] px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-[#FF4D8E]/25 transition-colors hover:bg-[#FF4D8E]/90"
              >
                <Settings2 className="h-4 w-4" />
                Go to manage
              </Link>
            </div>
          ) : (
            shares.map((share, index) => (
              <ShareCard
                key={share.id}
                share={share}
                index={index}
                votes={votes}
                users={users}
                suggestions={suggestions.filter((suggestion) => suggestion.shareId === share.id)}
                currentUser={currentUser}
              />
            ))
          )}
        </section>
      </div>
    </main>
  );
}

function ShareCard({
  share,
  index,
  votes,
  users,
  suggestions,
  currentUser,
}: {
  share: PollShare;
  index: number;
  votes: PollVote[];
  users: PollUser[];
  suggestions: PollSuggestion[];
  currentUser: PollUser | null;
}) {
  const [text, setText] = useState('');
  const [showForm, setShowForm] = useState(false);

  const tally = tallyForShare(votes, share.id);
  const myVote = findVote(votes, currentUser?.id ?? null, share.id);
  const percent = (count: number) => (tally.total > 0 ? Math.round((count / tally.total) * 100) : 0);

  const handleVote = useCallback(
    (answer: PollAnswer) => {
      if (!currentUser) return;
      if (myVote?.answer === answer) clearVote(currentUser.id, share.id);
      else setVote(currentUser.id, share.id, answer);
    },
    [currentUser, myVote?.answer, share.id]
  );

  const handleShare = useCallback(() => {
    if (!addSuggestion(share.id, text, currentUser)) return;
    setText('');
    setShowForm(false);
  }, [currentUser, share.id, text]);

  // Who voted which way, so the numbers can be traced back to people.
  const voterNames = (answer: PollAnswer) =>
    votes
      .filter((vote) => vote.shareId === share.id && vote.answer === answer)
      .map((vote) => users.find((user) => user.id === vote.userId)?.name)
      .filter(Boolean)
      .join(', ');

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: Math.min(index, 4) * 0.06 }}
      className="rounded-2xl border border-white/30 bg-white/60 p-5 backdrop-blur-md dark:border-white/10 dark:bg-white/5 md:p-6"
    >
      <h2 dir="auto" className="mb-1 text-lg font-semibold text-foreground md:text-xl">
        {share.title}
      </h2>
      {share.description && (
        <p dir="auto" className="mb-4 text-sm leading-relaxed text-muted-foreground">
          {share.description}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <VoteButton
          label="Helped me"
          icon={<ThumbsUp className="h-4 w-4" />}
          color={HELPED_COLOR}
          active={myVote?.answer === 'helped'}
          disabled={!currentUser}
          onClick={() => handleVote('helped')}
        />
        <VoteButton
          label="Did not help"
          icon={<ThumbsDown className="h-4 w-4" />}
          color={NOT_HELPED_COLOR}
          active={myVote?.answer === 'not-helped'}
          disabled={!currentUser}
          onClick={() => handleVote('not-helped')}
        />
      </div>

      {!currentUser && (
        <p className="mt-2 text-xs text-muted-foreground">Choose who you are above to vote on this.</p>
      )}

      <div className="mt-5 space-y-3">
        {tally.total === 0 ? (
          <p className="text-sm text-muted-foreground">No votes yet.</p>
        ) : (
          <>
            <ResultBar label="Helped" count={tally.helped} percent={percent(tally.helped)} color={HELPED_COLOR} names={voterNames('helped')} />
            <ResultBar
              label="Did not help"
              count={tally.notHelped}
              percent={percent(tally.notHelped)}
              color={NOT_HELPED_COLOR}
              names={voterNames('not-helped')}
            />
            <p className="text-xs text-muted-foreground">
              {tally.total} {tally.total === 1 ? 'vote' : 'votes'}
            </p>
          </>
        )}
      </div>

      {/* What worked better */}
      <div className="mt-5 border-t border-white/10 pt-4 dark:border-white/5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Lightbulb className="h-4 w-4 text-[#FF9100]" />
            What worked better {suggestions.length > 0 && <span className="text-muted-foreground">({suggestions.length})</span>}
          </h3>
          <button
            type="button"
            onClick={() => setShowForm((prev) => !prev)}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
          >
            {showForm ? <X className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
            {showForm ? 'Cancel' : 'Add yours'}
          </button>
        </div>

        {showForm && (
          <div className="mb-4 space-y-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              dir="auto"
              rows={3}
              maxLength={SUGGESTION_MAX_LENGTH}
              placeholder="What worked better for you?"
              aria-label={`What worked better than ${share.title}`}
              className={`${fieldClass} resize-y`}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {currentUser ? `Posting as ${currentUser.name}` : 'Posting anonymously'}
              </span>
              <button
                type="button"
                onClick={handleShare}
                disabled={!text.trim()}
                className="inline-flex items-center gap-2 rounded-full bg-[#FF4D8E] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#FF4D8E]/90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send className="h-3.5 w-3.5" />
                Share it
              </button>
            </div>
          </div>
        )}

        {suggestions.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nothing shared for this one yet.</p>
        ) : (
          <ul className="space-y-2">
            {suggestions.map((suggestion) => (
              <li key={suggestion.id} className="rounded-xl bg-black/[0.03] p-3 dark:bg-white/[0.04]">
                {/* Plain text, rendered as text — never as markup. */}
                <p dir="auto" className="mb-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {suggestion.text}
                </p>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">{suggestion.author}</span>
                  <button
                    type="button"
                    onClick={() => deleteSuggestion(suggestion.id)}
                    title="Remove this"
                    aria-label={`Remove suggestion by ${suggestion.author}`}
                    className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </motion.article>
  );
}

function VoteButton({
  label,
  icon,
  color,
  active,
  disabled,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  color: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className="flex items-center justify-center gap-2 rounded-xl border-2 px-4 py-3 text-sm font-medium transition-all hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:scale-100"
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

function ResultBar({
  label,
  count,
  percent,
  color,
  names,
}: {
  label: string;
  count: number;
  percent: number;
  color: string;
  names?: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
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
      {names && <p className="mt-1 text-xs text-muted-foreground">{names}</p>}
    </div>
  );
}
