import { useEffect, useState } from "react"
import { ChevronLeft, GitBranch, GanttChartSquare, Plus, X } from "lucide-react"
import { Link, useParams } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { addTraceTag, getTraceSpans, getTraceTags, removeTraceTag, type Span } from "@/lib/api"
import { TraceGraph } from "@/pages/TraceGraph"

// Two views over the same spans, toggled below: a real proportional-width
// waterfall (where did the time go) and a call-tree graph (what called
// what -- see TraceGraph.tsx). The waterfall's bars are positioned/sized by
// each span's actual start offset and duration against the trace's total
// span, and indented by real parent-child depth -- the flat ordered list
// this replaced was an honest placeholder (v0 never generated this view)
// but told you nothing about overlap, nesting, or where the time went.

export function ms(iso: string): number {
  return new Date(iso).getTime()
}

export function spanDuration(span: Span): number {
  const start = ms(span.start_time)
  const end = span.end_time ? ms(span.end_time) : start
  return Math.max(end - start, 0)
}

export function formatDuration(msValue: number): string {
  if (msValue < 10) return `${msValue.toFixed(1)}ms`
  if (msValue < 1000) return `${Math.round(msValue)}ms`
  return `${(msValue / 1000).toFixed(2)}s`
}

function agentName(span: Span | undefined): string | null {
  const value = span?.attributes["gen_ai.agent.name"]
  return typeof value === "string" ? value : null
}

function depthOf(span: Span, byId: Map<string, Span>): number {
  let depth = 0
  let current = span
  const seen = new Set<string>()
  while (current.parent_span_id && !seen.has(current.parent_span_id)) {
    const parent = byId.get(current.parent_span_id)
    if (!parent) break
    seen.add(current.parent_span_id)
    depth += 1
    current = parent
  }
  return depth
}

const RULER_TICKS = [0, 25, 50, 75, 100]

function TagEditor({
  tags,
  onAdd,
  onRemove,
}: {
  tags: string[]
  onAdd: (tag: string) => void
  onRemove: (tag: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const [value, setValue] = useState("")

  function submit() {
    const trimmed = value.trim()
    if (trimmed) onAdd(trimmed)
    setValue("")
    setAdding(false)
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <Badge key={t} variant="outline" className="gap-1 pr-1 text-[10px]">
          {t}
          <button
            onClick={() => onRemove(t)}
            aria-label={`Remove tag ${t}`}
            className="rounded-full p-0.5 hover:bg-muted-foreground/20"
          >
            <X className="size-2.5" />
          </button>
        </Badge>
      ))}
      {adding ? (
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit()
            if (e.key === "Escape") {
              setAdding(false)
              setValue("")
            }
          }}
          onBlur={submit}
          placeholder="tag name"
          className="h-5 w-24 rounded-full border border-input bg-background px-2 text-[10px] outline-none focus:ring-1 focus:ring-ring"
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-0.5 rounded-full border border-dashed border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:border-primary hover:text-primary"
        >
          <Plus className="size-2.5" /> tag
        </button>
      )}
    </div>
  )
}

export function TraceDetail() {
  const { traceId } = useParams<{ traceId: string }>()
  const [spans, setSpans] = useState<Span[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<"waterfall" | "graph">("waterfall")
  const [tags, setTags] = useState<string[]>([])

  useEffect(() => {
    if (!traceId) return
    getTraceSpans(traceId)
      .then(setSpans)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
    getTraceTags(traceId)
      .then((r) => setTags(r.tags))
      .catch(() => {})
  }, [traceId])

  const root = spans.find((s) => s.parent_span_id === null) ?? spans[0]
  const agent = agentName(root)
  const byId = new Map(spans.map((s) => [s.span_id, s]))

  const starts = spans.map((s) => ms(s.start_time))
  const ends = spans.map((s) => (s.end_time ? ms(s.end_time) : ms(s.start_time)))
  const traceStart = starts.length ? Math.min(...starts) : 0
  const traceEnd = ends.length ? Math.max(...ends) : 0
  const totalDuration = Math.max(traceEnd - traceStart, 1)

  const rows = spans
    .slice()
    .sort((a, b) => ms(a.start_time) - ms(b.start_time))
    .map((span) => {
      const start = ms(span.start_time)
      const duration = spanDuration(span)
      const offsetPct = ((start - traceStart) / totalDuration) * 100
      const widthPct = Math.max((duration / totalDuration) * 100, 0.6)
      return {
        span,
        depth: depthOf(span, byId),
        duration,
        offsetPct,
        widthPct,
        isError: span.status_code === "STATUS_CODE_ERROR",
      }
    })

  return (
    <div className="space-y-6">
      <Link
        to="/traces"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Back to traces
      </Link>

      <Card className="bg-card/80">
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-base">{agent ?? root?.name ?? "Trace detail"}</CardTitle>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{traceId}</p>
            {traceId && (
              <TagEditor
                tags={tags}
                onAdd={(t) => addTraceTag(traceId, t).then((r) => setTags(r.tags))}
                onRemove={(t) => removeTraceTag(traceId, t).then((r) => setTags(r.tags))}
              />
            )}
          </div>
          <div className="flex items-center gap-3 text-right text-xs text-muted-foreground">
            <div>
              <div className="font-mono text-sm text-foreground">{formatDuration(totalDuration)}</div>
              <div>total duration</div>
            </div>
            <div>
              <div className="font-mono text-sm text-foreground">{spans.length}</div>
              <div>spans</div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading && <p className="text-sm text-muted-foreground">Loading spans...</p>}
          {error && <p className="text-sm text-destructive">Failed to load trace: {error}</p>}
          {!loading && !error && spans.length === 0 && (
            <p className="text-sm text-muted-foreground">No spans found for this trace.</p>
          )}

          {rows.length > 0 && (
            <div className="inline-flex rounded-full border border-border bg-muted/40 p-1">
              <button
                onClick={() => setView("waterfall")}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  view === "waterfall" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <GanttChartSquare className="size-3.5" /> Waterfall
              </button>
              <button
                onClick={() => setView("graph")}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  view === "graph" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <GitBranch className="size-3.5" /> Graph
              </button>
            </div>
          )}

          {rows.length > 0 && view === "graph" && <TraceGraph spans={spans} />}

          {rows.length > 0 && view === "waterfall" && (
            <div className="overflow-hidden rounded-xl border border-border">
              <div className="grid grid-cols-[minmax(160px,280px)_1fr] border-b border-border bg-muted/50 px-3 py-2">
                <span className="text-xs font-medium text-muted-foreground">Span</span>
                <div className="flex items-center gap-2">
                  <div className="relative h-4 flex-1 text-[10px] text-muted-foreground">
                    {RULER_TICKS.map((pct) => (
                      <span
                        key={pct}
                        className="absolute font-mono"
                        style={{ left: pct === 100 ? undefined : `${pct}%`, right: pct === 100 ? 0 : undefined }}
                      >
                        {formatDuration((totalDuration * pct) / 100)}
                      </span>
                    ))}
                  </div>
                  <span className="w-14 shrink-0" />
                </div>
              </div>

              {rows.map(({ span, depth, duration, offsetPct, widthPct, isError }) => (
                <div
                  key={span.span_id}
                  className="grid grid-cols-[minmax(160px,280px)_1fr] items-center gap-2 border-b border-border/60 px-3 py-2.5 last:border-0 hover:bg-accent/40"
                >
                  <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: depth * 16 }}>
                    <span className={`size-1.5 shrink-0 rounded-full ${isError ? "bg-destructive" : "bg-primary"}`} />
                    <span className="truncate text-sm">{span.name}</span>
                    {isError && (
                      <Badge variant="destructive" className="shrink-0">
                        Error
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative h-5 flex-1">
                      <div
                        className={`absolute inset-y-0 rounded-sm ${isError ? "bg-destructive" : "bg-primary"}`}
                        style={{ left: `${offsetPct}%`, width: `${widthPct}%` }}
                      />
                    </div>
                    <span className="w-14 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
                      {formatDuration(duration)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
