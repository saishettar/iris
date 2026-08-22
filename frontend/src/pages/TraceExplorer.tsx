import { useEffect, useState } from "react"
import { Search } from "lucide-react"
import { Link, useSearchParams } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  getMetricsSummary,
  listTags,
  listTraces,
  subscribeToTraceStream,
  type TraceSummary,
} from "@/lib/api"

// Ported from v0's "Trace explorer" card (part of its combined Traces tab).
// v0's mock rows also had a latency/cost column, but GET /traces has no
// per-trace cost rollup, so that one's still dropped rather than faked.
// agent_name/service_name (from the root invoke_agent span, if there is
// one) are real though, pulled from db.py's list_traces() and shown as the
// primary label per row -- a bare trace_id told you nothing about which
// agent produced it. Filtering (agent/model/time-range/error-status) all
// hits the collector's actual query params.
//
// Live tail (GET /traces/stream, an SSE feed -- see live.py) prepends real
// arrivals in place of a poll loop, but only while the server-side filters
// are at their defaults: a trace pushed mid-stream can't be checked against
// an active model filter (TraceSummary doesn't carry model), so rather than
// silently show traces that might not match, live tail just pauses and says
// so. The free-text trace-id search stays client-side only and doesn't
// gate it.

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
  const [searchParams] = useSearchParams()
  const [traces, setTraces] = useState<TraceSummary[]>([])
  const [models, setModels] = useState<string[]>([])
  const [agents, setAgents] = useState<string[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [query, setQuery] = useState("")
  const [model, setModel] = useState("")
  const [agent, setAgent] = useState(() => searchParams.get("agent") ?? "")
  const [tag, setTag] = useState("")
  const [session] = useState(() => searchParams.get("session") ?? "")
  const [rangeHours, setRangeHours] = useState<number | null>(null)
  const [errorsOnly, setErrorsOnly] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [liveArrivedIds, setLiveArrivedIds] = useState<Set<string>>(new Set())
  const serverFiltersActive = Boolean(model || agent || tag || session || rangeHours || errorsOnly)

  useEffect(() => {
    getMetricsSummary()
      .then((m) => setModels(m.model_usage.map((row) => row.model)))
      .catch(() => {})
    // Unfiltered, once -- populates the agent select independent of whatever
    // agent filter is currently applied to the main (filtered) fetch below.
    listTraces(200)
      .then((all) => {
        const names = new Set(
          all.map((t) => t.agent_name ?? t.service_name).filter((n): n is string => !!n)
        )
        setAgents(Array.from(names).sort())
      })
      .catch(() => {})
    listTags()
      .then((rows) => setTags(rows.map((r) => r.tag)))
      .catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    const since = rangeHours ? new Date(Date.now() - rangeHours * 3600_000).toISOString() : undefined
    listTraces(50, {
      model: model || undefined,
      agent: agent || undefined,
      tag: tag || undefined,
      session: session || undefined,
      since,
      hasError: errorsOnly ? true : undefined,
    })
      .then(setTraces)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [model, agent, tag, session, rangeHours, errorsOnly])

  useEffect(() => {
    if (serverFiltersActive) return
    return subscribeToTraceStream((incoming) => {
      setTraces((current) => {
        const existingIndex = current.findIndex((t) => t.trace_id === incoming.trace_id)
        if (existingIndex !== -1) {
          const next = current.slice()
          next[existingIndex] = incoming
          return next
        }
        return [incoming, ...current].slice(0, 100)
      })
      setLiveArrivedIds((current) => new Set(current).add(incoming.trace_id))
    })
  }, [serverFiltersActive])

  const filtered = traces.filter((trace) => trace.trace_id.toLowerCase().includes(query.toLowerCase()))

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Traces</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {session ? (
              <>
                Filtered to session <span className="font-mono text-foreground">{session}</span> --{" "}
                <Link to="/sessions" className="text-primary hover:underline">
                  all sessions
                </Link>
              </>
            ) : (
              "Inspect requests ingested by the collector."
            )}
          </p>
        </div>
        {serverFiltersActive ? (
          <span className="text-xs text-muted-foreground">Live tail paused while filtering</span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs font-medium text-success">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-success" />
            </span>
            Live
          </span>
        )}
      </div>

      <Card className="bg-card/80">
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by trace id..."
                className="h-9 w-full rounded-full border border-input bg-muted/40 pl-10 pr-4 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
              />
            </div>

            <select
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
              className="h-9 rounded-full border border-input bg-muted/40 px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">All agents</option>
              {agents.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>

            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="h-9 rounded-full border border-input bg-muted/40 px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">All models</option>
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            <select
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              className="h-9 rounded-full border border-input bg-muted/40 px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">All tags</option>
              {tags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            <select
              value={rangeHours ?? ""}
              onChange={(e) => setRangeHours(e.target.value ? Number(e.target.value) : null)}
              className="h-9 rounded-full border border-input bg-muted/40 px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              {TIME_RANGES.map((r) => (
                <option key={r.label} value={r.hours ?? ""}>
                  {r.label}
                </option>
              ))}
            </select>

            <label className="flex h-9 items-center gap-2 rounded-full border border-transparent px-3 text-sm text-muted-foreground">
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
              {query || serverFiltersActive
                ? "No traces match these filters."
                : "No traces yet -- instrument a call path with iris_otel and check back."}
            </p>
          )}

          <div className="overflow-hidden rounded-xl border border-border">
            {filtered.map((trace, i) => (
              <Link
                key={trace.trace_id}
                to={`/traces/${trace.trace_id}`}
                className={`flex items-center justify-between px-4 py-3 text-left transition-colors hover:bg-accent/60 ${
                  i !== filtered.length - 1 ? "border-b border-border/60" : ""
                } ${liveArrivedIds.has(trace.trace_id) ? "animate-in fade-in slide-in-from-top-2 duration-500" : ""}`}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {trace.agent_name ?? trace.service_name ?? "unnamed agent"}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                    <span className="truncate">
                      {trace.trace_id} <span className="mx-1.5 text-border">·</span>{" "}
                      {timeAgo(trace.first_seen_at)}
                    </span>
                    {trace.tags.map((t) => (
                      <Badge key={t} variant="outline" className="shrink-0 font-sans text-[10px]">
                        {t}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Badge variant="outline" className="ml-3 shrink-0 font-mono">
                  {trace.span_count} spans
                </Badge>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
