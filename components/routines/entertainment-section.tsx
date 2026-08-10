'use client';

/**
 * What is on this week. A show sits on a weekday, at a time if there is one, and
 * carries the episode still to come; marking it watched moves it on to the next
 * one and the weekday takes it into next week by itself.
 */

import { useCallback, useState } from 'react';
import { Check, Pencil, Plus, Trash2, Tv } from 'lucide-react';
import { WEEKDAY_LABELS } from '@/lib/calendar';
import {
  MAX_EPISODE,
  MAX_SEASON,
  SHOW_NOTE_MAX_LENGTH,
  SHOW_TITLE_MAX_LENGTH,
  Show,
  ShowInput,
  addShow,
  airingLabel,
  daysUntil,
  deleteShow,
  describeEpisode,
  describeSlot,
  markWatched,
  updateShow,
} from '@/lib/entertainment';
import { useShows } from '@/lib/use-entertainment';
import {
  RegionHeader,
  SmallButton,
  cardClass,
  factClass,
  fieldClass,
  inlineFieldClass,
  timeFieldClass,
} from '@/components/routines/shared';

const pillClass = (picked: boolean) =>
  `rounded-lg py-1.5 text-xs font-medium transition-colors ${
    picked ? 'bg-[#FF4D8E] text-white' : 'bg-black/[0.04] text-muted-foreground hover:text-foreground dark:bg-white/[0.06]'
  }`;

/**
 * Tonight is the one worth catching the eye, tomorrow is worth noticing, and
 * anything further off is just a fact. Each pair clears 4.5:1 in both themes.
 */
function airingClass(days: number): string {
  if (days === 0) return 'bg-[rgba(245,158,11,0.2)] text-[#92400E] dark:bg-[rgba(251,191,36,0.2)] dark:text-[#FCD34D]';
  if (days === 1) return 'bg-[rgba(99,102,241,0.14)] text-[#312E81] dark:bg-[rgba(129,140,248,0.2)] dark:text-[#C7D2FE]';
  return 'bg-black/[0.06] text-foreground/70 dark:bg-white/10';
}

/* -------------------------------------------------------------------------- */
/*  The form, which adding and editing both use                               */
/* -------------------------------------------------------------------------- */

function ShowForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  /** The show being changed, or nothing at all when one is being added. */
  initial?: Show;
  submitLabel: string;
  /** True when it took, which is what clears the form. */
  onSubmit: (input: ShowInput) => boolean;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [day, setDay] = useState(initial?.day ?? new Date().getDay());
  const [time, setTime] = useState(initial?.time ?? '');
  const [season, setSeason] = useState(String(initial?.season ?? 1));
  const [episode, setEpisode] = useState(String(initial?.episode ?? 1));
  const [note, setNote] = useState(initial?.note ?? '');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(() => {
    const asNumber = (value: string, fallback: number) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };

    const done = onSubmit({
      title,
      day,
      time,
      season: asNumber(season, 1),
      episode: asNumber(episode, 1),
      note,
    });

    if (!done) {
      setError(title.trim() ? 'That is as many shows as this holds.' : 'Give the show a name first.');
      return;
    }

    // An edit closes itself; the add form stays open for the next one.
    if (!initial) {
      setTitle('');
      setTime('');
      setSeason('1');
      setEpisode('1');
      setNote('');
    }
    setError(null);
  }, [day, episode, initial, note, onSubmit, season, time, title]);

  return (
    <div className="space-y-2">
      <input
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          if (error) setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleSubmit();
          }
        }}
        dir="auto"
        autoFocus
        maxLength={SHOW_TITLE_MAX_LENGTH}
        placeholder="Which show?"
        aria-label="Show name"
        className={fieldClass}
      />

      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">Which day a new episode lands</p>
        <div dir="ltr" className="grid grid-cols-7 gap-1">
          {WEEKDAY_LABELS.map((label, index) => (
            <button
              key={label}
              type="button"
              onClick={() => setDay(index)}
              aria-pressed={day === index}
              aria-label={label}
              className={pillClass(day === index)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          At
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            aria-label="Time the episode comes out"
            className={`${timeFieldClass} px-3 py-1.5`}
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Season
          <input
            type="number"
            min={1}
            max={MAX_SEASON}
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            aria-label="Season number"
            className={`${inlineFieldClass} w-16 px-3 py-1.5`}
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Episode
          <input
            type="number"
            min={1}
            max={MAX_EPISODE}
            value={episode}
            onChange={(e) => setEpisode(e.target.value)}
            aria-label="The episode still to come"
            className={`${inlineFieldClass} w-20 px-3 py-1.5`}
          />
        </label>
      </div>

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        dir="auto"
        maxLength={SHOW_NOTE_MAX_LENGTH}
        placeholder="Where it is on (optional)"
        aria-label="Where the show is on"
        className={fieldClass}
      />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#FF4D8E] px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#FF4D8E]/90"
        >
          <Plus className="h-3.5 w-3.5" />
          {submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10"
          >
            Cancel
          </button>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  One show                                                                  */
/* -------------------------------------------------------------------------- */

function ShowRow({ show, today }: { show: Show; today: Date }) {
  const [editing, setEditing] = useState(false);
  const days = daysUntil(show, today);
  const episode = describeEpisode(show);

  const handleSave = useCallback(
    (input: ShowInput) => {
      const saved = updateShow(show.id, input);
      if (saved) setEditing(false);
      return saved;
    },
    [show.id]
  );

  const handleDelete = useCallback(() => {
    if (!window.confirm(`Remove "${show.title}"?`)) return;
    deleteShow(show.id);
  }, [show.id, show.title]);

  if (editing) {
    return (
      <li className="rounded-xl bg-black/[0.03] p-3 dark:bg-white/[0.04]">
        <ShowForm initial={show} submitLabel="Save" onSubmit={handleSave} onCancel={() => setEditing(false)} />
      </li>
    );
  }

  return (
    <li className="flex items-start gap-2 rounded-xl bg-black/[0.03] p-3 dark:bg-white/[0.04]">
      <div className="min-w-0 flex-1">
        <p dir="auto" className="truncate text-sm font-medium text-foreground">
          {show.title}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className={factClass}>{episode}</span>
          <span className="tabular-nums">{describeSlot(show)}</span>
          {show.note && (
            <span dir="auto" className="truncate">
              · {show.note}
            </span>
          )}
        </p>
      </div>

      <span className="flex shrink-0 items-center gap-1">
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${airingClass(days)}`}>{airingLabel(days)}</span>
        <SmallButton
          title={`Watched ${episode} of ${show.title} — on to E${show.episode + 1}`}
          onClick={() => markWatched(show.id)}
        >
          <Check className="h-3.5 w-3.5" />
        </SmallButton>
        <SmallButton title={`Edit ${show.title}`} onClick={() => setEditing(true)}>
          <Pencil className="h-3.5 w-3.5" />
        </SmallButton>
        <SmallButton title={`Remove ${show.title}`} destructive onClick={handleDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </SmallButton>
      </span>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/*  The section                                                               */
/* -------------------------------------------------------------------------- */

export function EntertainmentSection() {
  const { shows, hydrated } = useShows();
  const [adding, setAdding] = useState(false);

  if (!hydrated) {
    return (
      <section className={`${cardClass} mb-10`}>
        <div className="h-6 w-32 animate-pulse rounded bg-foreground/10" aria-hidden />
        <div className="mt-4 h-16 animate-pulse rounded-xl bg-foreground/5" aria-hidden />
      </section>
    );
  }

  // Read once for the whole list, so two shows cannot land on different todays.
  const today = new Date();

  return (
    <section className={`${cardClass} mb-10`}>
      <RegionHeader
        icon={<Tv className="h-5 w-5 text-[#FF4D8E]" />}
        title="Watching"
        subtitle="What is on this week"
        aside={
          shows.length > 0 ? (
            <span className={factClass}>
              {shows.length} show{shows.length === 1 ? '' : 's'}
            </span>
          ) : null
        }
      />

      {shows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No shows yet — the one dropping a new episode every Thursday would go here.
        </p>
      ) : (
        <ul className="space-y-2">
          {shows.map((show) => (
            <ShowRow key={show.id} show={show} today={today} />
          ))}
        </ul>
      )}

      <div className="mt-4 border-t border-black/[0.06] pt-4 dark:border-white/[0.08]">
        <button
          type="button"
          onClick={() => setAdding((prev) => !prev)}
          aria-expanded={adding}
          className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
        >
          <Plus className="h-3.5 w-3.5" />
          {adding ? 'Hide' : 'Add a show'}
        </button>

        {adding && (
          <div className="mt-3">
            <ShowForm submitLabel="Add" onSubmit={(input) => addShow(input) !== null} />
          </div>
        )}
      </div>
    </section>
  );
}
