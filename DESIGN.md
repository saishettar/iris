# Design

<!-- impeccable:design-schema 1 -->

## World

Dense, developer-tool-native dashboard in the Langfuse/Datadog/Honeycomb tradition — pinned
directly by the user rather than chosen from a concept tournament. Persistent left sidebar,
breadcrumb header, data-dense tables, a real proportional-width trace waterfall. Dark-first,
light available via a working toggle (`useTheme` in `Layout.tsx`, persisted to
`localStorage["iris-theme"]`, applied pre-paint by an inline script in `index.html` to avoid
a flash of the wrong theme).

## Material update: richer cards, pinned to a reference

A user-supplied screenshot (a crypto staking dashboard, "Stakent") pinned a richer material
language than the initial flat/bordered Langfuse-style pass: larger corner radii, real soft
card elevation, colorful per-item icon badges, inline sparklines on stat cards, and one
gradient "promo" card as a deliberate accent. Per the brief-wins principle, this pinned
reference's concrete visual grammar was adopted -- translated onto Iris's real data and IA,
never copied literally (no staking/wallet content, obviously).

- `--radius` raised from `0.5rem` to `0.85rem` (`index.css`) -- cascades to every
  `rounded-*` utility that reads the theme's radius tokens, including buttons and inputs.
- `Card` (`components/ui/card.tsx`) now ships `rounded-2xl` and a real `shadow-lg
  shadow-black/20` by default, replacing the previous flat `ring-1` only. Every page's
  `border-border/70 bg-card/70 shadow-none` override (20 occurrences) was removed in favor
  of the component's own default, plus `bg-card/80` where a touch of translucency reads well.
  This is a real shift from the initial Langfuse pass's deliberately flat cards -- the pinned
  reference asked for depth, so depth is what shipped; still Restrained-but-committed on
  color, not Full-palette or Drenched.
- Filter controls (`TraceExplorer`, `Regression`) became pill-shaped (`rounded-full`,
  `bg-muted/40`) rather than square selects, matching the reference's chip-style filters.
- Overview's agent cards cycle through four badge tones (`AGENT_TONES` -- primary plus
  `--chart-2/3/4`) instead of one repeated color, and its "Traces" / "P50 latency" stat cards
  carry a real inline `Sparkline` built from the same `trace_volume` / `latency_by_day` series
  Analytics already fetches -- not decorative, and it renders nothing (not a flat line) when
  fewer than two data points exist, which is the actual state of this project's own demo data
  today. A gradient promo tile ("Connect another agent") closes the agent grid, translating
  the reference's gradient CTA panel into a real onboarding nudge rather than decoration.

## Palette

Restrained-but-committed: near-zero-chroma neutrals (hue matches the accent) plus one real
accent, replacing the previous fully-grayscale (`oklch(x 0 0)`) palette.

- **Accent (`--primary`)**: warm amber/gold, hue ~80 — `oklch(0.5 0.16 78)` light,
  `oklch(0.74 0.15 85)` dark. Used for active nav, focus rings, primary chart series, links.
  Originally shipped as indigo/violet (hue 276); replaced after the user called it out as
  the default "AI/vibe-coded app" accent color -- a real, recognizable cliché, not a matter
  of taste to defend. Amber ties back to the brand rationale instead: the iris regulates how
  much light gets through, and gold/amber is the actual color of camera aperture rings and
  instrument-panel gauges, not a category default for dev tools. Every neutral token's hue
  moved from 276 to 80 too, so the whole theme is warm-tinted rather than cool-tinted -- a
  find-and-replace of one number would have left a purple-tinted "gray" underneath a gold
  accent, which reads as an oversight the moment someone looks closely.
- **Success**: `oklch(0.5 0.14 155)` light / `oklch(0.72 0.15 155)` dark — real pass/fixed
  states (`Badge variant="success"`), previously rendered as plain gray.
- **Destructive**: unchanged from the original shadcn defaults.
- Chart tokens (`--chart-1..5`): 1 mirrors primary (amber), 2 is teal (190), 3 is blue (250,
  deliberately not orange/red -- would have collided with amber or destructive), 4 is green
  (155, matches success), 5 is neutral gray.
- The Overview promo tile's gradient and `public/favicon.svg` (a static hex copy, since a
  favicon has no page CSS context) were hardcoded to the old purple and needed manual
  updates -- token changes don't reach hardcoded arbitrary-value colors, which is exactly how
  the favicon went unnoticed as a leftover Vite default for as long as it did.

Tokens live in `frontend/src/index.css`, `:root` (light) and `.dark`.

### Superseded: Ink Black / Prussian Blue, and the amber accent

Both were replaced in the same branch by the Black / Mahogany Red palette below before
either shipped to `main` -- left out of this file rather than kept as history noise.

## Current palette: Black / Mahogany Red

A second, larger user-specified named palette (Black, Carbon Black, Dark Garnet, Mahogany
Red x2, Strawberry Red, Silver, Dust Grey, White Smoke, White) replaced both the amber
accent and the ink-navy dark base, for both themes this time, not dark-only. Not every
supplied swatch is used -- explicitly permitted ("don't feel the need to use all of them")
-- and the curation itself is a real decision worth recording:

- **`--primary`**: Mahogany Red, the two supplied shades split by theme -- `#a4161a`
  (darker, light mode) and `#ba181b` (brighter, dark mode) -- same light/dark-variant
  pattern used for every accent this project has shipped.
- **`--destructive`**: Strawberry Red `#e5383b`, deliberately a *different* red from
  primary rather than reusing Mahogany. Collapsing brand-accent and error-state into one
  red would erase the distinction between "this is the product's color" and "this is
  broken" -- two named reds in the same supplied palette made keeping that distinction
  free.
- **Backgrounds**: Black `#0b090a` / Carbon Black `#161a1d` (dark mode background/card);
  White Smoke `#f5f3f4` / White `#ffffff` (light mode background/card) -- card is the
  lighter, "raised" tone in both themes, same hierarchy direction as every palette this
  project has used.
- **Neutrals**: Silver `#b1a7a6` and Dust Grey `#d3d3d3` cover muted text and borders in
  light mode; derived dark-mode surfaces (`--secondary`, `--muted`, `--sidebar`) are
  `color-mix()` steps off Carbon Black, and hover/accent surfaces blend in Dark Garnet
  (`color-mix(in oklch, #161a1d, #660708 35%)`) rather than a plain lighter gray -- ties
  the reds into the neutral ramp itself instead of leaving them isolated to primary/
  destructive, the same reasoning that drove retinting every neutral in the amber pass.
- **Chart series 2-4** (teal/blue/green) stay outside this red family on purpose: a
  data-viz series needs colors a viewer can tell apart at a glance, and three shades of one
  red hue can't do that. Chart 1 and chart-5 do use the family (Mahogany, Silver).

**Open tension, flagged rather than silently resolved:** this is an observability tool,
where red carries unusually strong, specific meaning (something failed). Making the brand
accent itself a red means ordinary volume/latency chart bars, the active-nav highlight, and
default-state icons all render in a color family adjacent to the actual error state
(Strawberry Red badges on Regression/Trace Detail). Verified this is a real, visible
tension, not a hypothetical: `Regression.tsx`'s "Pass rate over time" trend bars render
Mahogany Red immediately beside literal `Fail`/`Regressed` badges in Strawberry Red. The
two reds are visually distinguishable (deeper/muted vs. bright/saturated) and this was
executed as specified, not overridden -- but it's the one place this palette asks more of
the viewer than the previous two did, and is worth deciding deliberately rather than
inheriting by default.

### Follow-up: neutral dark backgrounds, and a toned-down promo tile

Two corrections after review:

- Dark mode's `--background`/`--card`/`--popover`/`--secondary`/`--muted`/`--accent`/
  `--sidebar*` moved from the literal Black/Carbon Black hex to true zero-chroma neutral
  gray (`oklch(L 0 0)`). Black `#0b090a` and Carbon Black `#161a1d` each carry a faint,
  *different* tint (warm and cool respectively) once you look closely -- inconsistent with
  each other and with `:root`'s genuinely neutral White Smoke/White. Mahogany Red
  (primary), Strawberry Red (destructive), and Silver (chart-5) still do real work; every
  background/surface token is now plain neutral.
- The Overview promo tile's gradient was a full-strength Mahogany-to-Black block with a
  matching glow shadow -- too bold sitting among otherwise-quiet neutral cards, more so
  now that the backgrounds themselves went neutral. Rebuilt with `color-mix(in oklch,
  var(--color-primary), var(--color-card) 82%)` fading to the plain card color: a
  theme-relative, barely-there tint instead of a hand-picked-per-theme literal block, so it
  self-corrects if the palette changes again rather than needing two more manual edits. The
  icon badge and body text dropped to the same `bg-primary/15 text-primary` /
  `text-foreground` treatment every other agent card already uses; only the "Get started"
  button keeps a solid `bg-primary` fill, so exactly one element on the tile carries full
  accent strength instead of the whole card.
- Light mode's `--accent`/`--accent-foreground` and `--sidebar-accent`/
  `--sidebar-accent-foreground` (hover and selected states, including the sidebar nav) were
  still a deliberate 8%-Mahogany tint left over from the Black/Mahogany palette pass --
  inconsistent with dark mode's now-neutral accent tokens. Both themes use plain
  `oklch(L 0 0)` for hover/selected now (`0.91`/`0.2` light, `0.24`/`0.94` dark), matching
  the same symmetry dark mode already had (`--accent` and `--sidebar-accent` share one
  value, not two hand-picked ones). The request named the sidebar specifically; the general
  `--accent` token got the same fix since it was the identical leftover tint, not a
  separate decision.

## Type

- **UI text**: Geist Sans (`Geist Variable`, unchanged) — a real workhorse face, kept as-is.
- **Data/code**: Geist Mono (`@fontsource-variable/geist-mono`, new) — span/trace IDs,
  timestamps, code blocks, the connector CLI snippets. Never used as a "technical" costume;
  only for actual code, IDs, or measurement.

## Browser surfaces

Themed rather than left as OS chrome: `::selection`, scrollbar (WebKit + `scrollbar-color`),
`caret-color`, checkbox/radio `accent-color`, `font-variant-numeric: tabular-nums` on tables.
See the `@layer base` block in `index.css`.

## Signature mark

An aperture/iris glyph (`IrisMark` in `Layout.tsx`) — a pupil with eight radial
blades, replacing a lettermark ("i" in a rounded square) that was as generic as a
logo gets. Matches the brand rationale in `PRODUCT.md` (the part of the eye that
adapts to observe) and doubles as a lens/observability motif. Used in exactly two
places: the sidebar badge and `public/favicon.svg` (a static hex-color copy, since
a favicon renders with no page CSS context) — the favicon itself was still shipping
Vite's default gradient-blob template asset before this pass, unrelated to the
product and never replaced.

## Signature piece: the trace waterfall

`TraceDetail.tsx` replaced a flat, unordered span list with a real proportional-width
waterfall: each span's bar is positioned/sized from its actual `start_time`/`end_time`
against the trace's total span, indented by real parent-child depth (walked via
`parent_span_id`). Duration labels live in a fixed-width column to the right of the bar
track, never overlaid on the bar itself — an earlier version overlaid the label and produced
unreadable low-contrast text on wide bars; the fixed column is the fix, not a font-weight
tweak.

## Known pattern: single-day chart data

The daily bar charts (trace volume, latency-over-time, operations-per-hour) cap each bar at
`max-w-12` inside a `flex-1` track. Without the cap, a single day of data (the common state
for this project's own dev/demo traffic) renders as one solid block filling the whole card,
which reads as broken rather than as a chart. Any new daily/hourly bar chart in this app
should use the same pattern.

## Native form elements

Checkboxes/radios are native `<input>` elements themed only via `accent-color` (not rebuilt
as custom components). `<select>` elements are native and unstyled beyond the shared
input chrome (`border-input`, `bg-background`) — the dropdown popup and arrow are OS-drawn.
This was a deliberate scope boundary for this pass, not an oversight: replacing them with a
custom Radix `Select` is a larger, separate change.

## Surfaces covered by this pass

`Layout.tsx`, `TraceExplorer.tsx`, `TraceDetail.tsx`, `Analytics.tsx`, `Regression.tsx`, the
new `Connect.tsx` (`/connect` route) — a live agent-onboarding page mirroring the README's
own Usage section, with a real polling "waiting for your first trace" status against
`GET /traces` — and the new `Overview.tsx` (`/`), the landing page: one card per distinct
agent from a real per-agent SQL rollup (`GET /agents`, `db.get_agent_summary()`), plus a
global stat row. `TraceExplorer` moved from `/` to `/traces` to make room for it.

An Overview card links to `/traces?agent=<name>`; `TraceExplorer` seeds its `agent` filter
from that query param on mount. Building this exposed a real backend bug: `list_traces()`'s
`agent` filter only matched `gen_ai.agent.name`, while every display surface (row labels,
the agent `<select>`, `get_agent_summary()`) falls back to `service_name` when that attribute
is absent — so an agent visible everywhere else was unfilterable. Fixed by matching the same
`COALESCE(gen_ai.agent.name, service_name)` identity in the filter.
