import { useEffect, useState } from "react"
import { ChevronLeft } from "lucide-react"
import { Link, useParams } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getTraceSpans, type Span } from "@/lib/api"

// Real proportional-width waterfall: each span's bar is positioned/sized by
// its actual start offset and duration against the trace's total span, and
// indented by its real parent-child depth -- the flat ordered list this
// replaced was an honest placeholder (v0 never generated this view) but told
// you nothing about overlap, nesting, or where the time actually went.

function ms(iso: string): number {
  return new Date(iso).getTime()
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

function formatDuration(msValue: number): string {
  if (msValue < 10) return `${msValue.toFixed(1)}ms`
  if (msValue < 1000) return `${Math.round(msValue)}ms`
  return `${(msValue / 1000).toFixed(2)}s`
}

export function TraceDetail() {
  const { traceId } = useParams<{ traceId: string }>()
  const [spans, setSpans] = useState<Span[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!traceId) return
    getTraceSpans(traceId)
      .then(setSpans)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
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
      const end = span.end_time ? ms(span.end_time) : start
      const duration = Math.max(end - start, 0)
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
