'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, Plus, Trash2, Pencil, Check, X, Users, ListChecks, ThumbsUp, ThumbsDown, Minus } from 'lucide-react';
import {
  PollAnswer,
  PollShare,
  PollUser,
  addShare,
  addUser,
  clearVote,
  deleteShare,
  deleteUser,
  findVote,
  renameUser,
  setVote,
  tallyForShare,
  updateShare,
} from '@/lib/poll';
import { usePoll } from '@/lib/use-poll';

const fieldClass =
  'w-full rounded-xl border border-gray-200 bg-white/60 px-4 py-2.5 text-sm text-[#1C1C1E] outline-none transition-colors placeholder:text-gray-500 focus:border-[#FF4D8E]/50 focus:ring-2 focus:ring-[#FF4D8E]/20 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-gray-400';

const cardClass =
  'rounded-2xl border border-white/30 bg-white/60 p-5 backdrop-blur-md dark:border-white/10 dark:bg-white/5 md:p-6';

const HELPED_COLOR = '#10B981';
const NOT_HELPED_COLOR = '#F97316';

export default function ManagePollPage() {
  const { users, shares, votes, suggestions, hydrated } = usePoll();

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#FFF5F8] via-background to-background dark:from-[#1C1C1E] dark:via-[#1C1C1E] dark:to-[#1C1C1E]">
      <div className="container mx-auto max-w-5xl px-4 pt-24 md:px-6 md:pt-28">
        <Link
          href="/poll"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground md:mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Poll
        </Link>

        <motion.header initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="mb-8">
          <h1 className="mb-3 text-3xl font-bold text-foreground md:text-4xl">Manage poll</h1>
          <p className="max-w-2xl text-base text-muted-foreground md:text-lg">
            Add the people voting, the shares they vote on, and set or clear any vote yourself.
          </p>
        </motion.header>

        {!hydrated ? (
          <div className="space-y-6" aria-hidden>
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-56 animate-pulse rounded-2xl bg-foreground/5" />
            ))}
          </div>
        ) : (
          <div className="space-y-6 pb-16 md:pb-24">
            <UsersSection users={users} voteCount={(userId) => votes.filter((v) => v.userId === userId).length} />
            <SharesSection shares={shares} votes={votes} suggestionCount={(shareId) => suggestions.filter((s) => s.shareId === shareId).length} />
            <VotesSection users={users} shares={shares} votes={votes} />
          </div>
        )}
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/*  Users                                                                     */
/* -------------------------------------------------------------------------- */

function UsersSection({ users, voteCount }: { users: PollUser[]; voteCount: (userId: string) => number }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const handleAdd = useCallback(() => {
    if (addUser(name)) {
      setName('');
      setError(null);
    } else {
      setError(name.trim() ? 'Someone already goes by that name.' : 'Enter a name first.');
    }
  }, [name]);

  const handleRename = useCallback(
    (id: string) => {
      if (renameUser(id, editingName)) {
        setEditingId(null);
        setError(null);
      } else {
        setError('That name is empty or already taken.');
      }
    },
    [editingName]
  );

  const handleDelete = useCallback((user: PollUser) => {
    const votes = voteCount(user.id);
    const detail = votes > 0 ? ` Their ${votes} ${votes === 1 ? 'vote' : 'votes'} will go too.` : '';
    if (!window.confirm(`Remove ${user.name}?${detail}`)) return;
    deleteUser(user.id);
  }, [voteCount]);

  return (
    <section className={cardClass}>
      <div className="mb-4 flex items-center gap-2">
        <Users className="h-5 w-5 text-[#8B5CF6]" />
        <h2 className="text-lg font-semibold text-foreground md:text-xl">
          People <span className="font-normal text-muted-foreground">({users.length})</span>
        </h2>
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAdd();
            }
          }}
          dir="auto"
          placeholder="Name"
          aria-label="New person's name"
          className={`${fieldClass} sm:max-w-xs`}
        />
        <button
          type="button"
          onClick={handleAdd}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-[#FF4D8E] px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-[#FF4D8E]/25 transition-colors hover:bg-[#FF4D8E]/90"
        >
          <Plus className="h-4 w-4" />
          Add person
        </button>
      </div>

      {error && <p className="mb-3 text-xs text-destructive">{error}</p>}

      {users.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nobody added yet.</p>
      ) : (
        <ul className="divide-y divide-black/5 dark:divide-white/5">
          {users.map((user) => (
            <li key={user.id} className="flex items-center justify-between gap-3 py-2.5">
              {editingId === user.id ? (
                <>
                  <input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); handleRename(user.id); }
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    dir="auto"
                    autoFocus
                    aria-label={`Rename ${user.name}`}
                    className={`${fieldClass} max-w-xs`}
                  />
                  <span className="flex shrink-0 gap-1">
                    <IconButton title="Save name" onClick={() => handleRename(user.id)}>
                      <Check className="h-4 w-4" />
                    </IconButton>
                    <IconButton title="Cancel" onClick={() => setEditingId(null)}>
                      <X className="h-4 w-4" />
                    </IconButton>
                  </span>
                </>
              ) : (
                <>
                  <span className="min-w-0">
                    <span dir="auto" className="block truncate text-sm font-medium text-foreground">{user.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {voteCount(user.id)} {voteCount(user.id) === 1 ? 'vote' : 'votes'}
                    </span>
                  </span>
                  <span className="flex shrink-0 gap-1">
                    <IconButton
                      title={`Rename ${user.name}`}
                      onClick={() => {
                        setEditingId(user.id);
                        setEditingName(user.name);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </IconButton>
                    <IconButton title={`Remove ${user.name}`} destructive onClick={() => handleDelete(user)}>
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Shares                                                                    */
/* -------------------------------------------------------------------------- */

function SharesSection({
  shares,
  votes,
  suggestionCount,
}: {
  shares: PollShare[];
  votes: ReturnType<typeof usePoll>['votes'];
  suggestionCount: (shareId: string) => number;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const handleAdd = useCallback(() => {
    if (!addShare(title, description)) return;
    setTitle('');
    setDescription('');
  }, [description, title]);

  const handleDelete = useCallback(
    (share: PollShare) => {
      const tally = tallyForShare(votes, share.id);
      const tips = suggestionCount(share.id);
      const extras = [
        tally.total > 0 ? `${tally.total} ${tally.total === 1 ? 'vote' : 'votes'}` : null,
        tips > 0 ? `${tips} ${tips === 1 ? 'suggestion' : 'suggestions'}` : null,
      ].filter(Boolean);

      const detail = extras.length ? ` Its ${extras.join(' and ')} will go too.` : '';
      if (!window.confirm(`Delete "${share.title}"?${detail}`)) return;
      deleteShare(share.id);
    },
    [suggestionCount, votes]
  );

  return (
    <section className={cardClass}>
      <div className="mb-4 flex items-center gap-2">
        <ListChecks className="h-5 w-5 text-[#00C2FF]" />
        <h2 className="text-lg font-semibold text-foreground md:text-xl">
          Shares <span className="font-normal text-muted-foreground">({shares.length})</span>
        </h2>
      </div>

      <div className="mb-5 space-y-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          dir="auto"
          placeholder="What was shared"
          aria-label="New share title"
          className={fieldClass}
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          dir="auto"
          rows={2}
          placeholder="A sentence of detail (optional)"
          aria-label="New share description"
          className={`${fieldClass} resize-y`}
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!title.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-[#FF4D8E] px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-[#FF4D8E]/25 transition-colors hover:bg-[#FF4D8E]/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="h-4 w-4" />
          Add share
        </button>
      </div>

      {shares.length === 0 ? (
        <p className="text-sm text-muted-foreground">No shares yet.</p>
      ) : (
        <ul className="divide-y divide-black/5 dark:divide-white/5">
          {shares.map((share) => {
            const tally = tallyForShare(votes, share.id);
            return (
              <li key={share.id} className="py-3">
                {editingId === share.id ? (
                  <div className="space-y-2">
                    <input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      dir="auto"
                      autoFocus
                      aria-label={`Rename ${share.title}`}
                      className={fieldClass}
                    />
                    <textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      dir="auto"
                      rows={2}
                      aria-label={`Description for ${share.title}`}
                      className={`${fieldClass} resize-y`}
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (updateShare(share.id, editTitle, editDescription)) setEditingId(null);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-full bg-[#FF4D8E] px-4 py-1.5 text-xs font-medium text-white hover:bg-[#FF4D8E]/90"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p dir="auto" className="text-sm font-medium text-foreground">{share.title}</p>
                      {share.description && (
                        <p dir="auto" className="mt-0.5 text-xs text-muted-foreground">{share.description}</p>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {tally.helped} helped · {tally.notHelped} did not · {suggestionCount(share.id)} shared
                      </p>
                    </div>
                    <span className="flex shrink-0 gap-1">
                      <IconButton
                        title={`Edit ${share.title}`}
                        onClick={() => {
                          setEditingId(share.id);
                          setEditTitle(share.title);
                          setEditDescription(share.description);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </IconButton>
                      <IconButton title={`Delete ${share.title}`} destructive onClick={() => handleDelete(share)}>
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Votes                                                                     */
/* -------------------------------------------------------------------------- */

function VotesSection({
  users,
  shares,
  votes,
}: {
  users: PollUser[];
  shares: PollShare[];
  votes: ReturnType<typeof usePoll>['votes'];
}) {
  const set = useCallback((userId: string, shareId: string, answer: PollAnswer) => {
    setVote(userId, shareId, answer);
  }, []);

  const clear = useCallback((userId: string, shareId: string) => {
    clearVote(userId, shareId);
  }, []);

  return (
    <section className={cardClass}>
      <div className="mb-1 flex items-center gap-2">
        <ThumbsUp className="h-5 w-5 text-[#10B981]" />
        <h2 className="text-lg font-semibold text-foreground md:text-xl">Votes</h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Every person against every share. Tap a cell to set or clear an answer.
      </p>

      {users.length === 0 || shares.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Add {users.length === 0 ? 'at least one person' : 'at least one share'} to see the grid.
        </p>
      ) : (
        <div className="-mx-5 overflow-x-auto px-5 md:-mx-6 md:px-6">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 bg-transparent p-2 text-left text-xs font-medium text-muted-foreground">
                  Person
                </th>
                {shares.map((share) => (
                  <th key={share.id} className="p-2 text-left text-xs font-medium text-muted-foreground">
                    <span dir="auto" className="line-clamp-2 block max-w-[9rem]">{share.title}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t border-black/5 dark:border-white/5">
                  <td dir="auto" className="p-2 font-medium text-foreground">{user.name}</td>
                  {shares.map((share) => {
                    const vote = findVote(votes, user.id, share.id);
                    return (
                      <td key={share.id} className="p-2">
                        <div className="flex gap-1">
                          <CellButton
                            title={`${user.name}: helped by "${share.title}"`}
                            active={vote?.answer === 'helped'}
                            color={HELPED_COLOR}
                            onClick={() =>
                              vote?.answer === 'helped' ? clear(user.id, share.id) : set(user.id, share.id, 'helped')
                            }
                          >
                            <ThumbsUp className="h-3.5 w-3.5" />
                          </CellButton>
                          <CellButton
                            title={`${user.name}: not helped by "${share.title}"`}
                            active={vote?.answer === 'not-helped'}
                            color={NOT_HELPED_COLOR}
                            onClick={() =>
                              vote?.answer === 'not-helped'
                                ? clear(user.id, share.id)
                                : set(user.id, share.id, 'not-helped')
                            }
                          >
                            <ThumbsDown className="h-3.5 w-3.5" />
                          </CellButton>
                          {!vote && <Minus className="h-3.5 w-3.5 self-center text-muted-foreground" aria-label="No vote" />}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Small shared controls                                                     */
/* -------------------------------------------------------------------------- */

function IconButton({
  title,
  onClick,
  children,
  destructive,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`rounded-full p-2 text-muted-foreground transition-colors ${
        destructive ? 'hover:bg-destructive/10 hover:text-destructive' : 'hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10'
      }`}
    >
      {children}
    </button>
  );
}

function CellButton({
  title,
  active,
  color,
  onClick,
  children,
}: {
  title: string;
  active: boolean;
  color: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      className="rounded-lg border p-1.5 transition-colors"
      style={{
        borderColor: active ? color : 'rgba(127,127,127,0.25)',
        backgroundColor: active ? `${color}24` : 'transparent',
        color: active ? color : undefined,
      }}
    >
      {children}
    </button>
  );
}
