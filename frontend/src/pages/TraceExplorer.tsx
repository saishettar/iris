import { useEffect, useState } from "react"
import { Search } from "lucide-react"
import { Link } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getMetricsSummary, listTraces, type TraceSummary } from "@/lib/api"

// Ported from v0's "Trace explorer" card (part of its combined Traces tab).
// v0's mock rows also had name/latency/cost columns, but GET /traces (db.py's
// list_traces) only returns trace_id/first_seen_at/span_count -- there's no
// per-trace name/cost rollup yet, so those columns are still dropped rather
// than faked. Filtering is real though: model/time-range/error-status all
// hit the collector's actual query params.

const TIME_RANGES = [
  { label: "All time", hours: null },
  { label: "Last 24h", hours: 24 },
  { label: "Last 7d", hours: 24 * 7 },
  { label: "Last 30d", hours: 24 * 30 },
] as const

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function TraceExplorer() {
  const [traces, setTraces] = useState<TraceSummary[]>([])
  const [models, setModels] = useState<string[]>([])
  const [query, setQuery] = useState("")
  const [model, setModel] = useState("")
  const [rangeHours, setRangeHours] = useState<number | null>(null)
  const [errorsOnly, setErrorsOnly] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getMetricsSummary()
      .then((m) => setModels(m.model_usage.map((row) => row.model)))
      .catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    const since = rangeHours ? new Date(Date.now() - rangeHours * 3600_000).toISOString() : undefined
    listTraces(50, { model: model || undefined, since, hasError: errorsOnly ? true : undefined })
      .then(setTraces)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [model, rangeHours, errorsOnly])

  const filtered = traces.filter((trace) => trace.trace_id.toLowerCase().includes(query.toLowerCase()))

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-primary">Iris workspace</p>
        <h1 className="text-3xl font-semibold tracking-tight">Traces</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Inspect requests ingested by the collector.
        </p>
      </div>

      <Card className="border-border/70 bg-card/70 shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Trace explorer</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">Click a trace to see its span detail.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by trace id..."
                className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
              />
            </div>

            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">All models</option>
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            <select
              value={rangeHours ?? ""}
              onChange={(e) => setRangeHours(e.target.value ? Number(e.target.value) : null)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              {TIME_RANGES.map((r) => (
                <option key={r.label} value={r.hours ?? ""}>
                  {r.label}
                </option>
              ))}
            </select>

            <label className="flex h-9 items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={errorsOnly}
                onChange={(e) => setErrorsOnly(e.target.checked)}
                className="size-4 rounded border-input"
              />
              Errors only
            </label>
          </div>

          {loading && <p className="text-sm text-muted-foreground">Loading traces...</p>}
          {error && (
            <p className="text-sm text-destructive">
              Failed to load traces from the collector: {error}
            </p>
          )}
          {!loading && !error && filtered.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {query || model || rangeHours || errorsOnly
                ? "No traces match these filters."
                : "No traces yet -- instrument a call path with iris_otel and check back."}
            </p>
          )}

          <div className="space-y-2">
            {filtered.map((trace) => (
              <Link
                key={trace.trace_id}
                to={`/traces/${trace.trace_id}`}
                className="flex items-center justify-between rounded-md border border-border/60 p-4 text-left transition-colors hover:bg-accent"
              >
                <div>
                  <div className="font-mono text-sm font-medium">{trace.trace_id}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{timeAgo(trace.first_seen_at)}</div>
                </div>
                <Badge variant="secondary">{trace.span_count} spans</Badge>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
