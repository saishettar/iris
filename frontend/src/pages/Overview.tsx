import { useEffect, useState } from "react"
import { Activity, AlertTriangle, Bot, Gauge, Plug } from "lucide-react"
import { Link } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { getAgentSummary, getMetricsSummary, type AgentSummary } from "@/lib/api"

// Landing page: one card per distinct agent, from a real per-agent SQL
// rollup (GET /agents -- collector/iris_collector/db.py's get_agent_summary()),
// not a client-side group-by over a raw trace dump. Card click deep-links
// into Trace Explorer pre-filtered to that agent.

// One badge tone per agent, cycling through the same chart hues Analytics
// already uses -- real visual variety instead of every card reading identical,
// literal class strings (not template-built) so Tailwind's scanner sees them.
const AGENT_TONES = [
  "bg-primary/15 text-primary",
  "bg-[var(--chart-2)]/15 text-[var(--chart-2)]",
  "bg-[var(--chart-3)]/15 text-[var(--chart-3)]",
  "bg-[var(--chart-4)]/15 text-[var(--chart-4)]",
]

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = max - min || 1
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * 100},${28 - ((v - min) / range) * 24 - 2}`)
    .join(" ")
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="h-7 w-20 shrink-0 overflow-visible">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Stat({
  label,
  value,
  icon: Icon,
  tone,
  trend,
}: {
  label: string
  value: string
  icon: typeof Activity
  tone?: "destructive"
  trend?: number[]
}) {
  return (
    <Card className="bg-card/80">
      <CardContent className="p-5">
        <div className="mb-5 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </span>
          <Icon className={`size-4 ${tone === "destructive" ? "text-destructive" : "text-primary"}`} />
        </div>
        <div className="flex items-end justify-between gap-2">
          <span
            className={`font-mono text-2xl font-semibold tracking-tight ${
              tone === "destructive" ? "text-destructive" : ""
            }`}
          >
            {value}
          </span>
          {trend && <div className="text-primary">{<Sparkline values={trend} />}</div>}
        </div>
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
  const [volumeTrend, setVolumeTrend] = useState<number[]>([])
  const [latencyTrend, setLatencyTrend] = useState<number[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAgentSummary()
      .then(setAgents)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))

    getMetricsSummary()
      .then((m) => {
        setGlobalP50(m.latency_percentiles.p50)
        setVolumeTrend(m.trace_volume.map((d) => d.count))
        setLatencyTrend(m.latency_by_day.map((d) => d.p50))
      })
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
            <Stat label="Traces" value={String(traceTotal)} icon={Activity} trend={volumeTrend} />
            <Stat
              label="Error rate"
              value={`${errorRate.toFixed(1)}%`}
              icon={AlertTriangle}
              tone={errorRate > 0 ? "destructive" : undefined}
            />
            <Stat
              label="P50 latency (all agents)"
              value={formatMs(globalP50)}
              icon={Gauge}
              trend={latencyTrend}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {agents.map((agent, i) => {
              const agentErrorRate =
                agent.trace_count > 0 ? (agent.error_count / agent.trace_count) * 100 : 0
              return (
                <Link key={agent.agent_name} to={`/traces?agent=${encodeURIComponent(agent.agent_name)}`}>
                  <Card className="h-full bg-card/80 transition-colors hover:bg-accent/40">
                    <CardContent className="space-y-4 p-5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className={`flex size-8 shrink-0 items-center justify-center rounded-full ${AGENT_TONES[i % AGENT_TONES.length]}`}
                          >
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

            <Link to="/connect" className="group">
              <Card className="h-full overflow-hidden bg-gradient-to-br from-[#ba181b] to-[#0b090a] shadow-lg shadow-[#660708]/40 ring-1 ring-white/10">
                <CardContent className="flex h-full flex-col justify-between gap-4 p-5">
                  <div>
                    <span className="flex size-8 items-center justify-center rounded-full bg-white/15 text-white">
                      <Plug className="size-4" />
                    </span>
                    <p className="mt-3 text-sm font-semibold text-white">Connect another agent</p>
                    <p className="mt-1 text-xs text-white/70">
                      Three steps, real data flowing here within a minute.
                    </p>
                  </div>
                  <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/95 px-4 py-2 text-xs font-medium text-[#660708] transition-colors group-hover:bg-white">
                    Get started
                  </span>
                </CardContent>
              </Card>
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
