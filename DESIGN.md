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

Restrained-but-committed: near-zero-chroma neutrals (hue 276, matching the accent) plus one
real accent, replacing the previous fully-grayscale (`oklch(x 0 0)`) palette.

- **Accent (`--primary`)**: indigo/violet, hue 276 — `oklch(0.5 0.21 276)` light,
  `oklch(0.72 0.17 276)` dark. Used for active nav, focus rings, primary chart series, links.
- **Success**: `oklch(0.5 0.14 155)` light / `oklch(0.72 0.15 155)` dark — real pass/fixed
  states (`Badge variant="success"`), previously rendered as plain gray.
- **Destructive**: unchanged from the original shadcn defaults.
- Chart tokens (`--chart-1..5`) now carry real hue instead of grayscale, for future
  multi-series charts.

Tokens live in `frontend/src/index.css`, `:root` (light) and `.dark`.

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
