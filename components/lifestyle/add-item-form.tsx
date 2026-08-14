'use client';

/**
 * Something of your own, added to the catalogue.
 *
 * The catalogue is content rather than data — it cannot be edited, and that is
 * the point of it — so this is the one way the list grows. What comes in is
 * yours: the tier is your judgement rather than the page's, and the item sits
 * under its group after everything the page shipped with.
 *
 * `addItem` refuses three things silently (no name, a name already on the list,
 * the fortieth item) and returns null for all of them. Saying which one it was
 * is this form's job — a button that appears to do nothing reads as broken.
 */

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import {
  ITEM_NAME_MAX_LENGTH,
  ITEM_WHAT_MAX_LENGTH,
  MAX_CUSTOM_ITEMS,
  NEED_LABEL,
  CareGroup,
  CareItem,
  Need,
  addItem,
  sameName,
} from '@/lib/self-care';
import {
  MUTED,
  SOLID,
  fieldClass,
  primaryButtonClass,
  quietButtonClass,
} from '@/components/finance/shared';

/** The three tiers somebody can file their own item under. */
const OWN_NEEDS: readonly Need[] = ['essential', 'helpful', 'optional'];

export function AddItemForm({
  items,
  groups,
  customCount,
  onDone,
}: {
  /** Everything already on the list, so a duplicate is caught before the write. */
  items: CareItem[];
  /**
   * The groups this page reads. Offering all seven would let somebody file a
   * moisturiser from the Lifestyle page and then never find it again — the
   * item would be real, stored and on the other page entirely.
   */
  groups: readonly { id: CareGroup; label: string }[];
  customCount: number;
  onDone: () => void;
}) {
  const [name, setName] = useState('');
  const [group, setGroup] = useState<CareGroup>(groups[0].id);
  const [need, setNeed] = useState<Need>('helpful');
  const [what, setWhat] = useState('');
  const [error, setError] = useState('');

  const full = customCount >= MAX_CUSTOM_ITEMS;

  function submit(event: React.FormEvent) {
    event.preventDefault();

    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give it a name first.');
      return;
    }

    if (items.some((item) => sameName(item.name, trimmed))) {
      setError('Something by that name is already on the list.');
      return;
    }

    if (full) {
      setError(`That is the ${MAX_CUSTOM_ITEMS} you can add. Remove one to make room.`);
      return;
    }

    if (!addItem({ name: trimmed, group, need, what })) {
      setError('That could not be added. Storage may be full or unavailable.');
      return;
    }

    onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={`mb-1 block text-xs font-medium ${SOLID}`} htmlFor="own-name">
            What it is
          </label>
          <input
            id="own-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setError('');
            }}
            maxLength={ITEM_NAME_MAX_LENGTH}
            dir="auto"
            placeholder="The cream, the habit, the thing you swear by"
            className={fieldClass}
          />
        </div>

        <div>
          <label className={`mb-1 block text-xs font-medium ${SOLID}`} htmlFor="own-group">
            Where it belongs
          </label>
          <select
            id="own-group"
            value={group}
            onChange={(event) => setGroup(event.target.value as CareGroup)}
            className={fieldClass}
          >
            {groups.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={`mb-1 block text-xs font-medium ${SOLID}`} htmlFor="own-need">
            How needed it is
          </label>
          <select
            id="own-need"
            value={need}
            onChange={(event) => setNeed(event.target.value as Need)}
            className={fieldClass}
          >
            {OWN_NEEDS.map((tier) => (
              <option key={tier} value={tier}>
                {NEED_LABEL[tier]}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className={`mb-1 block text-xs font-medium ${SOLID}`} htmlFor="own-what">
            What it does <span className={MUTED}>— optional</span>
          </label>
          <input
            id="own-what"
            value={what}
            onChange={(event) => setWhat(event.target.value)}
            maxLength={ITEM_WHAT_MAX_LENGTH}
            dir="auto"
            placeholder="In one line, the way the rest of the list is written"
            className={fieldClass}
          />
        </div>
      </div>

      {error && (
        <p className="text-xs text-[#BE123C] dark:text-[#FDA4AF]" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className={primaryButtonClass}>
          <Plus className="h-4 w-4" />
          Add it
        </button>

        <button type="button" onClick={onDone} className={`${quietButtonClass} ${SOLID}`}>
          <X className="h-3.5 w-3.5" />
          Cancel
        </button>

        <span className={`text-xs ${MUTED}`}>
          {customCount} of {MAX_CUSTOM_ITEMS} of your own
        </span>
      </div>
    </form>
  );
}
