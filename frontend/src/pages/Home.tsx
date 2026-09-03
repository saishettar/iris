import { useEffect, useState } from "react"
import { Activity } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  getAgentSummary,
  getMetricsSummary,
  listEvalRuns,
  type AgentSummary,
  type EvalRunSummary,
  type MetricsSummary,
} from "@/lib/api"

// Langfuse's real "Home" layout (pinned by the user's screenshot): a
// chart-forward grid rather than Overview's per-agent cards -- Overview
// keeps its own role at "/". Two real fields Langfuse's Home shows that
// Iris has no equivalent for are translated rather than invented:
// "Observations by type" (a Langfuse log-level concept) becomes spans by
// type, using the real gen_ai.* span kinds Iris tracks (chat/execute_tool/
// invoke_agent); "Scores" becomes eval pass-rate, since Iris has no named
// numeric per-trace score yet (that's what the Scores page adds).

const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"]

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function formatCost(usd: number | null): string {
  if (usd === null) return "not priced"
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`
}

function TextTabs({
  options,
  value,
  onChange,
}: {
  options: string[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-4 border-b border-border">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`-mb-px border-b-2 px-0.5 pb-2 text-sm transition-colors ${
            value === opt
              ? "border-foreground font-medium text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

// Shared multi-series day chart: renders one polyline per series, a dot when
// a series has exactly one day of history (this project's own demo data is
// routinely single-day -- see DESIGN.md's single-day chart pattern), and an
// honest empty state rather than a flat line when there's nothing at all.
function MultiLineChart({
  days,
  series,
}: {
  days: string[]
  series: { label: string; color: string; values: (number | null)[] }[]
}) {
  if (days.length === 0) {
    return <p className="text-sm text-muted-foreground">No data yet.</p>
  }
  const allValues = series.flatMap((s) => s.values.filter((v): v is number => v !== null))
  const max = Math.max(1, ...allValues)
  const w = 100
  const h = 44
  const x = (i: number) => (days.length > 1 ? (i / (days.length - 1)) * w : w / 2)
  const y = (v: number) => h - (v / max) * (h - 4) - 2

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-2 shrink-0 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-40 w-full overflow-visible">
        {series.map((s) => {
          const points = s.values
            .map((v, i) => (v === null ? null : `${x(i)},${y(v)}`))
            .filter((p): p is string => p !== null)
          if (points.length >= 2) {
            return (
              <polyline
                key={s.label}
                points={points.join(" ")}
                fill="none"
                stroke={s.color}
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )
          }
          return s.values.map((v, i) =>
            v === null ? null : <circle key={i} cx={x(i)} cy={y(v)} r="1.8" fill={s.color} />
          )
        })}
      </svg>
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span>{formatDay(days[0])}</span>
        {days.length > 1 && <span>{formatDay(days[days.length - 1])}</span>}
      </div>
    </div>
  )
}

export function Home() {
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null)
  const [agents, setAgents] = useState<AgentSummary[]>([])
  const [runs, setRuns] = useState<EvalRunSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [latencyTab, setLatencyTab] = useState<"p50" | "p75" | "p90">("p50")
  const [usageTab, setUsageTab] = useState<"usage" | "cost">("usage")

  useEffect(() => {
    Promise.all([getMetricsSummary(), getAgentSummary(), listEvalRuns()])
      .then(([m, a, r]) => {
        setMetrics(m)
        setAgents(a)
        setRuns(r)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Aggregate model, span, and eval activity across every connected agent.
        </p>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {error && <p className="text-sm text-destructive">Failed to load: {error}</p>}

      {metrics && (
        <>
          <div className="grid gap-6 xl:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Model latencies</CardTitle>
              </CardHeader>
              <CardContent>
                <TextTabs
                  options={["50th Percentile", "75th Percentile", "90th Percentile"]}
                  value={
                    latencyTab === "p50" ? "50th Percentile" : latencyTab === "p75" ? "75th Percentile" : "90th Percentile"
                  }
                  onChange={(v) => setLatencyTab(v.startsWith("50") ? "p50" : v.startsWith("75") ? "p75" : "p90")}
                />
                <div className="mt-4">
                  {(() => {
                    const models = Array.from(new Set(metrics.latency_by_model_day.map((r) => r.model)))
                    const days = Array.from(new Set(metrics.latency_by_model_day.map((r) => r.day))).sort()
                    if (models.length === 0) return <p className="text-sm text-muted-foreground">No chat spans yet.</p>
                    return (
                      <MultiLineChart
                        days={days}
                        series={models.map((model, i) => ({
                          label: model,
                          color: CHART_COLORS[i % CHART_COLORS.length],
                          values: days.map((day) => {
                            const row = metrics.latency_by_model_day.find((r) => r.day === day && r.model === model)
                            return row ? row[latencyTab] : null
                          }),
                        }))}
                      />
                    )
                  })()}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Model usage</CardTitle>
              </CardHeader>
              <CardContent>
                <TextTabs
                  options={["Usage by model", "Cost by model"]}
                  value={usageTab === "usage" ? "Usage by model" : "Cost by model"}
                  onChange={(v) => setUsageTab(v.startsWith("Usage") ? "usage" : "cost")}
                />
                <div className="mt-4 space-y-4">
                  {metrics.model_usage.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No chat spans yet.</p>
                  ) : (
                    metrics.model_usage.map((m) => {
                      const total = metrics.model_usage.reduce((sum, row) => sum + row.count, 0)
                      const percent = total ? Math.round((m.count / total) * 100) : 0
                      return (
                        <div key={m.model}>
                          <div className="mb-2 flex justify-between text-sm">
                            <span>{m.model}</span>
                            <span className="font-mono text-muted-foreground">
                              {usageTab === "usage" ? `${percent}%` : formatCost(m.cost_usd)}
                            </span>
                          </div>
                          <div className="h-2 bg-muted">
                            <div
                              className="h-full bg-[var(--chart-1)]"
                              style={{ width: usageTab === "usage" ? `${percent}%` : "100%" }}
                            />
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Spans by type</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Real gen_ai.* span kinds, not Langfuse's observation levels
                </p>
              </CardHeader>
              <CardContent>
                {(() => {
                  const types = Array.from(new Set(metrics.spans_by_type_by_day.map((r) => r.name)))
                  const days = Array.from(new Set(metrics.spans_by_type_by_day.map((r) => r.day))).sort()
                  if (types.length === 0) return <p className="text-sm text-muted-foreground">No spans yet.</p>
                  return (
                    <MultiLineChart
                      days={days}
                      series={types.map((name, i) => ({
                        label: name,
                        color: CHART_COLORS[i % CHART_COLORS.length],
                        values: days.map((day) => {
                          const row = metrics.spans_by_type_by_day.find((r) => r.day === day && r.name === name)
                          return row ? row.count : null
                        }),
                      }))}
                    />
                  )
                })()}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Model costs</CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const priced = metrics.model_usage.filter((m) => m.cost_usd !== null)
                  const total = priced.reduce((sum, m) => sum + (m.cost_usd ?? 0), 0)
                  return (
                    <div className="mb-5">
                      <div className="font-mono text-2xl font-semibold tracking-tight">
                        {priced.length > 0 ? formatCost(total) : "not priced"}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Total costs {priced.length < metrics.model_usage.length && metrics.model_usage.length > 0 && "(some models unpriced)"}
                      </div>
                    </div>
                  )
                })()}
                {metrics.model_usage.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No chat spans yet.</p>
                ) : (
                  <div className="space-y-1">
                    <div className="grid grid-cols-3 gap-2 border-b border-border pb-2 text-xs uppercase tracking-wide text-muted-foreground">
                      <span>Model</span>
                      <span className="text-right">Tokens</span>
                      <span className="text-right">USD</span>
                    </div>
                    {metrics.model_usage.map((m) => (
                      <div key={m.model} className="grid grid-cols-3 gap-2 border-b border-border/50 py-2 text-sm last:border-0">
                        <span className="truncate">{m.model}</span>
                        <span className="text-right font-mono text-xs">
                          {(m.input_tokens + m.output_tokens).toLocaleString()}
                        </span>
                        <span className="text-right font-mono text-xs">{formatCost(m.cost_usd)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Traces</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-5">
                  <div className="font-mono text-2xl font-semibold tracking-tight">
                    {agents.reduce((sum, a) => sum + a.trace_count, 0)}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">Total traces tracked</div>
                </div>
                {agents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No agents yet.</p>
                ) : (
                  <div className="space-y-3">
                    {agents.map((a) => {
                      const max = Math.max(1, ...agents.map((row) => row.trace_count))
                      return (
                        <div key={a.agent_name} className="flex items-center gap-3 text-sm">
                          <span className="w-28 shrink-0 truncate">{a.agent_name}</span>
                          <div className="h-2 flex-1 bg-muted">
                            <div
                              className="h-full bg-[var(--chart-1)]"
                              style={{ width: `${(a.trace_count / max) * 100}%` }}
                            />
                          </div>
                          <span className="w-10 shrink-0 text-right font-mono text-xs text-muted-foreground">
                            {a.trace_count}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Eval results</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">Latest run per suite -- see Regression for trends</p>
              </CardHeader>
              <CardContent>
                <div className="mb-5 flex items-center gap-2">
                  <Activity className="size-4 text-primary" />
                  <div className="font-mono text-2xl font-semibold tracking-tight">{runs.length}</div>
                  <span className="text-xs text-muted-foreground">runs tracked</span>
                </div>
                {runs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No eval runs yet.</p>
                ) : (
                  <div className="space-y-3">
                    {Array.from(new Set(runs.map((r) => r.suite_target))).map((suite) => {
                      const latest = runs.find((r) => r.suite_target === suite)!
                      const percent = latest.test_count ? Math.round((latest.passed_count / latest.test_count) * 100) : 0
                      return (
                        <div key={suite} className="flex items-center gap-3 text-sm">
                          <span className="w-28 shrink-0 truncate font-mono text-xs">{suite}</span>
                          <div className="h-2 flex-1 bg-muted">
                            <div className="h-full bg-[var(--chart-4)]" style={{ width: `${percent}%` }} />
                          </div>
                          <span className="w-16 shrink-0 text-right font-mono text-xs text-muted-foreground">
                            {latest.passed_count}/{latest.test_count}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
