'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, ChevronLeft, ChevronRight, Plus, Trash2, Pencil, Check, Clock, CalendarDays } from 'lucide-react';
import {
  CalendarEvent,
  NOTE_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  WEEKDAY_LABELS,
  addEvent,
  deleteEvent,
  formatDayTitle,
  formatMonthTitle,
  fromDateKey,
  monthGrid,
  toDateKey,
  updateEvent,
} from '@/lib/calendar';
import { useCalendar } from '@/lib/use-calendar';
import { RoutinesSection } from '@/components/calendar/routines-section';
import { ACCENT, IconButton, cardClass, fieldClass } from '@/components/calendar/shared';

/**
 * Events are indigo rather than the pink accent: pink text on a pink tint came
 * out at 2.3:1, and these labels are 10px. A deep indigo on light and a pale one
 * on dark both clear the 4.5:1 minimum comfortably.
 */
const EVENT_CHIP_CLASS =
  'bg-[rgba(99,102,241,0.14)] text-[#312E81] dark:bg-[rgba(129,140,248,0.2)] dark:text-[#C7D2FE]';
const EVENT_TIME_CLASS = 'text-[#4338CA] dark:text-[#A5B4FC]';

export default function CalendarPage() {
  const { byDate, hydrated } = useCalendar();

  // `today` is only read on the client, so the server and the first render agree.
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selected, setSelected] = useState<string>(() => toDateKey(new Date()));

  const todayKey = hydrated ? toDateKey(new Date()) : '';
  const days = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor]);

  const goToMonth = useCallback((delta: number) => {
    setCursor((prev) => {
      const next = new Date(prev.year, prev.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  }, []);

  const goToToday = useCallback(() => {
    const now = new Date();
    setCursor({ year: now.getFullYear(), month: now.getMonth() });
    setSelected(toDateKey(now));
  }, []);

  /**
   * Picking a day from a routine calendar brings the month above along with it,
   * so the page never shows August at the top while September is selected.
   */
  const selectDay = useCallback((key: string) => {
    setSelected(key);
    const date = fromDateKey(key);
    setCursor({ year: date.getFullYear(), month: date.getMonth() });
  }, []);

  const selectedEvents = byDate.get(selected) ?? [];

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#FFF5F8] via-background to-background dark:from-[#1C1C1E] dark:via-[#1C1C1E] dark:to-[#1C1C1E]">
      <div className="container mx-auto max-w-4xl px-4 pt-24 md:px-6 md:pt-28">
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
          <h1 className="mb-3 text-3xl font-bold text-foreground md:text-4xl lg:text-5xl">Calendar</h1>
          <p className="max-w-2xl text-base text-muted-foreground md:text-lg">
            Pick a day and add what is happening. Everything stays in this browser.
          </p>
        </motion.header>

        {/* Month */}
        <section className={`${cardClass} mb-6`}>
          {/* Month name and its controls sit together on the left, lined up with
              the grid below rather than split across the width of the card. */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground md:text-xl">
              {formatMonthTitle(cursor.year, cursor.month)}
            </h2>
            <div className="flex items-center gap-1">
              <IconButton title="Previous month" onClick={() => goToMonth(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </IconButton>
              <IconButton title="Next month" onClick={() => goToMonth(1)}>
                <ChevronRight className="h-4 w-4" />
              </IconButton>
            </div>
            <button
              type="button"
              onClick={goToToday}
              className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-[#FF4D8E]/40 dark:border-white/10"
            >
              Today
            </button>
          </div>

          {/* Weekday header */}
          {/* Padding and the 20px box match the day number below, so each label
              sits directly over the numbers in its column. */}
          <div dir="ltr" className="mb-1 grid grid-cols-7 gap-1">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className="px-1.5 py-1 text-xs font-medium text-muted-foreground">
                <span className="inline-flex w-5 justify-center">{label}</span>
              </div>
            ))}
          </div>

          {/* Days */}
          <div dir="ltr" className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const key = toDateKey(day);
              const inMonth = day.getMonth() === cursor.month;
              const dayEvents = byDate.get(key) ?? [];
              const isSelected = key === selected;
              const isToday = key === todayKey;

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelected(key)}
                  aria-label={`${formatDayTitle(key)}${dayEvents.length ? `, ${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}` : ''}`}
                  aria-pressed={isSelected}
                  className={`flex min-h-16 flex-col rounded-lg border p-1.5 text-left transition-colors md:min-h-24 ${
                    inMonth ? 'text-foreground' : 'text-muted-foreground/50'
                  } ${isSelected ? '' : 'border-transparent hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'}`}
                  style={
                    isSelected
                      ? { borderColor: ACCENT, backgroundColor: `${ACCENT}14` }
                      : undefined
                  }
                >
                  <span
                    className={`mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                      isToday ? 'font-semibold text-white' : 'font-medium'
                    }`}
                    style={isToday ? { backgroundColor: ACCENT } : undefined}
                  >
                    {day.getDate()}
                  </span>

                  <span className="flex flex-col gap-0.5 overflow-hidden">
                    {dayEvents.slice(0, 2).map((event) => (
                      <span
                        key={event.id}
                        dir="auto"
                        className={`truncate rounded px-1 py-0.5 text-[10px] leading-tight md:text-xs ${EVENT_CHIP_CLASS}`}
                      >
                        {event.time && <span className="tabular-nums">{event.time} </span>}
                        {event.title}
                      </span>
                    ))}
                    {dayEvents.length > 2 && (
                      <span className="px-1 text-[10px] text-muted-foreground md:text-xs">
                        +{dayEvents.length - 2} more
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Selected day */}
        <section className={`${cardClass} mb-6`}>
          <div className="mb-4 flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-[#FF4D8E]" />
            <h2 dir="auto" className="text-lg font-semibold text-foreground md:text-xl">
              {formatDayTitle(selected)}
            </h2>
          </div>

          <NewEventForm date={selected} />

          {!hydrated ? (
            <div className="mt-4 h-16 animate-pulse rounded-xl bg-foreground/5" aria-hidden />
          ) : selectedEvents.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">Nothing on this day yet.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {selectedEvents.map((event) => (
                <EventRow key={event.id} event={event} />
              ))}
            </ul>
          )}
        </section>

        <RoutinesSection selected={selected} onSelect={selectDay} />
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/*  Adding                                                                    */
/* -------------------------------------------------------------------------- */

function NewEventForm({ date }: { date: string }) {
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleAdd = useCallback(() => {
    const created = addEvent({ date, title, time, note });
    if (!created) {
      setError('Give the event a name first.');
      return;
    }

    setTitle('');
    setTime('');
    setNote('');
    setError(null);
  }, [date, note, time, title]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAdd();
            }
          }}
          dir="auto"
          maxLength={TITLE_MAX_LENGTH}
          placeholder="What is happening?"
          aria-label="Event name"
          className={fieldClass}
        />
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          aria-label="Event time"
          className={`${fieldClass} sm:w-36`}
        />
        <button
          type="button"
          onClick={handleAdd}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#FF4D8E] px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-[#FF4D8E]/25 transition-colors hover:bg-[#FF4D8E]/90"
        >
          <Plus className="h-4 w-4" />
          Add
        </button>
      </div>

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        dir="auto"
        maxLength={NOTE_MAX_LENGTH}
        placeholder="A note (optional)"
        aria-label="Event note"
        className={fieldClass}
      />

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  One event                                                                 */
/* -------------------------------------------------------------------------- */

function EventRow({ event }: { event: CalendarEvent }) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(event.title);
  const [draftTime, setDraftTime] = useState(event.time);
  const [draftNote, setDraftNote] = useState(event.note);

  const startEditing = useCallback(() => {
    setDraftTitle(event.title);
    setDraftTime(event.time);
    setDraftNote(event.note);
    setEditing(true);
  }, [event]);

  const save = useCallback(() => {
    if (updateEvent(event.id, { title: draftTitle, time: draftTime, note: draftNote })) setEditing(false);
  }, [draftNote, draftTime, draftTitle, event.id]);

  const handleDelete = useCallback(() => {
    if (!window.confirm(`Remove "${event.title}"?`)) return;
    deleteEvent(event.id);
  }, [event.id, event.title]);

  if (editing) {
    return (
      <li className="rounded-xl bg-black/[0.03] p-3 dark:bg-white/[0.04]">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            dir="auto"
            autoFocus
            maxLength={TITLE_MAX_LENGTH}
            aria-label={`Rename ${event.title}`}
            className={fieldClass}
          />
          <input
            type="time"
            value={draftTime}
            onChange={(e) => setDraftTime(e.target.value)}
            aria-label={`Time for ${event.title}`}
            className={`${fieldClass} sm:w-36`}
          />
        </div>
        <input
          value={draftNote}
          onChange={(e) => setDraftNote(e.target.value)}
          dir="auto"
          maxLength={NOTE_MAX_LENGTH}
          placeholder="A note (optional)"
          aria-label={`Note for ${event.title}`}
          className={`${fieldClass} mt-2`}
        />
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={save}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#FF4D8E] px-4 py-1.5 text-xs font-medium text-white hover:bg-[#FF4D8E]/90"
          >
            <Check className="h-3.5 w-3.5" />
            Save
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10"
          >
            Cancel
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-start justify-between gap-3 rounded-xl bg-black/[0.03] p-3 dark:bg-white/[0.04]">
      {/* Fills the row, so a Hebrew title lands against the right edge instead of
          being right-aligned inside a box only as wide as its own words. */}
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2">
          {event.time ? (
            <span className={`inline-flex items-center gap-1 text-xs tabular-nums ${EVENT_TIME_CLASS}`}>
              <Clock className="h-3 w-3" />
              {event.time}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">All day</span>
          )}
          {/* Takes the rest of the row so the title sits against its far edge —
              left for English, right for Hebrew — rather than packing up against
              the time chip whichever language it is in. */}
          <span dir="auto" className="min-w-0 flex-1 truncate text-start text-sm font-medium text-foreground">
            {event.title}
          </span>
        </p>
        {event.note && (
          <p dir="auto" className="mt-1 text-xs text-muted-foreground">
            {event.note}
          </p>
        )}
      </div>

      <span className="flex shrink-0 gap-1">
        <IconButton title={`Edit ${event.title}`} onClick={startEditing}>
          <Pencil className="h-4 w-4" />
        </IconButton>
        <IconButton title={`Remove ${event.title}`} destructive onClick={handleDelete}>
          <Trash2 className="h-4 w-4" />
        </IconButton>
      </span>
    </li>
  );
}
