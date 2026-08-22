import { useEffect, useState } from "react"
import { Bell, Trash2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  createAlertRule,
  deleteAlertRule,
  listAlertEvents,
  listAlertRules,
  setAlertRuleEnabled,
  type AlertEvent,
  type AlertMetric,
  type AlertRule,
} from "@/lib/api"

// Threshold-based alerting (Datadog Monitors): a rule watches one real
// metric over a rolling window and fires a webhook when it's breached.
// Evaluated by a real in-process background loop on the collector
// (alerts.py, every IRIS_ALERT_CHECK_INTERVAL_S, default 60s) against the
// same aggregate queries the dashboard itself reads -- not a client-side
// poll pretending to monitor anything.

const METRIC_LABELS: Record<AlertMetric, string> = {
  error_rate: "Error rate",
  latency_p95: "P95 latency",
  cost: "Cost",
}

const METRIC_UNITS: Record<AlertMetric, string> = {
  error_rate: "%",
  latency_p95: "ms",
  cost: "$",
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

export function Alerts() {
  const [rules, setRules] = useState<AlertRule[]>([])
  const [events, setEvents] = useState<AlertEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState("")
  const [metric, setMetric] = useState<AlertMetric>("error_rate")
  const [threshold, setThreshold] = useState("")
  const [windowMinutes, setWindowMinutes] = useState("15")
  const [webhookUrl, setWebhookUrl] = useState("")
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  function refresh() {
    Promise.all([listAlertRules(), listAlertEvents()])
      .then(([r, e]) => {
        setRules(r)
        setEvents(e)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(refresh, [])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const thresholdNum = Number(threshold)
    const windowNum = Number(windowMinutes)
    if (!name.trim() || Number.isNaN(thresholdNum) || Number.isNaN(windowNum)) return

    setCreating(true)
    setCreateError(null)
    createAlertRule({
      name: name.trim(),
      metric,
      threshold: thresholdNum,
      window_minutes: windowNum,
      webhook_url: webhookUrl.trim() || undefined,
    })
      .then((created) => {
        setRules((current) => [created, ...current])
        setName("")
        setThreshold("")
        setWebhookUrl("")
      })
      .catch((err: Error) => setCreateError(err.message))
      .finally(() => setCreating(false))
  }

  function toggle(rule: AlertRule) {
    setAlertRuleEnabled(rule.id, !rule.enabled).then((updated) => {
      setRules((current) => current.map((r) => (r.id === updated.id ? updated : r)))
    })
  }

  function remove(rule: AlertRule) {
    deleteAlertRule(rule.id).then(() => {
      setRules((current) => current.filter((r) => r.id !== rule.id))
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Alerts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Threshold rules over real error rate, latency, and cost -- checked every{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">IRIS_ALERT_CHECK_INTERVAL_S</code>{" "}
          seconds (60 by default) against a rolling window, firing a webhook on breach.
        </p>
      </div>

      <Card className="bg-card/80">
        <CardHeader>
          <CardTitle className="text-base">New rule</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="high error rate"
                className="h-9 w-44 rounded-full border border-input bg-muted/40 px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Metric</label>
              <select
                value={metric}
                onChange={(e) => setMetric(e.target.value as AlertMetric)}
                className="h-9 rounded-full border border-input bg-muted/40 px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                {(Object.keys(METRIC_LABELS) as AlertMetric[]).map((m) => (
                  <option key={m} value={m}>
                    {METRIC_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Threshold ({METRIC_UNITS[metric]})</label>
              <input
                type="number"
                step="any"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                placeholder="5"
                className="h-9 w-24 rounded-full border border-input bg-muted/40 px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Window (min)</label>
              <input
                type="number"
                value={windowMinutes}
                onChange={(e) => setWindowMinutes(e.target.value)}
                className="h-9 w-20 rounded-full border border-input bg-muted/40 px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <label className="text-xs text-muted-foreground">Webhook URL (optional)</label>
              <input
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://hooks.slack.com/..."
                className="h-9 min-w-0 rounded-full border border-input bg-muted/40 px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button
              type="submit"
              disabled={creating}
              className="h-9 shrink-0 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              Create rule
            </button>
          </form>
          {createError && <p className="mt-2 text-sm text-destructive">{createError}</p>}
        </CardContent>
      </Card>

      {loading && <p className="text-sm text-muted-foreground">Loading alerts...</p>}
      {error && <p className="text-sm text-destructive">Failed to load alerts: {error}</p>}

      {!loading && !error && rules.length === 0 && (
        <p className="text-sm text-muted-foreground">No alert rules yet -- create one above.</p>
      )}

      {rules.length > 0 && (
        <Card className="bg-card/80">
          <CardHeader>
            <CardTitle className="text-base">Rules</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <button
                    onClick={() => toggle(rule)}
                    aria-label={rule.enabled ? "Disable rule" : "Enable rule"}
                    className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                      rule.enabled ? "bg-primary" : "bg-muted"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 size-4 rounded-full bg-background transition-transform ${
                        rule.enabled ? "translate-x-[18px]" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{rule.name}</div>
                    <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                      {METRIC_LABELS[rule.metric]} &gt; {rule.threshold}
                      {METRIC_UNITS[rule.metric]} over {rule.window_minutes}m
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {rule.webhook_url && <Badge variant="outline">webhook</Badge>}
                  <button
                    onClick={() => remove(rule)}
                    aria-label="Delete rule"
                    className="rounded-full p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="bg-card/80">
        <CardHeader>
          <CardTitle className="text-base">Recent firings</CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No alerts have fired yet.</p>
          ) : (
            <div className="space-y-2">
              {events.map((event) => (
                <div key={event.id} className="flex items-start gap-2 text-sm">
                  <Bell className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                  <span className="min-w-0 flex-1 text-muted-foreground">{event.message}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(event.fired_at)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
