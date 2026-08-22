import { useEffect, useState } from "react"
import { CheckCircle2, ExternalLink, Loader2 } from "lucide-react"
import { Link } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { API_BASE_URL, listTraces, type TraceSummary } from "@/lib/api"

// New onboarding surface: the real answer to "how do I connect my own agent
// to this," in-app rather than buried in the README only. Every snippet and
// env var here is the actual SDK surface (sdk/iris_otel), not an invented
// API -- see README.md's Usage section, which this mirrors.

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-4 font-mono text-[13px] leading-relaxed text-foreground">
      <code>{children}</code>
    </pre>
  )
}

function StepNumber({ n }: { n: number }) {
  return (
    <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 font-mono text-xs font-medium text-primary">
      {n}
    </div>
  )
}

const INSTALL_SNIPPET = `# from a sibling checkout (matches how nyu-rag / undercut do it)
pip install -e ../iris/sdk

# or, from anywhere, straight off the repo
pip install "git+https://github.com/saishettar/iris.git#subdirectory=sdk"`

const INSTRUMENT_SNIPPET = `from iris_otel import observe, trace_llm_call
from iris_otel.presets import anthropic_usage, anthropic_finish_reason

@trace_llm_call(
    model="claude-sonnet-5",
    extract_usage=anthropic_usage,
    extract_finish_reasons=anthropic_finish_reason,
)
def call_claude(**kwargs):
    return client.messages.create(**kwargs)

with observe("invoke_agent", **{"gen_ai.agent.name": "my-agent"}):
    call_claude(messages=[...])`

const ENV_SNIPPET = `# .env, or exported in your shell
IRIS_OTLP_ENDPOINT=${API_BASE_URL}/v1/traces
IRIS_SERVICE_NAME=my-agent   # keeps you distinguishable from other agents`

export function Connect() {
  const [traces, setTraces] = useState<TraceSummary[]>([])
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    let cancelled = false
    const poll = () => {
      listTraces(1)
        .then((rows) => {
          if (!cancelled) {
            setTraces(rows)
            setChecked(true)
          }
        })
        .catch(() => {
          if (!cancelled) setChecked(true)
        })
    }
    poll()
    const interval = setInterval(poll, 4000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  const connected = traces.length > 0
  const latest = traces[0]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Connect your agent</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Instrumentation is code-level, not a network proxy -- three steps and any Python
          LLM/agent call starts exporting real OTel spans to this collector.
        </p>
      </div>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <Card className="border-border/70 bg-card/70 shadow-none">
            <CardHeader className="flex flex-row items-center gap-3 space-y-0">
              <StepNumber n={1} />
              <CardTitle className="text-base">Install the SDK</CardTitle>
            </CardHeader>
            <CardContent>
              <CodeBlock>{INSTALL_SNIPPET}</CodeBlock>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/70 shadow-none">
            <CardHeader className="flex flex-row items-center gap-3 space-y-0">
              <StepNumber n={2} />
              <CardTitle className="text-base">Point it at this collector</CardTitle>
            </CardHeader>
            <CardContent>
              <CodeBlock>{ENV_SNIPPET}</CodeBlock>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/70 shadow-none">
            <CardHeader className="flex flex-row items-center gap-3 space-y-0">
              <StepNumber n={3} />
              <CardTitle className="text-base">Wrap the call</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">trace_llm_call</code> wraps
                sync or async functions and captures{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">gen_ai.*</code> spans plus
                real duration/token histograms.{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">observe</code> wraps a
                broader unit of work, like an agent's full turn.
              </p>
              <CodeBlock>{INSTRUMENT_SNIPPET}</CodeBlock>
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <Card className="border-border/70 bg-card/70 shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Connection status</CardTitle>
            </CardHeader>
            <CardContent>
              {!checked ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Checking the collector...
                </div>
              ) : connected ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-success">
                    <CheckCircle2 className="size-4" /> Trace received
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Latest from{" "}
                    <span className="font-mono text-foreground">
                      {latest.agent_name ?? latest.service_name ?? "an instrumented app"}
                    </span>
                  </p>
                  <Link
                    to={`/traces/${latest.trace_id}`}
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    View it in Trace Explorer <ExternalLink className="size-3.5" />
                  </Link>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Waiting for your first trace...
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/70 shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Real examples</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Two other real projects instrumented this way, not synthetic demos.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <a
                href="https://github.com/saishettar/nyu-rag"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2.5 text-sm hover:bg-accent/60"
              >
                <span>
                  <span className="font-medium">nyu-rag</span>
                  <span className="ml-2 text-xs text-muted-foreground">single-call RAG answer</span>
                </span>
                <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
              </a>
              <a
                href="https://github.com/saishettar/undercut"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2.5 text-sm hover:bg-accent/60"
              >
                <span>
                  <span className="font-medium">undercut</span>
                  <span className="ml-2 text-xs text-muted-foreground">async tool-use agent</span>
                </span>
                <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
              </a>
            </CardContent>
          </Card>

          <Badge variant="outline" className="font-mono">
            {API_BASE_URL}
          </Badge>
        </div>
      </div>
    </div>
  )
}
