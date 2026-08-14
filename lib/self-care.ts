/**
 * Presentation: what actually changes how you look and how you come across —
 * and what only sells.
 *
 * This is the one feature whose **content is in the code rather than in
 * storage**. The catalogue below — the creams, the sleep, the supplements — is
 * a constant, not a seed. `lib/blog.ts` seeds a browser once and is thereafter
 * unreachable, which means correcting a post there corrects nothing for anybody
 * who has already visited; here the whole point is the advice, so it has to be
 * able to change. Editing an entry below reaches every browser on the next load.
 *
 * What *is* stored is only what the catalogue cannot know: whether you have the
 * thing, whether you actually use it, a line of your own about it, anything you
 * added that is not on the list, and the one number the strength maths needs.
 * Three keys, the same shape as finance's three.
 *
 * A consequence worth knowing: an item taken out of the catalogue leaves its
 * ticks behind under an id nothing points at. `readState` drops those on the way
 * out rather than storing a sweep, since a stale tick costs a few bytes and a
 * migration costs a bug.
 *
 * The tiers are the answer to the question this page exists for. **Really
 * needed** is the short list — the things with enough evidence behind them that
 * skipping one is a decision. **Skip it** is on the list on purpose: naming what
 * does nothing is half of saying what is needed, and a page that only lists good
 * things reads as an advert.
 *
 * Nothing here is medical advice and the page says so out loud. Like everything
 * else on this site it lives in localStorage only — one browser's copy, and no
 * server ever sees that somebody ticked a box.
 */

/* -------------------------------------------------------------------------- */
/*  The catalogue                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The seven places presentation is actually decided. Ordered as the pages draw
 * them: what is on you, then how you carry it, then the two things underneath
 * that everything else is downstream of.
 *
 * `style` and `presence` are the half of this that is free. They are in the same
 * catalogue as the creams rather than in a list of their own because they are
 * answering the same question — what is worth the effort — and a page that put
 * the products first and the posture in a footnote would have the ratio exactly
 * backwards.
 */
export type CareGroup = 'skin' | 'body' | 'teeth' | 'style' | 'presence' | 'sleep' | 'supplement';

/**
 * Which of the two pages a group is read on.
 *
 * One catalogue, one store, two doors into it. **Presentation** is what shows
 * from the outside and is judged in the first ten seconds — skin, teeth,
 * clothes, the way you stand. **Lifestyle** is the machinery under that: sleep,
 * what is swallowed, and what is eaten to get stronger. The split is a reading
 * order rather than a category — sleep belongs to both by rights, and it is
 * filed under the upkeep because that is where somebody goes looking for it.
 *
 * It lives on the group rather than on the item so a group can never be half on
 * one page, and so moving one is a single line here rather than a sweep.
 */
export type CarePage = 'presentation' | 'lifestyle';

export const CARE_GROUPS: readonly {
  id: CareGroup;
  label: string;
  note: string;
  page: CarePage;
}[] = [
  {
    id: 'skin',
    label: 'Face & skin',
    note: 'Three things do almost all of the work here. The rest is preference.',
    page: 'presentation',
  },
  {
    id: 'body',
    label: 'Body & hands',
    note: 'Dry skin is a barrier problem, and a barrier is repaired with grease and time.',
    page: 'presentation',
  },
  {
    id: 'teeth',
    label: 'Teeth',
    note: 'The cheapest health spending there is, and the only damage here that does not grow back.',
    page: 'presentation',
  },
  {
    id: 'style',
    label: 'Clothes & grooming',
    note: 'Almost none of this is money. Fit, upkeep and a small wardrobe that agrees with itself.',
    page: 'presentation',
  },
  {
    id: 'presence',
    label: 'Presence & people',
    note: 'The part that actually draws people, costs nothing, and is the hardest to buy your way out of.',
    page: 'presentation',
  },
  {
    id: 'sleep',
    label: 'Sleep',
    note: 'Mostly not a product. The two that matter are a dark cool room and a fixed wake-up time.',
    page: 'lifestyle',
  },
  {
    id: 'supplement',
    label: 'Supplements',
    note: 'A short list is real. The rest of the shelf is selling you food you already eat.',
    page: 'lifestyle',
  },
];

export function groupsOnPage(page: CarePage) {
  return CARE_GROUPS.filter((group) => group.page === page);
}

/**
 * Everything read on one page. Both pages tally, filter and count over this
 * rather than over the whole catalogue, or Presentation would open by telling
 * you that you are missing a vitamin.
 *
 * An item whose group is not on either page — only reachable by hand-editing
 * the store — falls out of both rather than being shown twice.
 */
export function itemsOnPage(items: readonly CareItem[], page: CarePage): CareItem[] {
  const groups = new Set(groupsOnPage(page).map((group) => group.id));
  return items.filter((item) => groups.has(item.group));
}

/**
 * How much an item is actually needed.
 *
 * `skip` is not a lesser tier — it is the other half of the answer, and those
 * items carry no ticks at all: they are there to be read once, not kept.
 */
export type Need = 'essential' | 'helpful' | 'optional' | 'skip';

export const NEED_LABEL: Record<Need, string> = {
  essential: 'Really needed',
  helpful: 'Worth having',
  optional: 'Only if you want it',
  skip: 'Skip it',
};

export interface CareItem {
  id: string;
  name: string;
  group: CareGroup;
  need: Need;
  /** What it does, in one sentence, without the marketing. */
  what: string;
  /** How it is actually used. Empty on the `skip` items — they are not. */
  how: string;
  /** The real reason to hesitate, where there is one. */
  caveat?: string;
  /**
   * A thing to *do* rather than a thing to own — posture, a caffeine cut-off,
   * asking the second question. It carries one tick instead of two: "have it"
   * and "use it" are the same question about standing up straight, and two
   * boxes that could only ever agree are one box drawn twice.
   *
   * Nothing about this is stored. It only decides what the ticks are called,
   * which is why an item can gain or lose it without anybody losing a tick.
   */
  practice?: boolean;
  /** True only for items somebody added themselves. */
  custom?: boolean;
}

/**
 * The list. Ids are hand-written and permanent: they are what the ticks are
 * filed under, so renaming an item keeps its ticks and changing its id loses
 * them. Custom items are prefixed `own-` and can therefore never collide with
 * an id added here later.
 */
export const CARE_CATALOGUE: readonly CareItem[] = [
  /* ---------------------------- Face & skin ------------------------------ */
  {
    id: 'sunscreen',
    name: 'Sunscreen, SPF 30+ broad spectrum',
    group: 'skin',
    need: 'essential',
    what: 'The single biggest difference to how skin ages, and the only one of these that also lowers a real cancer risk.',
    how: 'Every morning on the face, neck and the backs of the hands, whatever the weather. Roughly two fingers’ length for face and neck.',
    caveat: 'Under-applying is the usual failure: half the amount is far less than half the protection.',
  },
  {
    id: 'moisturiser',
    name: 'Plain moisturiser',
    group: 'skin',
    need: 'essential',
    what: 'Holds water in the skin and lets the barrier repair itself. Glycerin, ceramides or urea on the label is the whole active story.',
    how: 'On slightly damp skin after washing, morning and night.',
    caveat: 'Price tracks the packaging, not the effect. A supermarket tub with the same ingredients does the same job.',
  },
  {
    id: 'cleanser',
    name: 'A gentle cleanser',
    group: 'skin',
    need: 'essential',
    what: 'Takes off sunscreen, sweat and the day. That is the entire brief.',
    how: 'Once at night. In the morning water alone is enough for most skin.',
    caveat: 'If your face feels tight and squeaky afterwards, it is too strong — that feeling is a stripped barrier, not cleanliness.',
  },
  {
    id: 'retinoid',
    name: 'A retinoid (adapalene 0.1%)',
    group: 'skin',
    need: 'helpful',
    what: 'The only over-the-counter ingredient besides sunscreen with strong evidence for lines, texture and acne.',
    how: 'A pea for the whole face, at night, twice a week to begin with, working up as the skin tolerates it.',
    caveat: 'Flaking and redness for the first month are normal. Not while pregnant or trying to be.',
  },
  {
    id: 'lip-balm',
    name: 'Lip balm with SPF',
    group: 'skin',
    need: 'helpful',
    what: 'Lips have almost no barrier of their own and no sunscreen ever reaches them.',
    how: 'Whenever they feel dry, and before going out in sun or wind.',
  },
  {
    id: 'vitamin-c',
    name: 'Vitamin C serum',
    group: 'skin',
    need: 'optional',
    what: 'A modest evening-out of tone over months. Real, but small next to sunscreen.',
    how: 'Morning, before moisturiser.',
    caveat: 'Oxidises. If it has gone orange in the bottle it is doing nothing.',
  },
  {
    id: 'niacinamide',
    name: 'Niacinamide',
    group: 'skin',
    need: 'optional',
    what: 'Helps oiliness and redness a little. Cheap and hard to react to.',
    how: 'Either time of day, under moisturiser.',
  },
  {
    id: 'exfoliant',
    name: 'A chemical exfoliant (AHA or BHA)',
    group: 'skin',
    need: 'optional',
    what: 'Smooths texture and clears blocked pores.',
    how: 'Once or twice a week at most, on a night you are not using the retinoid.',
    caveat: 'The most over-used product there is. Daily use is how people end up with the raw skin they blame on everything else.',
  },
  {
    id: 'skin-skip',
    name: 'Toners, essences, sheet masks, pore minimisers',
    group: 'skin',
    need: 'skip',
    what: 'Pleasant, and that is the honest case for them. Nothing here changes skin in a way the three essentials have not already.',
    how: '',
  },
  {
    id: 'collagen-drink',
    name: 'Collagen drinks and powders',
    group: 'skin',
    need: 'skip',
    what: 'Collagen is digested into amino acids like any other protein. It does not travel to the face.',
    how: '',
  },

  /* ---------------------------- Body & hands ----------------------------- */
  {
    id: 'body-moisturiser',
    name: 'Body moisturiser or emollient',
    group: 'body',
    need: 'essential',
    what: 'The same barrier repair as the face, over a much larger area that gets ignored.',
    how: 'Straight out of the shower while the skin is still damp — that is what makes the difference.',
  },
  {
    id: 'gentle-wash',
    name: 'An unscented, gentle body wash',
    group: 'body',
    need: 'essential',
    what: 'Ordinary soap strips oils that take a day to come back. A mild wash does not.',
    how: 'Where it is needed rather than everywhere, and in water that is warm rather than hot.',
  },
  {
    id: 'deodorant',
    name: 'Deodorant or antiperspirant',
    group: 'body',
    need: 'essential',
    what: 'Deodorant handles the smell; antiperspirant handles the sweat. They are different products.',
    how: 'Antiperspirant works far better applied at night, on dry skin, than in the morning.',
  },
  {
    id: 'hand-cream',
    name: 'Hand cream',
    group: 'body',
    need: 'helpful',
    what: 'Hands are washed more than anything else and crack first in winter.',
    how: 'After washing, and by the bed.',
  },
  {
    id: 'foot-cream',
    name: 'Urea foot cream (10–25%)',
    group: 'body',
    need: 'optional',
    what: 'Urea at that strength genuinely softens cracked heels where a normal cream will not.',
    how: 'At night, thickly, under socks.',
  },

  /* -------------------------------- Teeth -------------------------------- */
  {
    id: 'fluoride-paste',
    name: 'Fluoride toothpaste, 1350–1500 ppm',
    group: 'teeth',
    need: 'essential',
    what: 'The one number on the tube that matters. Everything else on the box is flavour and marketing.',
    how: 'Twice a day, and spit rather than rinse — rinsing washes off the fluoride you just paid for.',
  },
  {
    id: 'floss',
    name: 'Floss or interdental brushes',
    group: 'teeth',
    need: 'essential',
    what: 'A brush cannot reach two of the five surfaces of a tooth, and those two are where the trouble starts.',
    how: 'Once a day. Interdental brushes are easier to keep up than floss for most people, which is what makes them better.',
  },
  {
    id: 'soft-brush',
    name: 'A soft-bristled or electric brush',
    group: 'teeth',
    need: 'helpful',
    what: 'Hard bristles wear enamel and pull gums back permanently. Electric mostly wins by making two minutes obvious.',
    how: 'Two minutes, gently, at the gum line.',
  },
  {
    id: 'mouthwash',
    name: 'Mouthwash',
    group: 'teeth',
    need: 'optional',
    what: 'Fine for breath. It does not replace either of the two above.',
    how: 'At a different time of day from brushing, so it is not rinsing the fluoride away.',
  },
  {
    id: 'whitening',
    name: 'Whitening toothpastes and charcoal',
    group: 'teeth',
    need: 'skip',
    what: 'Abrasives that scrub surface stain and, given long enough, enamel with it. Enamel does not grow back.',
    how: '',
  },

  /* --------------------------- Clothes & grooming ------------------------ */
  {
    id: 'fit',
    name: 'Clothes that actually fit',
    group: 'style',
    need: 'essential',
    what: 'The whole of looking well dressed, and the one thing price cannot buy — a cheap shirt that fits beats an expensive one that does not, every time.',
    how: 'Shoulder seams landing on the shoulder bone, sleeves ending at the wrist bone, trousers breaking once. A tailor charges less than most shirts to move the rest.',
    caveat: 'Buying a size that fits the widest part of you and hoping is how most wardrobes go wrong.',
  },
  {
    id: 'haircut',
    name: 'A haircut on a schedule',
    group: 'style',
    need: 'essential',
    practice: true,
    what: 'A cut three weeks past due is the most common reason somebody looks tired in a photograph and cannot say why.',
    how: 'Book the next one on the way out, every four to six weeks depending on the cut. Learn the two or three words your barber needs rather than showing a photograph each time.',
  },
  {
    id: 'edges',
    name: 'The edges: nails, neckline, brows, nose',
    group: 'style',
    need: 'essential',
    practice: true,
    what: 'Nobody notices these done and everybody notices them undone, which makes them the cheapest points on the board.',
    how: 'Nails short and filed once a week; the neck and the brow line whenever the hair is cut; a trimmer for the rest.',
  },
  {
    id: 'clean-clothes',
    name: 'Clothes actually clean and unwrinkled',
    group: 'style',
    need: 'essential',
    practice: true,
    what: 'Fabric holds smell and creases long after it looks fine on the chair. This is the half of grooming that happens away from the body.',
    how: 'Wash before it smells rather than after; hang things straight out of the machine; a steamer takes two minutes and no board.',
  },
  {
    id: 'shoes',
    name: 'Shoes that are clean and not worn out',
    group: 'style',
    need: 'helpful',
    what: 'The one item people are unfairly quick to read a whole person from, and the one most often left five years past its end.',
    how: 'Wipe them when you wipe anything; replace the heels rather than the shoe; two decent pairs beat six tired ones.',
  },
  {
    id: 'palette',
    name: 'A small wardrobe that agrees with itself',
    group: 'style',
    need: 'helpful',
    what: 'Getting dressed well is mostly a maths problem: fewer pieces in colours that all go together means every combination works.',
    how: 'Pick two neutrals and one colour. Anything that goes with nothing already in the wardrobe is not a bargain.',
  },
  {
    id: 'posture-clothes',
    name: 'One outfit you know is right',
    group: 'style',
    need: 'helpful',
    what: 'Knowing you look right is most of what people read as confidence, and it is easier to own one such outfit than to be sure every day.',
    how: 'Assemble it once, in daylight, and keep it ready. It is what the short-notice invitation is for.',
  },
  {
    id: 'fragrance',
    name: 'Fragrance, applied lightly',
    group: 'style',
    need: 'optional',
    what: 'Genuinely noticed at conversational distance, and the easiest thing on this page to overdo past the point of being a problem.',
    how: 'Two sprays, on skin, after the shower. It is meant for somebody standing close, not for the room.',
    caveat: 'You stop smelling your own within minutes, which is exactly why people over-apply. Ask somebody once.',
  },
  {
    id: 'style-skip',
    name: 'Logos, designer labels and a bigger wardrobe',
    group: 'style',
    need: 'skip',
    what: 'None of it fixes fit, and fit is what was wrong. Buying more clothes is the usual way of avoiding the tailor.',
    how: '',
  },

  /* --------------------------- Presence & people -------------------------- */
  {
    id: 'posture',
    name: 'Standing and sitting up straight',
    group: 'presence',
    need: 'essential',
    practice: true,
    what: 'Changes the silhouette more than any garment does, costs nothing, and is read as confidence before a word is said.',
    how: 'Chest open, shoulders back and down, chin level. The desk is where it is actually lost — set the screen at eye height and the problem mostly solves itself.',
  },
  {
    id: 'eye-contact',
    name: 'Eye contact and a real smile',
    group: 'presence',
    need: 'essential',
    practice: true,
    what: 'The two signals people decide warmth from, and warmth is what makes somebody approachable rather than merely impressive.',
    how: 'Hold it while they are speaking rather than while you are. A smile that reaches the eyes takes a second longer to arrive than a polite one and is read as the real thing.',
  },
  {
    id: 'second-question',
    name: 'Asking the second question',
    group: 'presence',
    need: 'essential',
    practice: true,
    what: 'The most reliable way to be found interesting is to be interested, and the first question is politeness — the second one is attention.',
    how: 'Follow what they actually said rather than moving to your next topic. "What made you pick that?" does most of the work.',
  },
  {
    id: 'phone-away',
    name: 'The phone out of sight in company',
    group: 'presence',
    need: 'essential',
    practice: true,
    what: 'A phone face-up on the table measurably lowers how warm and how attentive the person across it is judged to be — even face-down, even untouched.',
    how: 'Pocket or bag. If something genuinely has to be watched for, say so out loud rather than glancing.',
  },
  {
    id: 'names',
    name: 'Names, and what people told you last time',
    group: 'presence',
    need: 'helpful',
    practice: true,
    what: 'Being remembered is rare enough that doing it deliberately stands out badly in your favour.',
    how: 'Say the name back within the first minute. Write the one detail down afterwards — nobody has ever been offended to be asked about it a month later.',
  },
  {
    id: 'voice',
    name: 'Slower, lower, and finishing the sentence',
    group: 'presence',
    need: 'helpful',
    practice: true,
    what: 'Pace and pitch are read as composure. Trailing off at the end of a sentence undoes a well-made point.',
    how: 'Half a beat of pause before answering, and land the last three words rather than letting them fade.',
  },
  {
    id: 'invite',
    name: 'Being the one who suggests the plan',
    group: 'presence',
    need: 'helpful',
    practice: true,
    what: 'Nearly everybody waits to be invited, so the person who does the inviting ends up at the middle of things by default.',
    how: 'A specific day and a specific thing. "We should do something" gets agreement and no date; "Thursday, that place?" gets an answer.',
  },
  {
    id: 'hygiene-social',
    name: 'Breath, and knowing how you smell',
    group: 'presence',
    need: 'helpful',
    practice: true,
    what: 'The one thing nobody will tell you and everybody notices at the distance a conversation happens at.',
    how: 'Water, and the teeth section above — persistent bad breath is usually gums rather than food. Antiperspirant at night, per the body section.',
  },
  {
    id: 'small-talk',
    name: 'A few things to open with',
    group: 'presence',
    need: 'optional',
    practice: true,
    what: 'Not a script. Having two or three things ready is what stops the first thirty seconds going badly, and after that a conversation carries itself.',
    how: 'Something about where you both are, something you are genuinely enjoying at the moment, and a question.',
  },
  {
    id: 'lines-skip',
    name: 'Lines, routines and negging',
    group: 'presence',
    need: 'skip',
    what: 'A way of talking at people rather than to them. It reads as rehearsed because it is, and the ordinary version above outperforms all of it.',
    how: '',
  },
  {
    id: 'status-props',
    name: 'Renting the lifestyle for the photographs',
    group: 'presence',
    need: 'skip',
    what: 'The borrowed car and the hired watch are read correctly by almost everybody, and they cost the money that a tailor and a barber would have used properly.',
    how: '',
  },

  /* -------------------------------- Sleep -------------------------------- */
  {
    id: 'fixed-wake',
    name: 'A fixed wake-up time',
    group: 'sleep',
    need: 'essential',
    practice: true,
    what: 'Not a product, and the most effective thing on this page. The wake time sets the clock; the bedtime follows it.',
    how: 'The same time every day, weekends included, within about half an hour.',
  },
  {
    id: 'dark-cool-room',
    name: 'A dark, cool room',
    group: 'sleep',
    need: 'essential',
    what: 'Body temperature has to fall to fall asleep, and light is the signal that stops it. Around 18–19°C is the usual advice.',
    how: 'Blackout curtains or an eye mask, and a window or a fan rather than a warmer duvet.',
  },
  {
    id: 'caffeine-cutoff',
    name: 'A caffeine cut-off',
    group: 'sleep',
    need: 'essential',
    practice: true,
    what: 'Caffeine has a half-life of about five hours, so an afternoon coffee is still a quarter present at midnight.',
    how: 'Nothing after roughly eight hours before bed. Alcohol is the other one — it starts sleep and then wrecks its second half.',
  },
  {
    id: 'mattress-pillow',
    name: 'A mattress and pillow that suit you',
    group: 'sleep',
    need: 'essential',
    what: 'A third of a life is spent on it, and neck pain that no cream fixes is usually a pillow of the wrong height.',
    how: 'The pillow should keep the neck level with the spine in whichever position you actually sleep in.',
  },
  {
    id: 'earplugs',
    name: 'Earplugs',
    group: 'sleep',
    need: 'helpful',
    what: 'Noise fragments sleep without waking you, so the damage does not show up as a memory of being woken.',
    how: 'Foam ones, rolled thin and held in until they expand.',
  },
  {
    id: 'melatonin',
    name: 'Melatonin, 0.5–1 mg',
    group: 'sleep',
    need: 'optional',
    // No markers in these strings: the catalogue is drawn as plain text, not as
    // the rich text a table cell holds, so a `*when*` here reaches the screen
    // with its asterisks on.
    what: 'Shifts the hour you get sleepy rather than how well you stay asleep. Good for jet lag or a schedule that has slid.',
    how: 'A small dose a few hours before the bedtime you are aiming at, not at it.',
    caveat: 'The 5–10 mg tablets sold everywhere are far past the useful dose. Prescription-only in some countries, including Israel.',
  },
  {
    id: 'magnesium',
    name: 'Magnesium for sleep',
    group: 'sleep',
    need: 'optional',
    what: 'Worth a try if your diet is short of it. The evidence is thin and the effect, where it exists, is small.',
    how: 'Glycinate or citrate in the evening.',
  },
  {
    id: 'blue-light-glasses',
    name: 'Blue-light glasses',
    group: 'sleep',
    need: 'skip',
    what: 'Trials keep coming back flat. Putting the phone down works; the glasses are a way of not having to.',
    how: '',
  },

  /* ----------------------------- Supplements ----------------------------- */
  {
    id: 'vitamin-d',
    name: 'Vitamin D3',
    group: 'supplement',
    need: 'essential',
    what: 'The one deficiency that is genuinely common in people who work indoors, and it does not come from food in any useful amount.',
    how: 'Typically 1000–2000 IU a day through the darker months, with a meal that has fat in it.',
    caveat: 'A blood test settles it in one go and is worth more than guessing.',
  },
  {
    id: 'creatine',
    name: 'Creatine monohydrate',
    group: 'supplement',
    need: 'helpful',
    what: 'The most tested sports supplement there is, and the only one with a clear effect on strength and muscle.',
    how: '3–5 g a day, any time, forever. No loading phase needed and no cycling off.',
    caveat: 'Plain monohydrate. The expensive forms have never beaten it in a trial.',
  },
  {
    id: 'protein-powder',
    name: 'Protein powder',
    group: 'supplement',
    need: 'helpful',
    what: 'Food in a tub, and useful for exactly that reason — it closes the daily gap when the gap is real.',
    how: 'One scoop is about 24 g of protein. Use it to hit the target below, not in addition to it.',
    caveat: 'Nothing in it beats chicken or yoghurt. It is convenience, not an effect.',
  },
  {
    id: 'omega-3',
    name: 'Omega-3',
    group: 'supplement',
    need: 'optional',
    what: 'Worth taking if you rarely eat oily fish, and redundant if you eat it twice a week.',
    how: '1–2 g combined EPA and DHA — read those two numbers, not the fish-oil total.',
  },
  {
    id: 'multivitamin',
    name: 'A multivitamin',
    group: 'supplement',
    need: 'optional',
    what: 'Cheap insurance against a narrow diet. It does nothing for a broad one.',
    how: 'With food.',
  },
  {
    id: 'bcaa',
    name: 'BCAAs and amino acid drinks',
    group: 'supplement',
    need: 'skip',
    what: 'Redundant the moment you are eating enough total protein, which the target below already sees to.',
    how: '',
  },
  {
    id: 'test-boosters',
    name: 'Testosterone boosters and fat burners',
    group: 'supplement',
    need: 'skip',
    what: 'The ones that are safe do not work, and the ones that work are not sold in tubs.',
    how: '',
  },
];

export function itemsInGroup(items: readonly CareItem[], group: CareGroup): CareItem[] {
  return items.filter((item) => item.group === group);
}

/**
 * A `skip` item is read once, not kept, so it carries no ticks and counts
 * towards nothing. Everything else is something you can own.
 */
export function isKeepable(item: CareItem): boolean {
  return item.need !== 'skip';
}

/* -------------------------------------------------------------------------- */
/*  Storage                                                                   */
/* -------------------------------------------------------------------------- */

/** Items somebody added that are not on the catalogue. */
export const SELF_CARE_ITEMS_KEY = 'dvir-self-care:items';
/** Item id → whether it is had, whether it is used, and a line about it. */
export const SELF_CARE_STATE_KEY = 'dvir-self-care:state';
/** The body the strength maths is done against. */
export const SELF_CARE_BODY_KEY = 'dvir-self-care:body';

/** Fired on `window` after any write, so open views can refresh themselves. */
export const SELF_CARE_EVENT = 'self-care-changed';

export const ITEM_NAME_MAX_LENGTH = 60;
export const ITEM_WHAT_MAX_LENGTH = 200;
export const ITEM_NOTE_MAX_LENGTH = 200;
export const MAX_CUSTOM_ITEMS = 40;

/** What is kept about one item. Absent means never touched. */
export interface ItemState {
  /** It is in the house. */
  have: boolean;
  /** It is actually used, rather than owned. */
  daily: boolean;
  /** Which one you settled on, what it cost, why it did not suit — your line. */
  note: string;
}

export type CareState = Record<string, ItemState>;

export const EMPTY_ITEM_STATE: ItemState = { have: false, daily: false, note: '' };

function isItemState(value: unknown): value is Partial<ItemState> {
  return typeof value === 'object' && value !== null;
}

export function getState(): CareState {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(SELF_CARE_STATE_KEY);
    if (!raw) return {};

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};

    const state: CareState = {};

    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!isItemState(value)) continue;

      const entry = value as Partial<ItemState>;
      state[id] = {
        have: entry.have === true,
        daily: entry.daily === true,
        note: typeof entry.note === 'string' ? entry.note.slice(0, ITEM_NOTE_MAX_LENGTH) : '',
      };
    }

    return state;
  } catch {
    return {};
  }
}

function writeState(state: CareState) {
  try {
    // An entry that says nothing is dropped rather than stored, so unticking
    // everything leaves the key as empty as it started.
    const kept: CareState = {};
    for (const [id, entry] of Object.entries(state)) {
      if (entry.have || entry.daily || entry.note) kept[id] = entry;
    }

    window.localStorage.setItem(SELF_CARE_STATE_KEY, JSON.stringify(kept));
    window.dispatchEvent(new CustomEvent(SELF_CARE_EVENT));
  } catch {
    // Storage unavailable (private mode, quota) — the change just does not stick.
  }
}

export function stateFor(state: CareState, id: string): ItemState {
  return state[id] ?? EMPTY_ITEM_STATE;
}

/**
 * Turning "I have this" off turns "I use this" off with it, since owning is a
 * precondition of using and the pair would otherwise be able to disagree.
 */
export function setHave(id: string, have: boolean): void {
  const state = getState();
  const existing = stateFor(state, id);
  writeState({ ...state, [id]: { ...existing, have, daily: have ? existing.daily : false } });
}

/** And the other way round: saying you use it says you have it. */
export function setDaily(id: string, daily: boolean): void {
  const state = getState();
  const existing = stateFor(state, id);
  writeState({ ...state, [id]: { ...existing, daily, have: daily ? true : existing.have } });
}

export function setNote(id: string, note: string): void {
  const state = getState();
  const existing = stateFor(state, id);
  writeState({ ...state, [id]: { ...existing, note: note.slice(0, ITEM_NOTE_MAX_LENGTH) } });
}

/* -------------------------------------------------------------------------- */
/*  Items of your own                                                         */
/* -------------------------------------------------------------------------- */

function isCareItem(value: unknown): value is CareItem {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Partial<CareItem>;
  return typeof item.id === 'string' && typeof item.name === 'string' && typeof item.group === 'string';
}

const GROUP_IDS = new Set<string>(CARE_GROUPS.map((group) => group.id));
const NEEDS = new Set<string>(['essential', 'helpful', 'optional', 'skip']);

export function getCustomItems(): CareItem[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(SELF_CARE_ITEMS_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(isCareItem)
      .filter((item) => GROUP_IDS.has(item.group))
      .map((item) => ({
        id: item.id,
        name: item.name.trim().slice(0, ITEM_NAME_MAX_LENGTH),
        group: item.group,
        // Anything unrecognised lands on "worth having" rather than being
        // dropped: the item is somebody's own and the tier is the guess.
        need: NEEDS.has(item.need) ? item.need : 'helpful',
        what: typeof item.what === 'string' ? item.what.trim().slice(0, ITEM_WHAT_MAX_LENGTH) : '',
        how: '',
        custom: true,
      }))
      .filter((item) => item.name.length > 0);
  } catch {
    return [];
  }
}

function writeCustomItems(items: CareItem[]) {
  try {
    window.localStorage.setItem(SELF_CARE_ITEMS_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent(SELF_CARE_EVENT));
  } catch {
    // As above — a refused write simply does not stick.
  }
}

/**
 * Everything the page draws: the catalogue with anything you added folded in
 * beside it, each group's own items keeping the catalogue's order and yours
 * landing after them.
 */
export function allItems(custom: readonly CareItem[]): CareItem[] {
  return [...CARE_CATALOGUE, ...custom];
}

/** Case-insensitively, so the same cream cannot be added twice. */
export function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function addItem(input: { name: string; group: CareGroup; need: Need; what?: string }): CareItem | null {
  const name = input.name.trim().slice(0, ITEM_NAME_MAX_LENGTH);
  if (!name) return null;
  if (!GROUP_IDS.has(input.group)) return null;

  const custom = getCustomItems();
  if (custom.length >= MAX_CUSTOM_ITEMS) return null;
  if (allItems(custom).some((item) => sameName(item.name, name))) return null;

  const item: CareItem = {
    // `own-` keeps it clear of every catalogue id, now and after the catalogue
    // grows — the ids there are hand-written and could otherwise collide.
    id: `own-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    group: input.group,
    need: NEEDS.has(input.need) ? input.need : 'helpful',
    what: (input.what ?? '').trim().slice(0, ITEM_WHAT_MAX_LENGTH),
    how: '',
    custom: true,
  };

  writeCustomItems([...custom, item]);
  return item;
}

/** Only an item of your own can go. The catalogue is the page, not a list. */
export function deleteItem(id: string): void {
  writeCustomItems(getCustomItems().filter((item) => item.id !== id));

  const state = getState();
  if (state[id]) {
    const remaining = { ...state };
    delete remaining[id];
    writeState(remaining);
  }
}

/* -------------------------------------------------------------------------- */
/*  How it is going                                                           */
/* -------------------------------------------------------------------------- */

export interface NeedTally {
  need: Need;
  /** Items at this tier that can be had at all. */
  total: number;
  have: number;
  daily: number;
}

/**
 * The tally the top of the page is built on, and the reason the tiers exist:
 * "four of the six things that matter" is an answer, and "twenty-two products"
 * is not.
 */
export function tally(items: readonly CareItem[], state: CareState, need: Need): NeedTally {
  const relevant = items.filter((item) => item.need === need && isKeepable(item));

  return {
    need,
    total: relevant.length,
    have: relevant.filter((item) => stateFor(state, item.id).have).length,
    daily: relevant.filter((item) => stateFor(state, item.id).daily).length,
  };
}

/** The essentials not yet ticked — what the page opens by telling you. */
export function missingEssentials(items: readonly CareItem[], state: CareState): CareItem[] {
  return items.filter((item) => item.need === 'essential' && !stateFor(state, item.id).have);
}

/* -------------------------------------------------------------------------- */
/*  Strength and muscle                                                       */
/* -------------------------------------------------------------------------- */

/** What the eating is for. The protein range and the weekly change follow it. */
export type Aim = 'build' | 'hold' | 'lean';

export const AIMS: readonly { id: Aim; label: string; note: string }[] = [
  { id: 'build', label: 'Build muscle', note: 'Eating slightly more than you burn, and training for it.' },
  { id: 'hold', label: 'Stay as I am', note: 'Holding weight and keeping the muscle already there.' },
  { id: 'lean', label: 'Lose fat, keep muscle', note: 'Eating slightly less — which is when protein matters most.' },
];

export interface Body {
  /** Kilograms. Null until somebody says, so nothing is ever guessed. */
  weightKg: number | null;
  aim: Aim;
}

export const DEFAULT_BODY: Body = { weightKg: null, aim: 'build' };

/** Past a person on either side, and short of the range where the maths lies. */
export const MIN_WEIGHT = 30;
export const MAX_WEIGHT = 250;

export function getBody(): Body {
  if (typeof window === 'undefined') return DEFAULT_BODY;

  try {
    const raw = window.localStorage.getItem(SELF_CARE_BODY_KEY);
    if (!raw) return DEFAULT_BODY;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_BODY;

    const body = parsed as Partial<Body>;
    const weight = typeof body.weightKg === 'number' && Number.isFinite(body.weightKg) ? body.weightKg : null;
    const aim = body.aim === 'build' || body.aim === 'hold' || body.aim === 'lean' ? body.aim : DEFAULT_BODY.aim;

    return {
      weightKg: weight !== null && weight >= MIN_WEIGHT && weight <= MAX_WEIGHT ? Math.round(weight) : null,
      aim,
    };
  } catch {
    return DEFAULT_BODY;
  }
}

function writeBody(body: Body) {
  try {
    window.localStorage.setItem(SELF_CARE_BODY_KEY, JSON.stringify(body));
    window.dispatchEvent(new CustomEvent(SELF_CARE_EVENT));
  } catch {
    // As above.
  }
}

/** Out of range is stored as "not said" rather than clamped — 700 kg is a typo. */
export function setWeight(weightKg: number | null): void {
  const body = getBody();
  const valid =
    weightKg !== null && Number.isFinite(weightKg) && weightKg >= MIN_WEIGHT && weightKg <= MAX_WEIGHT
      ? Math.round(weightKg)
      : null;

  writeBody({ ...body, weightKg: valid });
}

export function setAim(aim: Aim): void {
  writeBody({ ...getBody(), aim });
}

export interface Range {
  low: number;
  high: number;
}

/**
 * Grams of protein a day, from body weight and what the eating is for.
 *
 * The ranges are the ones the reviews keep landing on: about 1.6–2.2 g/kg to
 * build, a little less to hold, and **more** while losing fat rather than less —
 * the deficit is exactly when the body starts taking the difference out of
 * muscle, and protein is what stops it.
 */
export function proteinTarget(weightKg: number, aim: Aim): Range {
  const bands: Record<Aim, Range> = {
    build: { low: 1.6, high: 2.2 },
    hold: { low: 1.4, high: 1.8 },
    lean: { low: 1.8, high: 2.4 },
  };

  const band = bands[aim];
  return { low: Math.round(weightKg * band.low), high: Math.round(weightKg * band.high) };
}

/**
 * How fast the scale should move, in kg a week.
 *
 * Roughly 0.25–0.5% of body weight either way. Faster than that going up is
 * mostly fat, and faster going down costs muscle — which is the whole thing the
 * protein target is there to protect.
 */
export function weeklyChange(weightKg: number, aim: Aim): Range | null {
  if (aim === 'hold') return null;
  return {
    low: Math.round(weightKg * 0.0025 * 10) / 10,
    high: Math.round(weightKg * 0.005 * 10) / 10,
  };
}

/** Litres of water a day: about 30–35 ml per kg, before training is counted. */
export function waterTarget(weightKg: number): Range {
  return {
    low: Math.round(weightKg * 0.03 * 10) / 10,
    high: Math.round(weightKg * 0.035 * 10) / 10,
  };
}

/**
 * Protein spread over the day rather than landed in one meal: about 0.4 g/kg a
 * sitting is where the muscle-building response saturates, so four meals is the
 * usual shape of a day that hits its number.
 */
export function perMeal(weightKg: number): { grams: number; meals: number } {
  const grams = Math.round(weightKg * 0.4);
  return { grams, meals: 4 };
}

export interface ProteinSource {
  name: string;
  /** Grams of protein per 100 g as eaten, unless the note says otherwise. */
  per100: number;
  /** A portion somebody would actually serve, and what it comes to. */
  portion: string;
  portionGrams: number;
  /** Plant or animal — the one distinction that changes how it is combined. */
  kind: 'animal' | 'plant';
}

/**
 * What the protein actually comes from, sorted by density.
 *
 * Figures are per 100 g **as eaten** — cooked, drained, off the bone — because
 * that is the only weight anybody meets. A raw-weight table reads a third
 * higher and quietly makes every day look complete.
 */
export const PROTEIN_SOURCES: readonly ProteinSource[] = [
  { name: 'Whey protein powder', per100: 80, portion: 'one 30 g scoop', portionGrams: 24, kind: 'animal' },
  { name: 'Chicken breast, cooked', per100: 31, portion: 'a 150 g breast', portionGrams: 47, kind: 'animal' },
  { name: 'Tuna, tinned in water', per100: 26, portion: 'a drained 100 g tin', portionGrams: 26, kind: 'animal' },
  { name: 'Lean beef mince, cooked', per100: 26, portion: '150 g', portionGrams: 39, kind: 'animal' },
  { name: 'Salmon, cooked', per100: 25, portion: 'a 150 g fillet', portionGrams: 38, kind: 'animal' },
  { name: 'Tofu, firm', per100: 16, portion: '200 g', portionGrams: 32, kind: 'plant' },
  { name: 'Eggs', per100: 13, portion: 'three eggs', portionGrams: 19, kind: 'animal' },
  { name: 'Oats, dry', per100: 13, portion: 'a 60 g bowl', portionGrams: 8, kind: 'plant' },
  { name: 'Cottage cheese', per100: 11, portion: 'a 200 g tub', portionGrams: 22, kind: 'animal' },
  { name: 'Edamame', per100: 11, portion: '150 g', portionGrams: 17, kind: 'plant' },
  { name: 'Greek yoghurt, 2%', per100: 10, portion: 'a 200 g tub', portionGrams: 20, kind: 'animal' },
  { name: 'Lentils, cooked', per100: 9, portion: 'a 200 g bowl', portionGrams: 18, kind: 'plant' },
  { name: 'Chickpeas, cooked', per100: 9, portion: 'a 200 g bowl', portionGrams: 18, kind: 'plant' },
  { name: 'Milk', per100: 3.4, portion: 'a 250 ml glass', portionGrams: 9, kind: 'animal' },
];

/** How many of that portion it takes to cover a day's target. */
export function portionsFor(source: ProteinSource, grams: number): number {
  if (source.portionGrams <= 0) return 0;
  return Math.ceil(grams / source.portionGrams);
}

export interface StrengthRule {
  title: string;
  detail: string;
}

/**
 * The things that are not a number. Kept here rather than in the page because
 * they are content in the same sense the catalogue is — an edit reaches every
 * browser, and none of it belongs in a component.
 */
export const STRENGTH_RULES: readonly StrengthRule[] = [
  {
    title: 'Lift, or the protein has nowhere to go',
    detail:
      'Muscle is built by the training and only paid for by the food. Two or three sessions a week, adding a little weight or a rep over time, is the whole mechanism.',
  },
  {
    title: 'Eat slightly more than you burn, not much more',
    detail:
      'A surplus of a few hundred calories is the ceiling on how fast muscle can be built. Anything past that is stored as fat and takes months to undo.',
  },
  {
    title: 'Spread the protein across the day',
    detail:
      'The response to a meal saturates. Four meals of a similar size beat one enormous dinner, whatever the daily total says.',
  },
  {
    title: 'Carbohydrate is what you actually train on',
    detail:
      'Cutting carbs cuts the quality of the sessions, and the sessions are the part that builds anything. Rice, oats, potatoes, bread — around the training especially.',
  },
  {
    title: 'Sleep is where it is built',
    detail:
      'Short sleep lowers the muscle gained and raises the muscle lost in a deficit. It belongs in this list as much as any food does.',
  },
  {
    title: 'Creatine is the only supplement worth the money here',
    detail:
      '3–5 g a day of plain monohydrate. Everything else on the shelf is either food you already eat or nothing at all.',
  },
];
