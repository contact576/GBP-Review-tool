/**
 * Service-aware experience chips.
 *
 * The "what stood out?" chips used to come from the industry catalog alone, so
 * a customer who came in for a root canal and one who came in for teeth
 * whitening saw the identical list. This module tunes the list to the service
 * the customer actually picked: chips that describe THAT kind of work come
 * first, the industry's own chips follow, and a few universal ones fill the
 * tail. Nothing here is an outcome claim ("cured", "fixed forever") — every
 * chip describes the customer's experience of the visit, which is the only
 * thing they can honestly vouch for.
 *
 * Framework-free and shared by the customer page (to render the chips) and the
 * review-draft API (to allowlist them), so a chip the customer can tap is never
 * filtered out of the prompt on the server.
 */

interface ServiceChipRule {
  /** Matched against the lowercased service label. */
  match: RegExp;
  chips: readonly string[];
}

/**
 * Ordered most-specific first: the first three rules that match contribute,
 * so "Emergency plumbing repair" picks up the emergency chips, then the repair
 * chips, and stops.
 */
const SERVICE_CHIP_RULES: readonly ServiceChipRule[] = [
  // ── Marketing, advertising and web work ──────────────────────────────
  // Each ad platform gets its own vocabulary: a Google Ads client talks about
  // keywords and landing pages, a Meta Ads client about creatives and
  // targeting. Every chip is still an experience ("looked great", "handled
  // carefully"), never a result the customer cannot vouch for.
  { match: /google ads|search ads|ppc|pay.?per.?click|adwords|paid search|sem|shopping ads|performance max|pmax|youtube ads|display ads/, chips: ["Thorough keyword research", "Landing page looked great", "Budget handled carefully", "Clear monthly reporting", "Ad copy sounded like us"] },
  { match: /meta ads|facebook ads|instagram ads|fb ads|paid social|social ads|tiktok ads|linkedin ads|pinterest ads|snapchat ads|retarget|remarket/, chips: ["Scroll-stopping creatives", "Targeting made sense", "Fresh ad ideas every month", "Clear reporting", "Quick to test new angles"] },
  { match: /seo|search engine optim|local seo|link.?build|technical seo|business profile|gbp|map pack|local listing|citation/, chips: ["Explained the strategy plainly", "Content sounded like us", "Regular progress updates", "Fixed the technical stuff", "Patient with our questions"] },
  { match: /web ?design|website|web ?dev|landing page|wordpress|shopify|e-?commerce|app dev|ui|ux|redesign/, chips: ["Looks great on mobile", "Easy for us to update", "Delivered on time", "Listened to what we wanted", "Fast, clean build"] },
  { match: /social media|content creation|content calendar|reels|community management|influencer/, chips: ["Consistent posting", "On-brand content", "Creative ideas", "Quick replies to comments"] },
  { match: /email marketing|newsletter|sms marketing|marketing automation|crm|hubspot|klaviyo|mailchimp|zoho|workflow/, chips: ["Set up without fuss", "Emails sounded like us", "Clear about what was automated", "Explained the workflow"] },
  { match: /analytics|tracking|tag manager|conversion|reporting|dashboard|attribution/, chips: ["Set up tracking properly", "Reports were easy to read", "Explained the numbers", "Found what was broken"] },
  { match: /brand|logo|graphic|creative design|print design|packaging|identity/, chips: ["Nailed our brand look", "Open to feedback", "Fast turnaround", "Attention to detail"] },
  { match: /video|animation|ad creative|production|editing|voice.?over/, chips: ["Great creative direction", "Quick turnaround", "Made us feel comfortable on camera", "Edited exactly how we wanted"] },
  { match: /marketing|digital|advertis|campaign|growth|lead gen|strategy|media buying|copywriting/, chips: ["Explained the plan plainly", "Proactive with ideas", "Clear reporting", "Responsive to every message", "Honest about what would work"] },
  // ── Everything else ──────────────────────────────────────────────────
  { match: /emergenc|same.?day|urgent|after.?hours|24\s*\/?\s*7/, chips: ["Came out fast", "Available when I needed them", "Calm under pressure"] },
  { match: /clean|maid|janitor|housekeep|wash|detail/, chips: ["Spotless result", "Thorough and careful", "Showed up on time", "Respectful of my space"] },
  { match: /repair|fix|install|replac|maintenance|tune.?up|service call|diagnos/, chips: ["Fixed right the first time", "Explained the problem clearly", "Fair, upfront pricing", "Left everything tidy"] },
  { match: /inspect|estimate|quote|assess|evaluat|audit/, chips: ["Honest assessment", "Clear about costs", "No pressure to buy", "Thorough walkthrough"] },
  { match: /consult|exam|check.?up|assessment|screening|second opinion/, chips: ["Listened carefully", "Clear explanations", "Never felt rushed", "Answered all my questions"] },
  { match: /dental|filling|whitening|crown|implant|hygien|root canal|braces|invisalign|extraction/, chips: ["Gentle and careful", "Explained every step", "Comfortable the whole time", "Painless as it could be"] },
  { match: /physio|rehab|chiro|adjust|therap|massage|acupunct|osteo|recovery|mobility/, chips: ["Hands-on and attentive", "Explained what they were doing", "Left feeling looser", "Personalised to me"] },
  { match: /facial|spa|skin|lash|brow|wax|nail|manicure|pedicure|tan/, chips: ["Relaxing atmosphere", "Loved the result", "Clean and hygienic", "Attentive to detail"] },
  { match: /hair|cut|colou?r|style|blow|balayage|highlight|beard|shave|trim|fade|braid|extension/, chips: ["Loved the result", "Listened to what I wanted", "Great attention to detail", "Made me feel at ease"] },
  { match: /dine|dinner|lunch|brunch|breakfast|takeout|take-?away|delivery|catering|menu|tasting|happy hour/, chips: ["Great food", "Fast service", "Generous portions", "Everything came out hot"] },
  { match: /coffee|espresso|latte|tea|pastr|bakery|cake|dessert|bread|donut|bagel/, chips: ["Great coffee", "Fresh and delicious", "Friendly baristas", "Quick even when busy"] },
  { match: /event|wedding|party|venue|banquet|celebration|booking|reservation/, chips: ["Everything ran smoothly", "Easy to book", "Went above and beyond", "Made the day stress-free"] },
  { match: /tax|account|bookkeep|payroll|audit|legal|law|attorney|lawyer|immigration|visa|mortgage|insurance|notary|estate|will/, chips: ["Made a complex process simple", "Explained my options clearly", "Responsive to every question", "Transparent about fees"] },
  { match: /train|class|lesson|tutor|coach|session|workshop|camp|course|program/, chips: ["Patient and encouraging", "Well-structured session", "Kept me motivated", "Adapted to my level"] },
  { match: /photo|shoot|portrait|headshot|video|film/, chips: ["Made us feel comfortable", "Beautiful results", "Quick turnaround", "Great creative direction"] },
  { match: /mov(e|ing)|haul|junk|deliver|courier|storage/, chips: ["Careful with my things", "On time", "Efficient crew", "No surprises on the bill"] },
  { match: /car|auto|oil|brake|tire|tyre|alignment|transmission|engine|detailing|windshield|body ?work/, chips: ["Honest about what was needed", "Done when promised", "Fair price", "Explained the work in plain terms"] },
  { match: /roof|gutter|siding|window|door|deck|fence|paint|drywall|floor|tile|kitchen|bath|renovat|remodel|landscap|lawn|tree|snow/, chips: ["Quality workmanship", "Kept the site clean", "Stuck to the schedule", "Communicated throughout"] },
  { match: /plumb|drain|water heater|leak|pipe|sewer|electric|wiring|panel|lighting|hvac|furnace|air condition|a\/c|heat pump|duct/, chips: ["Diagnosed it quickly", "Explained the fix clearly", "Left everything tidy", "Fair, upfront pricing"] },
  { match: /rent|lease|buy|sell|listing|showing|open house|home|property|apartment|condo/, chips: ["Knows the market", "Always reachable", "Negotiated well for me", "Patient with my questions"] },
  { match: /pet|dog|cat|groom|vet|boarding|daycare/, chips: ["Gentle with my pet", "Clearly loves animals", "Kept me updated", "Clean facility"] },
  { match: /child|kid|daycare|preschool|nanny|babysit/, chips: ["Warm with the kids", "Kept me informed", "Safe and clean", "Patient and caring"] },
  { match: /gym|membership|fitness|yoga|pilates|crossfit|personal train|bootcamp|swim/, chips: ["Welcoming to beginners", "Clean equipment", "Motivating coaches", "Great energy"] },
  { match: /room|stay|suite|check.?in|hotel|lodge|inn|b&b/, chips: ["Spotless room", "Easy check-in", "Helpful front desk", "Slept well"] },
  { match: /shop|store|purchase|order|pickup|return|exchange|gift/, chips: ["Helped me find the right thing", "Fair prices", "Easy returns", "Well-stocked"] },
];

/** Chips that fit almost any visit; used to top up a short list. */
const UNIVERSAL_CHIPS: readonly string[] = [
  "Friendly and welcoming",
  "Easy to book",
  "Great value",
  "Clean and well kept",
  "Would come back",
];

/** How many chips the customer page shows — matches `ReviewFlow`'s slice. */
export const ATTRIBUTE_CHIP_LIMIT = 10;

/** Most service-specific rules allowed to contribute to one list. */
const MAX_RULES = 3;

function mergeUnique(lists: readonly (readonly string[])[], limit: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const raw of list) {
      const value = raw.trim();
      if (value.length === 0) continue;
      const key = value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(value);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** Chips that describe the kind of work a service label names, or [] when none match. */
export function serviceSpecificChips(service: string | undefined | null): string[] {
  const needle = (service ?? "").trim().toLowerCase();
  if (needle.length === 0) return [];
  const matched: string[][] = [];
  for (const rule of SERVICE_CHIP_RULES) {
    if (rule.match.test(needle)) {
      matched.push([...rule.chips]);
      if (matched.length >= MAX_RULES) break;
    }
  }
  return mergeUnique(matched, ATTRIBUTE_CHIP_LIMIT);
}

/**
 * The positive chips to show for a visit: service-specific first, the
 * industry's own next, universal fillers last. Always deduped and capped at
 * `ATTRIBUTE_CHIP_LIMIT`. With no service (or an unrecognised one) this is the
 * industry list topped up with universals — exactly today's behaviour.
 */
export function positiveChipsForService(
  service: string | undefined | null,
  industryAttributes: readonly string[],
): string[] {
  const real = mergeUnique([serviceSpecificChips(service), industryAttributes], ATTRIBUTE_CHIP_LIMIT);
  // Universal fillers only top up a short list, and never sit next to a chip
  // that already says the same thing ("Easy booking" + "Easy to book").
  if (real.length >= MIN_BEFORE_FILLERS) return real;
  const firstWords = new Set(real.map((chip) => chip.toLowerCase().split(/\s+/)[0] ?? ""));
  const fillers = UNIVERSAL_CHIPS.filter((chip) => !firstWords.has(chip.toLowerCase().split(/\s+/)[0] ?? ""));
  return mergeUnique([real, fillers], ATTRIBUTE_CHIP_LIMIT);
}

/** Lists at least this long stand on their own without universal fillers. */
const MIN_BEFORE_FILLERS = 8;

/** One row of "what stood out?" chips: a service's own, or the general set. */
export interface ChipGroup {
  /**
   * The service(s) these chips describe — "Google Ads", or "Injury rehab &
   * Manual therapy" when two picks share a vocabulary — or null for the
   * general/industry row.
   */
  service: string | null;
  chips: string[];
}

/** "A", "A & B", "A, B & C". */
export function joinLabels(labels: readonly string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} & ${labels[labels.length - 1]}`;
}

/** Chips shown under each picked service. */
export const SERVICE_GROUP_CHIP_LIMIT = 5;
/** Chips in the general row when at least one service row is showing. */
const GENERAL_WITH_SERVICES_LIMIT = 6;
/** Of those, how many are reserved for the neutral chips ("First visit"). */
const GENERAL_NEUTRAL_SLOTS = 2;

/**
 * The chip rows for a visit that covered one or MORE services. A customer who
 * bought Google Ads and Meta Ads sees a row about keywords and landing pages,
 * then a row about creatives and targeting, then the industry's general chips
 * — instead of one blended list where the second service's vocabulary never
 * appears. A chip is never repeated across rows (first row wins), and with no
 * services picked the single general row is exactly `positiveChipsForService`
 * plus the neutral chips, as before.
 */
export function chipGroupsForServices(
  services: readonly string[],
  industryAttributes: readonly string[],
  neutralAttributes: readonly string[],
): ChipGroup[] {
  const seen = new Set<string>();
  const take = (list: readonly string[], limit: number): string[] => {
    const out: string[] = [];
    for (const raw of list) {
      const value = raw.trim();
      const key = value.toLowerCase();
      if (value.length === 0 || seen.has(key)) continue;
      seen.add(key);
      out.push(value);
      if (out.length >= limit) break;
    }
    return out;
  };

  // Services that share a vocabulary ("Injury rehab" and "Manual therapy"
  // both read as physio work) merge into ONE labelled row rather than the
  // second silently losing every chip to the first.
  const rows: { key: string; services: string[]; chips: string[] }[] = [];
  for (const service of services) {
    const specific = serviceSpecificChips(service);
    if (specific.length === 0) continue;
    const key = specific.join("|").toLowerCase();
    const existing = rows.find((row) => row.key === key);
    if (existing) existing.services.push(service);
    else rows.push({ key, services: [service], chips: specific });
  }
  const groups: ChipGroup[] = [];
  for (const row of rows) {
    const chips = take(row.chips, SERVICE_GROUP_CHIP_LIMIT);
    if (chips.length > 0) groups.push({ service: joinLabels(row.services), chips });
  }
  // With service rows showing, the general row is short — but it always keeps
  // room for the neutral chips ("First visit"), which no service row offers.
  const general = groups.length > 0
    ? [
        ...take(positiveChipsForService(undefined, industryAttributes), GENERAL_WITH_SERVICES_LIMIT - GENERAL_NEUTRAL_SLOTS),
        ...take(neutralAttributes, GENERAL_NEUTRAL_SLOTS),
      ]
    : [
        ...take(positiveChipsForService(undefined, industryAttributes), ATTRIBUTE_CHIP_LIMIT),
        ...take(neutralAttributes, neutralAttributes.length),
      ];
  if (general.length > 0) groups.push({ service: null, chips: general });
  return groups;
}

/**
 * Every chip a customer at this business could legitimately tap, across every
 * service they might pick. The review-draft API uses this as its allowlist so
 * the server accepts exactly what the page can render — no more, no less.
 */
export function allAllowedChips(
  services: readonly string[],
  industryAttributes: readonly string[],
  neutralAttributes: readonly string[],
): string[] {
  const perService = services.map((service) => positiveChipsForService(service, industryAttributes));
  return mergeUnique(
    [positiveChipsForService(undefined, industryAttributes), ...perService, neutralAttributes],
    Number.POSITIVE_INFINITY,
  );
}
