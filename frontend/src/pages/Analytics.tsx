import { useEffect, useState } from "react"
import { Activity, Gauge } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  getMetricsSummary,
  getOtelMetricsSummary,
  type MetricsSummary,
  type OtelMetricsSummary,
} from "@/lib/api"

// Wired to GET /metrics/summary. Cost-by-model comes from the collector's
// pricing.py table, which is empty by default -- a model without a real,
// verified entry there shows as "not priced" rather than a guessed number.
//
// The charts above the "OTel Metrics" heading are all computed by custom SQL
// over span data. The section below it is a genuinely separate signal: real
// gen_ai.client.operation.duration/token.usage Histogram instruments,
// exported over OTLP and ingested via POST /v1/metrics into their own
// metric_points table (GET /metrics/otel-summary). Kept visually distinct
// rather than merged into the cards above, since conflating "derived from
// spans" and "a real second OTel signal" would misrepresent which is which.

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon: typeof Activity
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-5 flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </span>
          <Icon className="size-4 text-primary" />
        </div>
        <span className="font-mono text-2xl font-semibold tracking-tight">{value}</span>
      </CardContent>
    </Card>
  )
}

function formatMs(ms: number | null): string {
  if (ms === null) return "--"
  return ms < 1000 ? `${ms.toFixed(0)}ms` : `${(ms / 1000).toFixed(2)}s`
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function formatCost(usd: number | null): string {
  if (usd === null) return "not priced"
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`
}

function formatHour(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
}

export function Analytics() {
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [otel, setOtel] = useState<OtelMetricsSummary | null>(null)
  const [otelError, setOtelError] = useState<string | null>(null)
  const [otelLoading, setOtelLoading] = useState(true)

  useEffect(() => {
    getMetricsSummary()
      .then(setMetrics)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))

    getOtelMetricsSummary()
      .then(setOtel)
      .catch((err: Error) => setOtelError(err.message))
      .finally(() => setOtelLoading(false))
  }, [])

  const traceCount = metrics?.trace_volume.reduce((sum, d) => sum + d.count, 0) ?? 0
  const maxVolume = Math.max(1, ...(metrics?.trace_volume.map((d) => d.count) ?? [1]))
  const modelTotal = metrics?.model_usage.reduce((sum, m) => sum + m.count, 0) ?? 0
  const maxDailyP50 = Math.max(1, ...(metrics?.latency_by_day.map((d) => d.p50) ?? [1]))
  const percentiles = metrics?.latency_percentiles ?? { p50: null, p95: null, p99: null }
  const maxPercentile = Math.max(1, percentiles.p50 ?? 0, percentiles.p95 ?? 0, percentiles.p99 ?? 0)
  const maxHourlyOps = Math.max(1, ...(otel?.operations_by_hour.map((b) => b.operation_count) ?? [1]))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Aggregate volume, latency, and model usage from real span data.
        </p>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading metrics...</p>}
      {error && (
        <p className="text-sm text-destructive">
          Failed to load metrics from the collector: {error}
        </p>
      )}

      {metrics && (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Stat label="Traces (14d)" value={String(traceCount)} icon={Activity} />
            <Stat label="P50 latency" value={formatMs(percentiles.p50)} icon={Gauge} />
            <Stat label="P95 latency" value={formatMs(percentiles.p95)} icon={Gauge} />
            <Stat label="P99 latency" value={formatMs(percentiles.p99)} icon={Gauge} />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Trace volume</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">Traces per day, last 14 days</p>
              </CardHeader>
              <CardContent>
                {metrics.trace_volume.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No traces yet -- instrument a call path and check back.
                  </p>
                ) : (
                  <>
                    <div className="flex h-56 items-end gap-2 border-b border-border/60 px-2 pt-5">
                      {metrics.trace_volume.map((d) => (
                        <div
                          key={d.day}
                          className="max-w-12 flex-1 bg-[var(--chart-1)]/75 transition-colors hover:bg-[var(--chart-1)]"
                          style={{ height: `${(d.count / maxVolume) * 100}%` }}
                          title={`${formatDay(d.day)}: ${d.count}`}
                        />
                      ))}
                    </div>
                    <div className="mt-3 flex justify-between text-xs text-muted-foreground">
                      <span>{formatDay(metrics.trace_volume[0].day)}</span>
                      <span>{formatDay(metrics.trace_volume[metrics.trace_volume.length - 1].day)}</span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Model usage</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">Chat-span share by model</p>
              </CardHeader>
              <CardContent className="space-y-5">
                {metrics.model_usage.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No chat spans yet.</p>
                ) : (
                  metrics.model_usage.map((m) => {
                    const percent = modelTotal ? Math.round((m.count / modelTotal) * 100) : 0
                    return (
                      <div key={m.model}>
                        <div className="mb-2 flex justify-between text-sm">
                          <span>{m.model}</span>
                          <span className="font-mono text-muted-foreground">{percent}%</span>
                        </div>
                        <div className="h-2 bg-muted">
                          <div className="h-full bg-[var(--chart-1)]" style={{ width: `${percent}%` }} />
                        </div>
                      </div>
                    )
                  })
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Latency percentiles</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">Across all chat spans</p>
              </CardHeader>
              <CardContent>
                {percentiles.p50 === null ? (
                  <p className="text-sm text-muted-foreground">No completed chat spans yet.</p>
                ) : (
                  <div className="flex h-56 items-end gap-6 border-b border-border/60 px-4 pt-5">
                    {(["p50", "p95", "p99"] as const).map((key) => (
                      <div key={key} className="flex flex-1 flex-col items-center gap-2">
                        <div
                          className="w-full bg-[var(--chart-1)]/75"
                          style={{ height: `${((percentiles[key] ?? 0) / maxPercentile) * 180}px` }}
                        />
                        <span className="text-xs uppercase text-muted-foreground">{key}</span>
                        <span className="font-mono text-xs">{formatMs(percentiles[key])}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Latency over time</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">P50 per day, last 14 days</p>
              </CardHeader>
              <CardContent>
                {metrics.latency_by_day.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No completed chat spans yet.</p>
                ) : (
                  <>
                    <div className="flex h-56 items-end gap-2 border-b border-border/60 px-2 pt-5">
                      {metrics.latency_by_day.map((d) => (
                        <div
                          key={d.day}
                          className="max-w-12 flex-1 bg-[var(--chart-1)]/75 transition-colors hover:bg-[var(--chart-1)]"
                          style={{ height: `${(d.p50 / maxDailyP50) * 100}%` }}
                          title={`${formatDay(d.day)}: ${formatMs(d.p50)}`}
                        />
                      ))}
                    </div>
                    <div className="mt-3 flex justify-between text-xs text-muted-foreground">
                      <span>{formatDay(metrics.latency_by_day[0].day)}</span>
                      <span>
                        {formatDay(metrics.latency_by_day[metrics.latency_by_day.length - 1].day)}
                      </span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Cost by model</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  From real token counts; needs pricing.py filled in per model
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {metrics.model_usage.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No chat spans yet.</p>
                ) : (
                  metrics.model_usage.map((m) => (
                    <div
                      key={m.model}
                      className="flex items-center justify-between border-b border-border/50 pb-4 last:border-0"
                    >
                      <div>
                        <div className="text-sm font-medium">{m.model}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {m.input_tokens.toLocaleString()} in / {m.output_tokens.toLocaleString()} out
                        </div>
                      </div>
                      <span
                        className={`font-mono text-sm ${m.cost_usd === null ? "text-muted-foreground" : ""}`}
                      >
                        {formatCost(m.cost_usd)}
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <div>
            <div className="mb-4 flex items-center gap-3">
              <h2 className="text-lg font-semibold tracking-tight">OTel Metrics</h2>
              <Badge variant="outline">gen_ai.client.* histograms</Badge>
            </div>

            {otelLoading && <p className="text-sm text-muted-foreground">Loading OTel metrics...</p>}
            {otelError && (
              <p className="text-sm text-destructive">
                Failed to load OTel metrics from the collector: {otelError}
              </p>
            )}

            {otel && (
              <div className="grid gap-6 xl:grid-cols-2">
                <div className="grid gap-4 xl:col-span-2 md:grid-cols-2">
                  <Stat
                    label="Operations recorded"
                    value={String(otel.operation_count)}
                    icon={Activity}
                  />
                  <Stat label="Avg duration" value={formatMs((otel.avg_duration_s ?? 0) * 1000)} icon={Gauge} />
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Operations per hour</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      From gen_ai.client.operation.duration data points, last 24h
                    </p>
                  </CardHeader>
                  <CardContent>
                    {otel.operations_by_hour.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No OTel metric points yet -- instrument a call path and check back.
                      </p>
                    ) : (
                      <>
                        <div className="flex h-40 items-end gap-2 border-b border-border/60 px-2 pt-5">
                          {otel.operations_by_hour.map((b) => (
                            <div
                              key={b.bucket}
                              className="max-w-12 flex-1 bg-[var(--chart-1)]/75 transition-colors hover:bg-[var(--chart-1)]"
                              style={{ height: `${(b.operation_count / maxHourlyOps) * 100}%` }}
                              title={`${formatHour(b.bucket)}: ${b.operation_count}`}
                            />
                          ))}
                        </div>
                        <div className="mt-3 flex justify-between text-xs text-muted-foreground">
                          <span>{formatHour(otel.operations_by_hour[0].bucket)}</span>
                          <span>
                            {formatHour(otel.operations_by_hour[otel.operations_by_hour.length - 1].bucket)}
                          </span>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Token usage</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      From gen_ai.client.token.usage data points, by model and type
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {otel.token_usage.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No token usage recorded yet.</p>
                    ) : (
                      otel.token_usage.map((row) => (
                        <div
                          key={`${row.model}-${row.token_type}`}
                          className="flex items-center justify-between border-b border-border/50 pb-3 last:border-0"
                        >
                          <div>
                            <span className="text-sm font-medium">{row.model}</span>
                            <span className="ml-2 text-xs text-muted-foreground">{row.token_type}</span>
                          </div>
                          <span className="font-mono text-sm">{row.total_tokens.toLocaleString()}</span>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
