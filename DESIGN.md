# Design

<!-- impeccable:design-schema 1 -->

## World

Restrained, hairline, data-forward dashboard in the Langfuse tradition — brief-pinned directly
by the user's own Langfuse screenshots (`.impeccable/surfaces/frontend-src-components-layout-tsx.md`),
not chosen from a concept tournament. Color lives in the data (chart series), not the chrome.
Light-first now: `frontend/index.html`'s pre-paint script defaults `dark` to `false` when
`localStorage["iris-theme"]` is unset, inverting the previous dark-first default. Dark mode
remains a full, working second theme via the same `useTheme` hook in `Layout.tsx`.

This replaced the prior "Stakent"-pinned material update (larger radii, `shadow-lg`, colorful
badge tones, sparklines, gradient promo tile) in full — see Superseded below. It did not touch
`TraceGraph.tsx`'s call-tree layout, the trace waterfall's proportional-bar logic, or the native
form-element scope boundary, all of which carry forward unchanged from before this pass.

## Palette

Near-zero-chroma neutrals (warm, hue ~75) plus a near-black ink primary — no saturated brand
hue in the chrome at all. This is a real departure from every previous pass (amber, then
Mahogany Red), which each put a saturated accent on `--primary`, active nav, and focus rings.
Saturation now lives only in `--chart-1..5` and `--ring`.

- **`--primary`**: near-black ink, `oklch(0.17 0.006 60)` light / nearly-white `oklch(0.96 0 0)`
  dark. Used for primary buttons, the sidebar logo badge, active-tab underlines, and inline
  links — never for a "brand color" moment; it is typographic ink pressed into a background
  fill, not a hue choice.
- **Ground**: warm off-white `oklch(0.985 0.004 75)` (light) / near-black `oklch(0.14 0 0)`
  (dark) background, with card one step lighter (`oklch(1 0 0)` light / `oklch(0.19 0 0)` dark)
  — same raised-card hierarchy direction every prior palette in this project used.
- **Success**: `oklch(0.5 0.14 155)` light / `oklch(0.72 0.15 155)` dark — pass/fixed states,
  the self-hosted status dot, unchanged in hue from the Mahogany-Red-era value, retained because
  it already sat outside that palette's red family.
- **Destructive**: `oklch(0.55 0.2 25)` light / `oklch(0.62 0.2 25)` dark — a plain red, no
  longer sharing a hue family with primary (primary carries no hue at all now), which resolves
  the open tension the Mahogany Red palette flagged (brand-red sitting adjacent to error-red on
  the same chart).
- **Chart tokens (`--chart-1..5`)**: periwinkle-blue (`oklch(.62 .19 265)`), gold
  (`oklch(.78 .13 80)`), teal (`oklch(.65 .11 190)`), green (`oklch(.55 .1 155)`, matches
  success), neutral gray (`oklch(.6 .01 60)`). These five are the only saturated color budget on
  any page — chart bars/lines, waterfall bars, and the eval-score heatmap in `Scores.tsx` all
  draw from this set, never from `--primary`.
- **`--ring`**: shares chart-1's periwinkle, used for focus rings and the sidebar-ring token —
  the one place a saturated hue appears outside a chart or badge context, and only on
  keyboard-focus interaction, not at rest.
- **`--radius`**: `0.5rem`, down from the Stakent pass's `0.85rem` — back to the tighter,
  hairline-card scale this world's cards actually use.

### Named Rules

**The Chrome-Is-Neutral Rule.** `--primary`, `--secondary`, `--muted`, `--accent`, and every
sidebar/border/input token carry zero or near-zero chroma. Saturation is reserved for
`--chart-1..5` and appears only inside data visualizations, status dots, and badge fills like
`bg-primary/15` icon badges (which read as tinted ink, not brand color, since `--primary` itself
is neutral). If a new surface needs to draw attention to a UI element rather than a data value,
reach for weight or an ink fill, not a hue.

### Superseded: amber accent, and Black / Mahogany Red

Both prior identities — the amber/gold accent (`oklch(.5 .16 78)`) and the later
Black / Carbon Black / Mahogany Red / Strawberry Red named palette (with its "Stakent"-pinned
material update: `--radius: 0.85rem`, `shadow-lg shadow-black/20` cards, colorful per-agent
badge tones, sparkline stat cards, gradient promo tile) — were fully replaced by the
Langfuse-pinned world above. Left out of the current sections rather than kept as history noise,
per this file's own established convention; their full rationale remains below for provenance.

<details>
<summary>Prior palette history (amber, then Black / Mahogany Red)</summary>

**Amber accent** (`--primary` `oklch(0.5 0.16 78)` light / `oklch(0.74 0.15 85)` dark):
replaced an original indigo/violet (hue 276) accent after it was called out as the default
"AI/vibe-coded app" color. Every neutral token's hue moved from 276 to 80 alongside it, so the
whole theme was warm-tinted rather than cool-tinted.

**Black / Mahogany Red** (`--primary` Mahogany Red `#a4161a`/`#ba181b`, `--destructive`
Strawberry Red `#e5383b` kept deliberately distinct from primary, backgrounds Black
`#0b090a`/Carbon Black `#161a1d` corrected to true zero-chroma neutral gray after review, chart
2-4 kept outside the red family for viewer legibility): a second, larger user-specified named
palette, this time applied to both themes rather than dark-only. Flagged, not silently resolved,
an open tension for an observability tool where a red brand accent sits visually adjacent to
red error/fail badges (`Regression.tsx`'s "Pass rate over time" bars beside `Fail`/`Regressed`
badges) — the current ink-primary world resolves this tension by removing chroma from the
primary token entirely rather than tuning the two reds further apart.

**Stakent material update** (paired with Black / Mahogany Red): `--radius` raised to `0.85rem`,
`Card` shipped `rounded-2xl` + real `shadow-lg shadow-black/20`, pill-shaped filters, per-agent
badge tones (`AGENT_TONES`), inline `Sparkline` on Overview stat cards, gradient promo tile.
Pinned by a user-supplied "Stakent" crypto-staking-dashboard screenshot as a richer material
language than the original flat Langfuse pass. Superseded when the Langfuse screenshots were
re-pinned as the authoritative reference and cards returned to hairline (`border-border
shadow-sm rounded-lg`, no `shadow-lg`). Pill-shaped filters and inline sparklines were the two
elements of this update that carried forward — they matched the Langfuse screenshots
independently, not because the Stakent pass introduced them.

</details>

Tokens live in `frontend/src/index.css`, `:root` (light) and `.dark`.

## Type

- **UI text**: Geist Sans (`Geist Variable`) — unchanged across every pass this project has
  shipped, a real workhorse face.
- **Data/code**: Geist Mono (`Geist Mono Variable`) — span/trace IDs, timestamps, code blocks,
  the connector CLI snippets. Never a "technical" costume; only for actual code, IDs, or
  measurement.
- **Hierarchy actually used**: no display/headline scale — this is a dense dashboard, not an
  editorial surface. Page titles in the header are `text-sm font-medium`; card titles
  (`CardTitle`) are `text-base font-medium`; body/table text is `text-sm`; stat numbers on
  Home/Overview/Dashboards run larger (`text-2xl`–`text-3xl` `font-semibold`) as the one place
  type carries visual weight. Underlined text-tabs (`TextTabs` in `Home.tsx`, similar patterns
  in `Scores.tsx`/`Dashboards.tsx`) use `text-sm`, with the active tab distinguished by
  `border-b-2 border-foreground font-medium` — never by color.

## Layout

Fixed icon-only nav rail (`w-16`, `RAIL_WIDTH` in `Layout.tsx`) replaces the prior labeled,
collapsible sidebar — no text labels, no expand/collapse toggle, just `title`/`aria-label` on
each icon link and a plain ink-tinted pill (`bg-sidebar-accent`) for the active route. Header is
a single `h-14` bar: page title on the left (from `activeLabel(pathname)`), a self-hosted status
badge and one icon button (Connect) on the right — no breadcrumb. Main content sits in a
`max-w-[1500px]` container with `p-6 lg:p-8` padding, offset by `pl-16` for the rail. Filter
controls across `TraceExplorer`, `Regression`, `Alerts`, `Dashboards`, `Scores` are consistently
pill-shaped (`h-9 rounded-full border border-input bg-muted/40`), not square selects — the one
layout convention that carried forward unchanged from the Stakent-era update because it also
matches the Langfuse reference independently.

## Elevation & Depth

Flat by default: `Card` (`components/ui/card.tsx`) ships `rounded-lg border border-border
bg-card shadow-sm` — a hairline border plus a minimal 1px-scale shadow, not the `shadow-lg
shadow-black/20` the prior Stakent-pinned pass used. Depth reads from the border and the
card/background lightness step, not from cast shadow. `TraceGraph.tsx`'s custom `SpanNode`
components were brought in line with this same hairline treatment (`rounded-lg border bg-card
shadow-sm`) as part of this restyle, not left on the old `shadow-lg` material — there is one
elevation system, not two.

## Shapes

`--radius: 0.5rem` (down from `0.85rem`) cascades through Tailwind's `rounded-*` scale via the
`@theme inline` block's `--radius-sm/md/lg/xl/2xl/3xl/4xl` derivations — buttons (`rounded-lg`),
cards (`rounded-lg`), inputs, and badges all read this one token. Filter pills and stat/status
badges use `rounded-full` regardless of the base radius token, a deliberate exception for
chip-like controls, not an inconsistency.

## Components

### Buttons
- **Shape**: `rounded-lg` (reads `--radius`).
- **Primary**: `bg-primary text-primary-foreground hover:bg-primary/80` — ink fill, not a brand
  hue; `h-8` default, `px-2.5`.
- **Outline / Secondary / Ghost / Destructive / Link**: `destructive` uses a tinted
  `bg-destructive/10 text-destructive` at rest (not a solid fill) with `/20` on hover — the only
  variant that stays visibly "loud" without full saturation.

### Cards
- **Corner style**: `rounded-lg` (0.5rem).
- **Background**: `bg-card` — one lightness step above page background in both themes.
- **Shadow strategy**: `shadow-sm` only; see Elevation & Depth.
- **Border**: `border border-border`, a true hairline (`oklch(0.9 0.004 75)` light /
  `oklch(1 0 0 / 10%)` dark) — this border is the primary depth cue, not a supplement to shadow.
- **Internal padding**: `--card-spacing` token, `--spacing(4)` default / `--spacing(3)` for
  `size="sm"`.

### Navigation (icon rail)
- **Style**: `w-16` fixed rail, icons only (`size-4.5` Lucide icons in `size-10` hit targets),
  `title`/`aria-label` carry the label text instead of visible labels.
- **Active state**: `bg-sidebar-accent text-sidebar-accent-foreground` pill — plain ink tint,
  never a colored highlight.
- **Hover**: `hover:bg-sidebar-accent/60 hover:text-foreground` on inactive links.
- **No mobile-specific treatment**: the rail is fixed at all viewport widths; content reflows
  under it via the `pl-16` offset and responsive grid columns on individual pages.

### Text tabs (signature pattern)
`TextTabs` (`Home.tsx`) and equivalent inline patterns in `Scores.tsx`/`Dashboards.tsx`: a row
of buttons under one shared `border-b border-border`, active tab gets `border-b-2
border-foreground font-medium text-foreground` via `-mb-px`, inactive tabs are
`border-transparent text-muted-foreground`. Underline, never a filled pill or background swap —
matches the pinned Langfuse reference's tab treatment directly.

### Filter pills
`h-9 rounded-full border border-input bg-muted/40 px-4 text-sm`, `focus:ring-2 focus:ring-ring`.
Used for every filter control across Traces, Regression, Alerts, Dashboards, and Scores' new
date-range filter — one consistent chip-select shape rather than native `<select>` chrome, even
though the underlying element (`Alerts.tsx`, `Dashboards.tsx` widget forms) is often a real
native `<select>` themed to match.

### Charts
Bars/lines/heatmap cells draw exclusively from `--chart-1..5`; never `--primary`. Daily bar
charts cap individual bars at `max-w-12` inside a `flex-1` track so a single day of data (this
project's own common dev/demo state) doesn't render as one solid block. This pattern predates
the current world and still applies to every daily/hourly chart added since, including Home's
model-latency and spans-by-type charts.

## Signature mark

An aperture/iris glyph (`IrisMark` in `Layout.tsx`) — a pupil with eight radial blades, not a
lettermark — carried forward unchanged in logic through this restyle. Matches the brand
rationale in `PRODUCT.md` (the part of the eye that adapts to observe) and doubles as a
lens/observability motif. Used in exactly two places: the nav rail's logo badge (now
`bg-primary text-primary-foreground` — ink, not a brand hue) and `public/favicon.svg` (updated
to the new ink color as a static hex copy, since a favicon renders with no page CSS context).

## Signature piece: the trace waterfall

`TraceDetail.tsx`'s proportional-width waterfall (each span's bar positioned/sized from its
real `start_time`/`end_time` against the trace's total span, indented by real parent-child
depth) is unchanged in logic through this restyle — only its bar fill moved from `--primary` to
`--chart-1`, since a duration bar is data, not chrome. Duration labels stay in a fixed-width
column beside the bar, never overlaid on it.

## Trace graph view

`TraceGraph.tsx` (`@xyflow/react`) — the call-tree companion to the waterfall, toggled via the
underlined-tab-style pill control on Trace Detail — is unchanged in layout logic. Its `SpanNode`
components now match the app's hairline card language (`rounded-lg border bg-card shadow-sm`,
see Elevation & Depth) instead of the old `shadow-lg` material. `colorMode` still follows the
app's own dark/light toggle via a `MutationObserver` on `document.documentElement`'s class.

## Browser surfaces

Still themed rather than left as OS chrome, now reading the new tokens: `::selection`
(`--color-primary` — ink, not a brand hue, so selected text now shows as a dark/light highlight
rather than a colored one), scrollbar (WebKit + `scrollbar-color`), `caret-color`, checkbox/radio
`accent-color`, `font-variant-numeric: tabular-nums` on tables. See the `@layer base` block in
`index.css`.

## Native form elements

Checkboxes/radios stay native `<input>` elements themed only via `accent-color` (now ink, not a
brand hue) — not rebuilt as custom components. `<select>` elements stay native and unstyled
beyond the shared input chrome; the dropdown popup and arrow are OS-drawn. Still a deliberate
scope boundary, not an oversight.

## Surfaces covered by this pass

Every existing page restyled onto the new world: `Layout.tsx`, `Overview.tsx` (kept its
per-agent-card content/IA, restyled only), `TraceExplorer.tsx`, `TraceDetail.tsx`,
`TraceGraph.tsx`, `Sessions.tsx`, `Analytics.tsx`, `Regression.tsx`, `Alerts.tsx`, `Connect.tsx`.
Three new pages: `Home.tsx` (`/home`, additive alongside Overview), `Scores.tsx` (`/scores`, new
per-trace numeric judge scoring in `eval/iris_eval`), `Dashboards.tsx` (`/dashboards`, a real
server-persisted widget system backed by a new `dashboard_widgets` table and a fixed real-metric
catalog in `collector/iris_collector/db.py`).

## Do's and Don'ts

### Do:
- **Do** keep saturated color inside `--chart-1..5`, status dots, and `/10`–`/20` tinted badge
  fills. Primary UI chrome (nav, buttons, borders) stays neutral.
- **Do** use the hairline `border-border shadow-sm` card by default; reach for a stronger shadow
  only if a component is genuinely floating above content (a dropdown, a modal), not for a
  resting card.
- **Do** use underlined text-tabs for any new in-page view switcher, matching `TextTabs`'s
  `border-b-2 border-foreground` active state — not a filled pill.
- **Do** cap daily/hourly bar-chart bar width (`max-w-12` pattern) so single-day data doesn't
  read as a broken solid block.

### Don't:
- **Don't** give `--primary` a saturated hue. Every prior pass (indigo, amber, Mahogany Red)
  that did this was explicitly walked back; the current ink-primary choice is the resolution,
  not one more iteration to defend.
- **Don't** add a labeled/expandable sidebar. The icon-only rail with no text labels and no
  collapse toggle is the current, deliberate nav pattern.
</content>
