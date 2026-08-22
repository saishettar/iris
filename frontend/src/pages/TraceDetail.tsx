import { useEffect, useState } from "react"
import { ChevronLeft } from "lucide-react"
import { Link, useParams } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getTraceSpans, type Span } from "@/lib/api"

// Ported from v0's "Span detail" card. v0 rendered this inline (selection
// state within the same page as the trace list); here it's its own route
// (/traces/:traceId) so a trace is deep-linkable, and it's driven by real
// spans from GET /traces/{trace_id} instead of the mock ["router.resolve",
// "retriever.search", ...] list. It's still a flat ordered list, not a
// proportional-width waterfall -- that's what v0 actually generated.

function durationMs(span: Span): number | null {
  if (!span.end_time) return null
  return new Date(span.end_time).getTime() - new Date(span.start_time).getTime()
}

function agentName(span: Span | undefined): string | null {
  const value = span?.attributes["gen_ai.agent.name"]
  return typeof value === "string" ? value : null
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

  return (
    <div className="space-y-6">
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Back to traces
      </Link>

      <Card className="h-fit border-border/70 bg-card/70 shadow-none">
        <CardHeader>
          <CardTitle className="text-base">{agent ?? "Span detail"}</CardTitle>
          <p className="font-mono text-xs text-muted-foreground">{traceId}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading && <p className="text-sm text-muted-foreground">Loading spans...</p>}
          {error && (
            <p className="text-sm text-destructive">Failed to load trace: {error}</p>
          )}
          {!loading && !error && spans.length === 0 && (
            <p className="text-sm text-muted-foreground">No spans found for this trace.</p>
          )}

          {root && (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
              <div className="text-sm font-medium">{root.name}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Root span · {root.service_name ?? "unknown service"}
                {agent && ` · ${agent}`}
              </div>
            </div>
          )}

          {spans.map((span) => {
            const duration = durationMs(span)
            const isError = span.status_code === "STATUS_CODE_ERROR"
            return (
              <div key={span.span_id} className="flex items-center gap-3 border-l border-primary/50 pl-4">
                <div className={`size-2 rounded-full ${isError ? "bg-destructive" : "bg-primary"}`} />
                <div className="flex-1">
                  <div className="text-sm">{span.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {duration !== null ? `${duration}ms` : "in progress"}
                  </div>
                </div>
                {isError && <Badge variant="destructive">Error</Badge>}
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
