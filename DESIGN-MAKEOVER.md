# Foundly — Premium Makeover Spec (DESIGN-MAKEOVER.md)

> Consolidated, authoritative cross-brand design direction for Foundly — a trust-forward local-growth SaaS (reviews + Google Business Profile + local visibility) for small-business owners.
>
> **Design lineage:** Linear's clarity × Stripe's trust × Duolingo's rationed celebration. Voice: **million-dollar, premium, authentic, trustworthy, calm.**

---

## 0. Locked identity (non-negotiable — adopt STRUCTURE, never foreign palettes/fonts)

- **Canvas:** light-first warm paper `#F7F6F2`; white cards; deep-green hero card `#0C4A3E`. **No dark mode.**
- **Color tokens:** ink `#17201D`, sub `#5C6663`, faint `#8A938F`, hairline `#E7E5DE`, primary green `#0C7A63` (+ dark `#085546`, tint/wash), gold `#E8A33D` (rationed to earned celebration), danger `#C4452F`, star `#E9A13B`.
- **Type:** Hanken Grotesk (everything, **including all large display and data figures — with `tnum`**), Spline Sans Mono (data chips / kickers / micro-captions only — **never the big display number itself**). **Radii 16 / 12 / 12 / 999.** Two shadow levels. **No emoji.** WCAG AA. **Tabular numerals on all data.**
- **Honesty laws (expanded):**
  1. **Never fabricate metrics.** Any demo, screenshot, marketing widget, or empty state populated with illustrative figures must carry a persistent **"Sample data" / "Example"** label. Uncomputed values render as an explicit empty state, never `0`.
  2. **1–3 star path always surfaces the public Google review link — at genuine visual parity.** The public link gets the same tap-target size, weight, and legibility as any primary action on that screen. It is **never** faint, sub-styled, buried below the fold, or gated behind a private-feedback step. **No review-gating** (also Google policy).
  3. **Dual consent** surfaced explicitly before capture/send.
  4. Say **"found you / contacted you"**, never "customers gained".

Everything below re-skins borrowed patterns into these tokens. Where a source brand's hue conflicts, **the hue is rejected and only its structure is kept.**

---

## 1. AVOID LIST — what we explicitly do NOT use, and why

| Reject | Why |
|---|---|
| **Luxury-auto & aerospace** (BMW-M, Lamborghini, Ferrari, bugatti, SpaceX, Renault) | Dark cinematic canvases, full-bleed vehicle/rocket photography as brand voltage, UPPERCASE heavy-700 machined display, 0px sharp rectangles, ghost-outline CTAs. Reads adrenaline/aspirational-consumer and cold — opposite of a warm tool a plumber uses daily. Reference only for the boxless spec-cell and accent-rationing philosophy. |
| **Retro skeuomorphism** (Dell-1996, nintendo-2001) | Page-frame borders, beveled metal plates, halftone slabs, GIF NEW! stickers, Arial Black/Times body, chamfered corners. The exact "cheapen the SMB tool" failure mode. |
| **Media & dark consumer apps** (The Verge, Spotify, RunwayML) | Rave-flyer near-black canvases, acid-neon accents, 8 competing radii, photography-as-UI, theater darkness. We're light-first and earn trust through legible data. Keep only Verge timeline-feed structure and Spotify circular-progress geometry. |
| **Terminal-native dev tools** (opencode.ai, warp, voltagent) | All-mono body, ASCII bullets, faux-TUI heroes, near-black canvases. Signals "insider dev toy", erodes trust with non-technical owners. Keep mono scoped to data chips/kickers + copy-snippet pill only. |
| **Crypto-hype fintech** (Binance, Kraken) | Casino canvas, high-voltage yellow / crypto-purple, FOMO drama. Yellow collides with rationed gold; purple reads crypto. Steal only tabular-number discipline, dense-table anatomy, text-color direction semantics, whisper-shadow tokens. |
| **Rainbow-pastel productivity** (clay, Figma color-blocks, Miro sticky-notes, Slack mesh) | Saturated 5–6 color fields, off-axis sticky notes, pastel-mesh gradient heroes. Fractures the single-green + rationed-gold trust palette. Keep ONE colored panel (deep-green hero), not a rainbow. |
| **Serif-display editorial** (Claude, ElevenLabs, Mistral, wired) | Serif hero faces + 76–96px literary scale read as magazine/dev-tool and violate the Hanken lock. Adopt gravity + warm layering, never the typeface. |
| **All single-accent HUES** (Cursor orange, Intercom Fin orange, Replicate orange, Stripe indigo, Coinbase blue, Cohere coral, Notion purple, Zapier orange, Sentry lime/pink) | These are our **highest-value structural donors** — steal the patterns wholesale — but every actual accent hue is rejected. Re-skin to green/gold. |
| **Consumer retail urgency** (Nike, Pinterest, Meta, PlayStation, Vodafone) | Sale-red chips, "Selling fast" scarcity, discount-pressure tags, masonry, billboard display. Urgency near review/consent flows breaks honesty laws. Take restraint mechanics only. |
| **Pure-white clinical canvas** (Airbnb, Apple, Airtable, IBM, Supabase) | Temperature correction: never render on cold `#fff`. Always warm to paper `#F7F6F2`. Also avoid cool **frosted-glass / backdrop-blur** chrome — it greys the warm canvas; use solid high-opacity paper for sticky bars. |
| **Dark-mode surface ladders as a MODE** (Linear, Raycast, Sanity, Composio, ClickHouse, together.ai, Framer) | Elite structural donors, but dark-only. Invert the ladder LOGIC to light warm-paper tints; import zero near-black values. One dark surface only: the deep-green hero card. |
| **Shouting display & pill-everything** (Vodafone 800-weight, Ollama pill inputs, Mastercard 40px stadiums) | All-caps heavy headlines read cold; pill inputs look toy-like. Keep sentence-case restrained display and the locked radii (999 only for chips/toggle-pills). |

---

## 2. SURFACE-BY-SURFACE ADOPT MATRIX

Priority key: **must** / should / nice. Sources cited per element.

### Marketing (landing, pricing, /score free tool)
- **[must]** Live interactive hero widget showing the **real** product — *wise, cal, Uber, Cursor, Stripe*. On /score embed a working "enter your business → see YOUR visibility score" card (white 16px card on paper, faint green wash scoped to the hero only). The visitor's own computed score is real; any accompanying dashboard preview/screenshot is labeled **"Sample data."** Never fabricated mockups.
- **[must]** Editorial surface-rhythm, never two like bands in a row (paper → white → deep-green → paper) — *Airtable, cal, PostHog, Superhuman, HP, Coinbase*. ~96px rhythm; surface change is the divider; close every page on a deep-green CTA band.
- **[should]** Mono kicker eyebrow above every section headline — *HashiCorp, Linear, Cohere, Zapier, together.ai*. Spline Sans Mono, warm ink, +0.4px tracking, optional small green dot.
- **[should]** 4-up trust/reassurance icon row with honesty-law claims — *Meta, Mintlify, Wise*. Line icons (no emoji): Verified reviews / Dual consent / No fabricated metrics / Google-linked. Faint logo strip.
- **[nice]** Restrained display, ~600 weight ceiling, negative tracking, sentence case — *IBM, webflow, Coinbase, Wise*.

### Auth
- **[must]** White form card on paper (or on a deep-green section) with green pill submit — *Cohere, Uber, Mistral*. Whitespace-only calm hero, no gradient/mesh.
- **[must]** Fintech-grade input sizing: 56px fields, 48px min buttons — *Revolut, Starbucks*. AA targets, 12px radius.
- **[should]** Green focus: border swaps to primary + low-alpha ring — *Stripe, claude, Linear, Sanity*.

### Onboarding wizard
- **[must]** Numbered workflow-step cards with square icon plates — *Expo, Cohere*. Connect Google → Import customers → Send first request → Watch reviews arrive.
- **[should]** Staged-pill process timeline (structure only, no pastels) — *Cursor*. Green tints for stages, one gold "Done/earned" state **only at genuine first-milestone completion**, not per-step.
- **[should]** Sticky footer with running state + single next action — *Apple, cal*. Deep-green completion step inverts CTA to white pill.
- **[should]** Google-connection failure / partial-permission states specified (danger callout, retry path) — *IBM, PostHog*.
- **[nice]** Warm-tinted panel grouping each step's fields — *Mistral, Cohere, Starbucks*.

### Owner Dashboard (hero score dial + 3 stat cards + tasks + needs-reply + benchmark strip + leaderboard)
- **[must]** Deep-green hero band framing the score dial as the single dark anchor — *MongoDB, Cohere, Wise, claude, webflow*. `#0C4A3E`, white type, translucent inner panels, hairline borders, one bright-green CTA, Webflow 5-stop Level-2 shadow. One polarity flip per view.
- **[must]** Oversized score number as peak trust moment — *Airbnb, ClickHouse, Lovable, MiniMax, Slack*. **Big figure in Hanken with `tnum`** (white on the hero); the small qualifier/caption beneath is Spline Sans Mono. Thin supporting stat columns. If a score is not yet computed, show an explicit uncomputed state — never render `0`. Never fabricate.
- **[must]** 3 stat cards as boxless spec-cells: big value over micro mono label — *BMW, Ferrari, Lovable, NVIDIA, Binance*. **Deltas: arrow shows direction, color shows whether that direction is favorable for THAT metric** (green favorable / danger unfavorable — e.g., a drop in 1–3 star volume is favorable → green). Text-only, never a fill. "found you / contacted you" copy.
- **[should]** Surface-ladder + hairline elevation, no shadow crutch — *Linear, claude, Sanity, Lovable, together.ai*. Tight stat+tasks cluster, generous air before benchmark/leaderboard.
- **[should]** Needs-reply queue as command-palette / agent-console rows — *Cohere, Raycast, ElevenLabs*. Avatar + reviewer + stars + relative date, right-aligned status pill + compact action; selected row lifts one notch.
- **[nice]** Gold strictly for earned celebration in leaderboard/milestones — *Starbucks, ElevenLabs, Mintlify, Intercom*.

### Reviews inbox
- **[must]** Hairline research-table rows, zebra-free, right-aligned tabular metadata — *Cohere, Supabase, together.ai, MiniMax, Coinbase*. Collapses to stacked key/value cards on mobile (see shared components).
- **[must]** Semantic status-pill system (soft-bg + deep-text) for sentiment & reply state — *Wise, Kraken, Meta, Webflow, Stripe*. Green positive/replied, danger for 1–3 star/needs-action, neutral info. AA by construction.
- **[should]** Hero filter chips: sentiment cut (1–3 vs 4–5 star / Needs reply) — *Cohere, HP, Pinterest, Uber, together.ai*. Active flips to green/ink fill. **The 1–3 star view surfaces the public Google link at full parity** (honesty law).
- **[should]** Ink-not-gold star rating chrome — *Airbnb, cal*. Because star `#E9A13B` is nearly identical to gold `#E8A33D`, render everyday rating stars in **ink**; reserve the star hue only for a literal filled-star *input* (e.g., the mobile review flow), never dense lists — this keeps rationed gold's voltage.
- **[nice]** AI reply-composer with suggestion pills + honesty callout — *Lovable, PostHog*.

### Requests funnel
- **[must]** Sticky right-rail action card → mobile bottom bar — *Airbnb, Meta, Apple*.
- **[should]** Staged lifecycle timeline: Sent → Opened → Reviewed → Public-link-shown — *Cursor*. Green-tint stage pills. **No gold on routine conversion** — a normal request converting is not a celebration; gold is reserved for true milestones only.
- **[should]** Category chip row + compact in-row CTAs (28px) — *Uber, Binance, Cohere*.
- **[nice]** Copy-to-clipboard request-link snippet pill — *ollama, Composio, voltagent*. Green wash, not black.

### Customers table + detail drawer
- **[must]** Premium hairline data table: mono-caps header, right-aligned tabular numerals, no zebra — *Supabase, together.ai, Sanity, MiniMax, Zapier*. Base pattern for every table; mobile collapse to stacked cards.
- **[must]** Pill filter-dropdown row above the table — *Miro, Cohere, HP*. Rating/source/status/date.
- **[should]** Detail drawer: two-column key/value spec table + underline sub-tabs + mono-timestamp activity timeline — *Meta, Starbucks, IBM, MiniMax, BMW*.
- **[should]** Level-2 shadow reserved for drawer overlay only — *Mastercard, HP, Kraken, Starbucks*.
- **[nice]** Breadcrumb with dot separators — *Meta*.

### Campaigns / automations
- **[must]** Horizontal automation/recipe cards: icon plate + name + one-line desc + right action — *Raycast, Composio, MongoDB, HashiCorp*.
- **[should]** Agent-console panel showing automations "working" on a deep-green surface — *Cohere*. Inline status-dot + label for on/off.
- **[should]** Radio-option cards: 2px green border selection signal — *Meta, Apple, voltagent*.
- **[nice]** Category tags quarantined to small pills only, AA foregrounds — *MongoDB, Intercom, HashiCorp*.

### Benchmark (bars)
- **[must]** Boxless spec-cell readout: value big / mono label / hairline-divided — *BMW, bugatti, Ferrari, together.ai*.
- **[should]** Side-by-side "you vs local average" comparison card / facts table with footnote row for caveats — *Cursor, Starbucks, Notion*. Honest deltas, no inflation; disclose sample size / basis in the footnote.
- **[should]** Quiet horizontal bars: single green-tint fill, value-as-text, rounded caps — *Notion, Intercom, NVIDIA*.
- **[nice]** Segmented/pill scope switcher — *cal, Figma, together.ai, Starbucks*.

### Analytics + AI-Visibility + Rank-Grid
- **[must]** Trend chart card anatomy: value+delta header, chart body, segmented timeframe footer — *Binance, ElevenLabs*. Delta text-color by favorable/unfavorable, single green-tint fill.
- **[must]** Mono-caps technical labels for axes, rank-grid coordinates, table headers — *Sanity, Cohere, Linear, OpenCode*.
- **[should]** **Solid warm-paper** sticky sub-nav (NOT frosted/backdrop-blur) with underline/tab section switcher + hairline bottom — *Apple, IBM, MiniMax, BMW*.
- **[nice]** Weight-driven hierarchy, not color-tinted type tiers — *NVIDIA, Pinterest, Starbucks*.

### Studio (QR + website widget)
- **[must]** Copy-to-clipboard code well with header bar + format tabs (green underline) — *Mintlify, Resend, Replicate, Expo, Composio*. Light wash surface, not pure black.
- **[should]** Split configurator: fixed live preview pane + scrolling options list (~60/40) — *Renault, Cursor*.
- **[nice]** Circular swatch selector with active green ring — *Renault, BMW-M, Nike, Starbucks*.

### Billing (pricing cards + usage meters)
- **[must]** Featured tier via deep-green polarity inversion (no ribbon), price in **Hanken display + `tnum`**, green-wash tint-shadow — *cal, Coinbase, Intercom, Stripe, MongoDB, Superhuman, Mintlify*. Never a "MOST POPULAR" urgency ribbon.
- **[must]** Monthly/annual segmented pill toggle + quiet green save badge — *Figma, cal, Mintlify, together.ai, Intercom*.
- **[should]** Pricing sub-dialect (mono plan kickers, tabular prices) + hairline comparison table with mono-caps dividers, green check glyphs, sticky headers, mobile accordion — *Airtable, Mintlify, Notion, PostHog, Framer*.
- **[should]** Usage meters as quiet green progress bars, value-as-text — *ClickHouse, Lovable, Binance*. **Approaching/over quota = danger/neutral, never gold.** Gold is only for positive earned milestones.
- **[nice]** Soft-halo stacked shadow on pricing cards — *Shopify, webflow, Kraken*.

### Settings
- **[must]** 3-column docs shell / sticky 240px sidebar with green left-edge active indicator — *MiniMax, PostHog, together.ai*.
- **[should]** Two-column key/value spec rows + property-row pattern for config fields — *Meta, Mintlify, Starbucks*.
- **[should]** Green focus/underline input states + inline status dots — *IBM, Sanity, Resend, Stripe*.
- **[nice]** Semantic callout banner family (tip/success/warning/info), line icons, no emoji — *PostHog*.

### Agency console (client table + white-label)
- **[must]** Dense client hairline table + compact in-row actions — *Supabase, together.ai, Binance, MiniMax*.
- **[should]** Slim utility strip above primary nav for client/white-label switcher — *HP, NVIDIA*.
- **[should]** White-label token overrides: agencies may re-brand accent/logo, but the **honesty laws, tabular-number discipline, and no-emoji rule remain locked** and non-overridable. Print/PDF export of client reports inherits the same warm-paper system.
- **[nice]** Deep-green fill for the agency/white-label top tier — *Miro, MongoDB*.

### Admin (data tables + health)
- **[must]** Zebra-free hairline tables, mono-caps headers, tabular cells, calibrated ink ladder, 4px grid, 0.16px body tracking — *Supabase, Sanity, together.ai, voltagent, IBM*.
- **[should]** Inline status-dot + semantic pill health indicators — *Resend, Meta, Wise*.
- **[nice]** Light code/data well for verbatim technical content — *Composio, Mintlify*.

### Customer review flow (mobile)
- **[must]** 1–3 star path surfaces the public Google review link **at full visual parity** — *Expo*. Distinct role from the private-feedback CTA, but **equal size/legibility, never faint or gated** (no review-gating). Dual consent via semantic callout (line icon).
- **[must]** scale(0.95) / opacity-0.8 press micro-interaction system-wide — *Apple, Starbucks, Lovable*. **Respects `prefers-reduced-motion`** (see shared components).
- **[should]** Framed "this is what your customer sees" preview card — *Resend, cal*.
- **[nice]** Generous ~1.55 leading for consent/legal copy — *Mistral, Sentry*.

### Transactional email & SMS (review requests, reminders, notifications) — **ADDED**
- **[must]** Warm-paper email body, ink type, single filled-green button, hairline dividers, **no emoji**, honest verified sender identity; SMS is plain, link-forward, opt-out compliant. This is the surface most end-customers actually see — it must read as premium and trustworthy, and dual-consent/honesty copy applies verbatim. Sources: *Resend, Stripe (receipt-grade transactional restraint)*.
- **[should]** Agency white-label variants inherit the same skeleton with token overrides only.

### Staff capture PWA
- **[must]** Floating circular green FAB (Request/Capture) bottom-right, 56px, layered shadow, scale(0.95) press (reduced-motion aware) — *Starbucks, BMW-M*.
- **[must]** **Offline / queued-capture state** — hairline banner + queued-item indicator; captures sync when back online, never silently dropped. Sources: *Resend, Meta*.
- **[should]** Large tap targets + green focus ring; floating-label inputs — *Revolut, Sanity, Pinterest*.
- **[nice]** Command-palette-style capture rows with right-aligned status — *Raycast*.

### shared COMPONENTS
- **[must]** Button ladder: filled-green primary / hairline (or ink-solid) secondary / text — one radius, variants change fill/border only, never shape; sentence-case; optional Lovable inset-shadow primary — *Airtable, webflow, Zapier, Supabase, Sanity, Lovable*.
- **[must]** Hairline-first cards; two-shadow ceiling; surface-contrast elevation; neutrals as ink-at-graded-opacity — *Cursor, Lovable, Intercom, HP, Starbucks, Kraken, webflow*.
- **[must]** Single green focus ring + one universal green activation/hover across inputs and interactive rows — *Sanity, Linear, Stripe, claude, NVIDIA*.
- **[must]** Two-variant semantic badge system (solid/soft, AA) in green/danger/neutral/gold-wash (earned only) — *webflow, Wise, Kraken, Notion, Meta*.
- **[must]** **Loading/skeleton states** — calm paper-tint block shimmer that matches final layout, never spinners; charts show skeleton then data or an empty state (never a fabricated zero). *Linear, Stripe*.
- **[must]** **Reduced-motion contract** — every transform/animation (press scale, dial fill, toast, drawer) has a `prefers-reduced-motion: reduce` fallback (instant state change, no scale/opacity motion).
- **[must]** **Responsive table→card collapse** — below the table breakpoint, hairline rows reflow into stacked key/value cards (label left / tabular value right), preserving no-zebra + tabular discipline.
- **[should]** Two scoped tab idioms: pill-tabs (view switch) vs underline segmented (in-page) — *cal, Notion, IBM, MiniMax, Figma*.
- **[should]** Consistent empty-state (soft-fill card, line icon, single action) + toast (card-shape, Level-2, undo) — *Zapier, HashiCorp*. **Error / 404 / permission-denied states** drawn from the same empty-state family.
- **[nice]** Tabular numerals + global stylistic set on all data; tokenized single transition timing — *Stripe, Coinbase, Binance, Shopify, Tesla*.
- **[nice]** Strict radius vocabulary enforced as a hard rule — *Resend, HP, Pinterest, Mistral*.

---

## 3. DATA-VIZ PLAN — quiet + premium

Governing rules for **every** chart: contained categorical palette (green tints + one neutral) **quarantined from brand chrome**; single tinted fill per series; **value-as-text** (tabular); rounded caps; **no gridlines, legend-clutter, or chartjunk**; **direction as text color mapped to favorable/unfavorable (not raw up/down)**; single-hue sequential ramps (never rainbow, never unlabeled diverging); **no-data renders an explicit empty state, never a fabricated zero or interpolated line**; **never fabricate**.

| Chart | Where | Sources | How to keep it quiet + premium |
|---|---|---|---|
| **Score dial (progress ring)** | Dashboard hero, /score, Analytics | Spotify, ClickHouse, Airbnb, Lovable | Thin ring, single green (white on hero card), rounded caps, centered oversized **Hanken tabular** number + **Spline Sans Mono** qualifier. Form only — never Spotify's dark fill. Uncomputed = explicit empty state, not `0`. |
| **Stat tiles / KPI** | Dashboard 3 cards, Benchmark, Analytics, Marketing, Billing | ClickHouse, Lovable, Slack, MiniMax, NVIDIA, Ferrari | Big Hanken-tabular numeral over mono micro-label; delta arrow = direction, color = favorable/unfavorable for that metric. "found you/contacted you". |
| **Line / area** | Analytics, Dashboard trend, Benchmark | Binance, ElevenLabs, Intercom | Value + signed % header (color = favorable/unfavorable), single green-tint area, mono axes, segmented timeframe footer. Gaps in data shown as gaps, not zero-fill. |
| **Sparkline** | Stat cards, Customer drawer, table cells | ElevenLabs, Lovable | Single green stroke + paired tabular value. Below a minimum point count, show markers/dots instead of a connecting line so a trend isn't implied from 2–3 points. |
| **Horizontal bars** | Benchmark, Dashboard strip | Notion, NVIDIA, Intercom | Single green-tint fill, value text at bar end, rounded caps, you-vs-average pairing with caveat footnote. |
| **Donut / pie** | Analytics breakdown, Dashboard composition | Intercom, Binance | Only for genuine part-of-whole with ≤4 slices. **For 2-category splits (positive/negative, replied/unreplied) use a single stacked bar or paired stat tiles instead** — a 2-slice donut is chartjunk. Max 3–4 green tints + neutral, value-as-text. |
| **Funnel** | Requests funnel, Campaigns | Cursor, Composio, Sanity | Green-tint stages, tabular counts + honest drop-off %, real proportional widths. **No gold on routine conversion** — gold only if the terminal state is a genuine milestone. |
| **Heatmap** | Analytics activity, AI-Visibility timing | Sanity, OpenCode | Single-hue green sequential ramp only, mono axis labels, AA cell values, captioned figure. No red blended into the ramp (that reads as unlabeled diverging). |
| **Geo-grid (Rank-Grid)** | Analytics + Rank-Grid | Composio, Sanity, Cursor | **N×N equal-cell grid (3×3 / 5×5 / 7×7 as sampled — not literally 2×2)**, consistent gap, rounded light container, mono rank values, single-hue green ramp. Danger `#C4452F` only as a **discrete, labeled "not ranking" marker**, never blended into the ramp. Empty/unsampled cells shown as empty. |
| **Progress meters** | Billing usage, Onboarding | ClickHouse, Lovable, Binance | Single green-tint fill, value-as-text, rounded caps. Near/over limit = danger/neutral. Gold tint **only** for positive earned thresholds, never routine usage. |

---

## 4. COMPONENT UPGRADES (system primitives)

- **Neutral ramp** = ink `#17201D` at graded opacities → guaranteed harmony on paper (*Lovable*).
- **Elevation** = surface ladder (paper → white card → faint wash) + hairline `#E7E5DE` first; **two shadows only**: Level-1 soft interactive lift (e.g. `0 4px 24px rgba(0,0,0,.03)`), Level-2 layered/halo (Webflow 5-stop or Mastercard `0 24px 48px rgba(0,0,0,.08)`) for drawers/modals/toasts/hero card (*Cursor, Lovable, HP, Starbucks, Kraken, webflow*).
- **Sticky bars** = solid high-opacity **warm paper** + hairline bottom; **no backdrop-blur / frosted glass** (cool idiom that greys the canvas).
- **Buttons**: filled-green primary (one per band, brightest pixel), hairline secondary, text tertiary; radius 12; sentence case; variants by fill/border only (*Shopify, webflow, Zapier, Sanity*).
- **Focus/hover**: single green ring + one universal green activation across all interactive elements (*Sanity, Linear, Stripe*).
- **Badges**: two variants (solid fill / soft tint + deep same-hue text), AA foregrounds; green / danger `#C4452F` / neutral / gold-wash (earned only) (*webflow, Wise, Kraken*).
- **Tabs**: pill-in-pill for view switching, 2px underline + weight bump for in-page (*cal, Notion, IBM*).
- **Inputs**: 56px height, 12px radius, green focus ring/underline, danger underline error; floating labels on mobile (*Revolut, IBM, Starbucks*).
- **Empty / loading / error states**: from the card family — skeleton shimmer (no spinners) while loading; soft-fill card + line icon + single action when empty; same family for error/404/permission-denied; **no emoji**.
- **Motion**: one tokenized transition timing; every transform honors `prefers-reduced-motion: reduce` with an instant fallback.
- **Numerals**: global `tnum` on Hanken (including all display figures); Spline Sans Mono scoped to chips/kickers/captions only.
- **Radius lock** enforced without exception: 16 cards / 12 buttons+inputs / 999 chips+toggle-pills (*Resend, Pinterest*).

---

## 5. IMPLEMENTATION WAVES (ordered, desktop-first)

### Wave 1 — Foundation tokens & shared components
**Goal:** lock primitives so every later surface inherits premium calm for free.
**Surfaces:** shared COMPONENTS, DATA-VIZ tokens.
- Opacity-derived neutral ramp; surface-ladder + hairline elevation; two shadow levels defined.
- Button ladder, radius lock, green focus ring + universal green activation.
- Two-variant badge system; two tab idioms; global tabular numerals; tokenized transition.
- Empty / loading (skeleton) / error state patterns, reduced-motion contract, responsive table→card collapse (no emoji).

### Wave 2 — Owner Dashboard hero moment
**Goal:** ship the single most visible "million-dollar" upgrade first.
**Surfaces:** Owner Dashboard, score dial + stat tiles.
- Deep-green hero card + score dial (thin green ring, oversized Hanken-tabular number, mono qualifier, empty state for uncomputed).
- 3 boxless spec-cell stat cards; delta color = favorable/unfavorable; "found you/contacted you".
- Command-palette needs-reply rows; gold reserved for milestones.

### Wave 3 — Marketing & /score conversion
**Goal:** premium, honest public funnel.
**Surfaces:** Marketing (landing, pricing, /score), Auth.
- Editorial surface-rhythm + deep-green closing band; live /score widget on the visitor's real score; any demo dashboard labeled "Sample data".
- Mandatory mono kickers; restrained display; trust icon row; faint logo strip.
- Auth: white form card, 56px inputs, green focus + pill submit.

### Wave 4 — Data tables & list surfaces
**Goal:** every dense surface reads as a trustworthy ledger.
**Surfaces:** Reviews inbox, Customers table + drawer, Requests funnel, Agency console, Admin.
- Premium hairline table base (mono-caps headers, tabular right-aligned, no zebra, mobile card collapse).
- Semantic status pills; ink-not-gold stars; pill filters; 1–3 star view surfaces the public Google link at full parity.
- Detail drawer spec table + underline sub-tabs + mono-timestamp timeline; sticky request rail → mobile bottom bar.

### Wave 5 — Analytics, Benchmark & data-viz
**Goal:** roll out the quiet-premium chart system.
**Surfaces:** Analytics + AI-Visibility + Rank-Grid, Benchmark, DATA-VIZ.
- Contained green chart palette; trend card anatomy; mono axis labels; no-data empty states.
- Benchmark spec-cells + comparison card (with caveat footnote) + quiet bars; single-hue heatmap + N×N geo-grid (danger only as labeled discrete marker).
- Solid warm-paper sticky sub-nav.

### Wave 6 — Billing & pricing precision
**Goal:** convert on trust, no hype.
**Surfaces:** Billing, Marketing pricing.
- Deep-green polarity-inverted featured tier + green-wash tint-shadow; monthly/annual pill toggle + quiet save badge; no urgency ribbon.
- Pricing sub-dialect + hairline comparison table (mobile accordion); green progress usage meters (danger near-limit, gold never for routine usage); soft-halo card shadow.

### Wave 7 — Studio, Settings, Onboarding, mobile, PWA & messaging
**Goal:** finish the long tail owners and customers touch daily.
**Surfaces:** Studio, Settings, Onboarding, Customer review flow (mobile), Staff capture PWA, Transactional email/SMS, Campaigns.
- Studio light code well + format tabs + split configurator + swatch theming.
- Settings 3-column shell / green left-edge nav; key/value spec rows; semantic callouts (line icons).
- Onboarding step cards + staged-pill timeline + sticky footer + Google-connection failure states.
- Mobile review flow public-link parity rule + reduced-motion press; PWA floating green FAB + offline/queued state.
- Transactional email/SMS templates (warm paper, one green button, honest sender, no emoji, dual-consent copy).
- Campaigns automation cards + agent-console panel.

---

## 6. Governing principles (the through-line across all six top donors)

1. **Warm paper, never pure white, never frosted-cool chrome** (Cursor, Lovable, Intercom, PostHog, Replicate, Starbucks, Wise).
2. **One dark surface only** — the deep-green hero card — used as the single polarity flip per view (MongoDB, Cohere, Wise, Superhuman, Stripe).
3. **Accent scarcity as a hard rule** — green is the sole interactive voltage; gold rationed to genuine earned celebration (never routine conversions/usage); one accent moment per viewport (Apple, Mintlify, Supabase, Replicate, Zapier, Wise, NVIDIA).
4. **Depth from surface + hairline, not shadow** — two shadows reserved for real lift (Linear, Sanity, HP, Lovable, together.ai).
5. **Numbers carry trust** — Hanken-tabular figures, mono labels, value-as-text, direction color mapped to favorable/unfavorable (Stripe, Coinbase, Binance, ClickHouse).
6. **Show the real product, never fabricate** — live widgets and true screenshots; demo/sample figures always labeled; no-data states never render a fake zero (cal, Cursor, Expo, Intercom, Stripe).
7. **Honesty over conversion** — the public Google review link keeps full visual parity on the 1–3 star path; no review-gating, no urgency, no scarcity near review/consent flows (Expo; and every retail-urgency brand on the avoid list).
8. **Calm typographic voice** — Hanken at restrained weight, sentence case, mono kickers as taxonomy; hierarchy from weight + size, not color (IBM, HashiCorp, Linear, Pinterest, Starbucks).
