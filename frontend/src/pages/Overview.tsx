import { useEffect, useState } from "react"
import { Activity, AlertTriangle, Bot, Gauge } from "lucide-react"
import { Link } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { getAgentSummary, getMetricsSummary, type AgentSummary } from "@/lib/api"

// Landing page: one card per distinct agent, from a real per-agent SQL
// rollup (GET /agents -- collector/iris_collector/db.py's get_agent_summary()),
// not a client-side group-by over a raw trace dump. Card click deep-links
// into Trace Explorer pre-filtered to that agent.

function Stat({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: string
  icon: typeof Activity
  tone?: "destructive"
}) {
  return (
    <Card className="border-border/70 bg-card/70 shadow-none">
      <CardContent className="p-5">
        <div className="mb-5 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </span>
          <Icon className={`size-4 ${tone === "destructive" ? "text-destructive" : "text-primary"}`} />
        </div>
        <span
          className={`font-mono text-2xl font-semibold tracking-tight ${
            tone === "destructive" ? "text-destructive" : ""
          }`}
        >
          {value}
        </span>
      </CardContent>
    </Card>
  )
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function formatMs(ms: number | null): string {
  if (ms === null) return "--"
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`
}

export function Overview() {
  const [agents, setAgents] = useState<AgentSummary[]>([])
  const [globalP50, setGlobalP50] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAgentSummary()
      .then(setAgents)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))

    getMetricsSummary()
      .then((m) => setGlobalP50(m.latency_percentiles.p50))
      .catch(() => {})
  }, [])

  const traceTotal = agents.reduce((sum, a) => sum + a.trace_count, 0)
  const errorTotal = agents.reduce((sum, a) => sum + a.error_count, 0)
  const errorRate = traceTotal > 0 ? (errorTotal / traceTotal) * 100 : 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every agent that has sent a trace to this collector.
        </p>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading agents...</p>}
      {error && (
        <p className="text-sm text-destructive">Failed to load agent summary: {error}</p>
      )}
      {!loading && !error && agents.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No agents yet -- <Link to="/connect" className="text-primary hover:underline">connect one</Link> and
          check back.
        </p>
      )}

      {agents.length > 0 && (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Stat label="Agents" value={String(agents.length)} icon={Bot} />
            <Stat label="Traces" value={String(traceTotal)} icon={Activity} />
            <Stat
              label="Error rate"
              value={`${errorRate.toFixed(1)}%`}
              icon={AlertTriangle}
              tone={errorRate > 0 ? "destructive" : undefined}
            />
            <Stat label="P50 latency (all agents)" value={formatMs(globalP50)} icon={Gauge} />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {agents.map((agent) => {
              const agentErrorRate =
                agent.trace_count > 0 ? (agent.error_count / agent.trace_count) * 100 : 0
              return (
                <Link key={agent.agent_name} to={`/traces?agent=${encodeURIComponent(agent.agent_name)}`}>
                  <Card className="h-full border-border/70 bg-card/70 shadow-none transition-colors hover:bg-accent/40">
                    <CardContent className="space-y-4 p-5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
                            <Bot className="size-4" />
                          </span>
                          <span className="truncate text-sm font-medium">{agent.agent_name}</span>
                        </div>
                        {agent.primary_model && (
                          <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
                            {agent.primary_model}
                          </Badge>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <div className="font-mono text-lg font-semibold">{agent.trace_count}</div>
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            traces
                          </div>
                        </div>
                        <div>
                          <div
                            className={`font-mono text-lg font-semibold ${
                              agent.error_count > 0 ? "text-destructive" : ""
                            }`}
                          >
                            {agent.error_count}
                          </div>
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            errors
                          </div>
                        </div>
                        <div>
                          <div className="font-mono text-lg font-semibold">
                            {formatMs(agent.p50_latency_ms)}
                          </div>
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            p50
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between border-t border-border/50 pt-3 text-xs text-muted-foreground">
                        <span>{agentErrorRate > 0 ? `${agentErrorRate.toFixed(0)}% error rate` : "healthy"}</span>
                        <span>{timeAgo(agent.last_seen_at)}</span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
