import { useEffect, useState } from "react"
import { MessagesSquare } from "lucide-react"
import { Link } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { getSessionSummary, type SessionSummary } from "@/lib/api"

// One row per distinct session.id (db.get_session_summary() -- an app-set
// span attribute on the root span, same convention Langfuse's SDKs use for
// grouping multi-turn conversations). A trace with no session.id simply
// isn't part of any session and doesn't show up here; there's no fallback
// identity the way agent_name falls back to service_name, since grouping
// unrelated traces under a guessed session would misrepresent which turns
// actually belong together.

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function formatSpan(session: SessionSummary): string {
  if (session.first_seen_at === session.last_seen_at) return timeAgo(session.first_seen_at)
  const first = new Date(session.first_seen_at)
  const last = new Date(session.last_seen_at)
  const spanMs = last.getTime() - first.getTime()
  const spanMinutes = Math.round(spanMs / 60000)
  if (spanMinutes < 1) return `${timeAgo(session.last_seen_at)} · under a minute`
  if (spanMinutes < 60) return `${timeAgo(session.last_seen_at)} · ${spanMinutes}m span`
  return `${timeAgo(session.last_seen_at)} · ${Math.round(spanMinutes / 60)}h span`
}

export function Sessions() {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getSessionSummary()
      .then(setSessions)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sessions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Traces grouped by <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">session.id</code>{" "}
          -- set it on the root span to group an agent's multi-turn conversations.
        </p>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading sessions...</p>}
      {error && <p className="text-sm text-destructive">Failed to load sessions: {error}</p>}
      {!loading && !error && sessions.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No sessions yet -- pass <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">**{"{"}"session.id": "..."{"}"}"</code>{" "}
          to <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">observe()</code> on traces that
          belong to the same conversation.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sessions.map((session) => (
          <Link key={session.session_id} to={`/traces?session=${encodeURIComponent(session.session_id)}`}>
            <Card className="h-full transition-colors hover:bg-accent/40">
              <CardContent className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                      <MessagesSquare className="size-4" />
                    </span>
                    <span className="truncate font-mono text-sm font-medium" title={session.session_id}>
                      {session.session_id}
                    </span>
                  </div>
                  {session.has_error && (
                    <Badge variant="destructive" className="shrink-0">
                      Error
                    </Badge>
                  )}
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{session.agent_name}</span>
                  <span className="font-mono font-medium">{session.trace_count} traces</span>
                </div>

                <div className="border-t border-border/50 pt-3 text-xs text-muted-foreground">
                  {formatSpan(session)}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
