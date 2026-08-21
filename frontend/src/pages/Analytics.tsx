import { Activity, BarChart3, Gauge, Workflow } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

// TODO: everything below is mock data, ported as-is from v0 (merging its
// Overview tab's stats/charts with its Analytics tab's charts -- both were
// "aggregate metrics" content, just split across two tabs in the original).
// Wire to real data once the collector exposes an aggregate-metrics endpoint:
// GET /traces today only returns per-trace span counts, not latency/cost/error
// rollups or time-series buckets. Do not guess at that endpoint's shape here.

function Stat({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string
  value: string
  detail: string
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
        <div className="flex items-end justify-between gap-2">
          <span className="font-mono text-2xl font-semibold tracking-tight">{value}</span>
          <span className="text-xs text-primary">{detail}</span>
        </div>
      </CardContent>
    </Card>
  )
}

const TRACE_VOLUME = [
  34, 48, 42, 60, 55, 72, 68, 82, 74, 88, 79, 96, 82, 90, 68, 77, 58, 64, 82, 71, 88, 97, 73, 84,
]

const MODEL_USAGE: [string, string, string][] = [
  ["GPT-4o", "48%", "bg-primary"],
  ["Claude 3.5 Sonnet", "29%", "bg-chart-2"],
  ["GPT-4o mini", "16%", "bg-chart-3"],
  ["Gemini 1.5 Pro", "7%", "bg-chart-4"],
]

const LATENCY_SERIES = [38, 44, 52, 46, 63, 57, 72, 68, 80, 75, 91, 84]

const COST_BY_MODEL: [string, string, string][] = [
  ["GPT-4o", "$612.40", "48%"],
  ["Claude 3.5 Sonnet", "$371.20", "29%"],
  ["Gemini 1.5 Pro", "$178.90", "14%"],
  ["Other", "$121.50", "9%"],
]

export function Analytics() {
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-primary">
            Iris workspace
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Analytics</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Explore aggregate cost, latency, and usage.
          </p>
        </div>
        <Badge variant="outline">Mock data</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Stat label="Traces today" value="18,429" detail="+12.4%" icon={Activity} />
        <Stat label="Avg. latency" value="1.84s" detail="-8.2%" icon={Gauge} />
        <Stat label="Total cost" value="$284.12" detail="+4.1%" icon={BarChart3} />
        <Stat label="Error rate" value="0.42%" detail="-0.18%" icon={Workflow} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="border-border/70 bg-card/70 shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Trace volume</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Requests across all environments</p>
          </CardHeader>
          <CardContent>
            <div className="flex h-56 items-end gap-2 border-b border-border/60 px-2 pt-5">
              {TRACE_VOLUME.map((height, index) => (
                <div
                  key={index}
                  className="flex-1 bg-primary/75 transition-colors hover:bg-primary"
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>
            <div className="mt-3 flex justify-between text-xs text-muted-foreground">
              <span>00:00</span>
              <span>06:00</span>
              <span>12:00</span>
              <span>18:00</span>
              <span>Now</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/70 shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Model usage</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Token share by model</p>
          </CardHeader>
          <CardContent className="space-y-5">
            {MODEL_USAGE.map(([name, percent, color]) => (
              <div key={name}>
                <div className="mb-2 flex justify-between text-sm">
                  <span>{name}</span>
                  <span className="font-mono text-muted-foreground">{percent}</span>
                </div>
                <div className="h-2 bg-muted">
                  <div className={`h-full ${color}`} style={{ width: percent }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/70 shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Latency distribution</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">P50, P95, and P99 by day</p>
          </CardHeader>
          <CardContent>
            <div className="flex h-56 items-end gap-3 border-b border-border/60">
              {LATENCY_SERIES.map((height, index) => (
                <div key={index} className="flex h-full flex-1 items-end gap-1">
                  <div className="w-1/2 bg-primary/60" style={{ height: `${height}%` }} />
                  <div className="w-1/2 bg-chart-3/70" style={{ height: `${Math.max(20, height - 18)}%` }} />
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-between text-xs text-muted-foreground">
              <span>Aug 10</span>
              <span>Aug 21</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/70 shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Cost by model</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Monthly spend allocation</p>
          </CardHeader>
          <CardContent className="space-y-5">
            {COST_BY_MODEL.map(([name, cost, share]) => (
              <div
                key={name}
                className="flex items-center justify-between border-b border-border/50 pb-4 last:border-0"
              >
                <div>
                  <div className="text-sm font-medium">{name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{share} of total</div>
                </div>
                <span className="font-mono text-sm">{cost}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
