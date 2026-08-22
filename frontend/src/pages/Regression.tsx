import { useEffect, useState } from "react"
import { Activity, CheckCircle2, GitCompare } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getEvalRun, listEvalRuns, type EvalResult, type EvalRunSummary } from "@/lib/api"

// Wired to the real /eval-runs endpoints (see eval/ and collector's
// eval_runs/eval_results tables). Shows the latest run's results -- with
// only one run typically posted so far, a real production-vs-candidate
// diff isn't meaningful yet; that's the natural next step once multiple
// version-tagged runs exist to compare.

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

export function Regression() {
  const [runs, setRuns] = useState<EvalRunSummary[]>([])
  const [results, setResults] = useState<EvalResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listEvalRuns()
      .then(async (fetchedRuns) => {
        setRuns(fetchedRuns)
        const latest = fetchedRuns[0]
        if (latest) {
          setResults(await getEvalRun(latest.run_id))
        }
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const latest = runs[0]

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-primary">
            Iris workspace
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Regression</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Eval results from iris-eval runs posted to the collector.
          </p>
        </div>
        {latest && <Badge variant="outline">{latest.suite_target}</Badge>}
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading eval runs...</p>}
      {error && (
        <p className="text-sm text-destructive">
          Failed to load eval runs from the collector: {error}
        </p>
      )}
      {!loading && !error && runs.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No eval runs yet -- run <code>iris-eval suite.yaml --out results.json</code> and POST
          the output to <code>/eval-runs</code>.
        </p>
      )}

      {latest && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Stat label="Latest run" value={latest.version_tag ?? "untagged"} icon={GitCompare} />
            <Stat
              label="Tests passed"
              value={`${latest.passed_count}/${latest.test_count}`}
              icon={CheckCircle2}
            />
            <Stat label="Total runs" value={String(runs.length)} icon={Activity} />
          </div>

          <Card className="border-border/70 bg-card/70 shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Latest run results</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {new Date(latest.created_at).toLocaleString()}
              </p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-left">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-[0.12em] text-muted-foreground">
                      <th className="pb-3 font-medium">Test</th>
                      <th className="pb-3 font-medium">Status</th>
                      <th className="pb-3 font-medium">Latency</th>
                      <th className="pb-3 font-medium">Assertions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((result) => (
                      <tr key={result.result_id} className="border-b border-border/50 text-sm last:border-0">
                        <td className="py-4 font-medium">{result.description}</td>
                        <td className="py-4">
                          <Badge variant={result.passed ? "secondary" : "destructive"}>
                            {result.passed ? "Pass" : "Fail"}
                          </Badge>
                        </td>
                        <td className="py-4 font-mono text-muted-foreground">
                          {result.latency_ms.toFixed(0)}ms
                        </td>
                        <td className="py-4 text-xs text-muted-foreground">
                          {result.assertion_results.map((a) => a.assertion_type).join(", ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
