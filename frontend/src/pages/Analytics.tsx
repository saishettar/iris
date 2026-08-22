import { useEffect, useState } from "react"
import { Activity, Gauge } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getMetricsSummary, type MetricsSummary } from "@/lib/api"

// Wired to GET /metrics/summary. No "cost by model" card here -- there's no
// pricing table backing gen_ai.usage.input_tokens/output_tokens, so cost
// isn't faked; that's a real gap, not an oversight (see the card below).

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
    <Card className="border-border/70 bg-card/70 shadow-none">
      <CardContent className="p-5">
        <div className="mb-5 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
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

export function Analytics() {
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getMetricsSummary()
      .then(setMetrics)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const traceCount = metrics?.trace_volume.reduce((sum, d) => sum + d.count, 0) ?? 0
  const maxVolume = Math.max(1, ...(metrics?.trace_volume.map((d) => d.count) ?? [1]))
  const modelTotal = metrics?.model_usage.reduce((sum, m) => sum + m.count, 0) ?? 0
  const percentiles = metrics?.latency_percentiles ?? { p50: null, p95: null, p99: null }
  const maxPercentile = Math.max(1, percentiles.p50 ?? 0, percentiles.p95 ?? 0, percentiles.p99 ?? 0)

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-primary">
          Iris workspace
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Analytics</h1>
        <p className="mt-2 text-sm text-muted-foreground">
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
            <Card className="border-border/70 bg-card/70 shadow-none">
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
                          className="flex-1 bg-primary/75 transition-colors hover:bg-primary"
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

            <Card className="border-border/70 bg-card/70 shadow-none">
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
                          <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
                        </div>
                      </div>
                    )
                  })
                )}
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-card/70 shadow-none">
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
                          className="w-full bg-primary/75"
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

            <Card className="border-border/70 bg-card/70 shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Cost by model</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">Monthly spend allocation</p>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Not tracked yet -- token counts are captured per span
                  (<code>gen_ai.usage.*</code>), but there's no model pricing
                  table to convert them to cost. A real number here needs that
                  table, not a guess.
                </p>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
