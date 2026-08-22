import { useEffect, useMemo, useState } from "react"
import { Activity, CheckCircle2, GitCompare } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getEvalRun, listEvalRuns, type EvalResult, type EvalRunSummary } from "@/lib/api"

// Wired to the real /eval-runs endpoints (see eval/ and collector's
// eval_runs/eval_results tables). Candidate defaults to the latest run;
// baseline defaults to the next-most-recent run with the same suite_target,
// if one exists, so two runs of genuinely different suites don't get
// compared by default. Diffs by test description, not position, since
// runs can add/remove test cases between versions.

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

function RunSelect({
  label,
  value,
  onChange,
  options,
  allowNone,
}: {
  label: string
  value: string
  onChange: (id: string) => void
  options: EvalRunSummary[]
  allowNone?: boolean
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs uppercase tracking-[0.1em] text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
      >
        {allowNone && <option value="">(none)</option>}
        {options.map((run) => (
          <option key={run.run_id} value={run.run_id}>
            {run.version_tag ?? run.run_id.slice(0, 8)} · {new Date(run.created_at).toLocaleDateString()}
          </option>
        ))}
      </select>
    </label>
  )
}

type Change = "new" | "removed" | "regressed" | "fixed" | "unchanged"

function classifyChange(baseline: EvalResult | undefined, candidate: EvalResult | undefined): Change {
  if (!baseline && candidate) return "new"
  if (baseline && !candidate) return "removed"
  if (baseline && candidate) {
    if (baseline.passed === candidate.passed) return "unchanged"
    return candidate.passed ? "fixed" : "regressed"
  }
  return "unchanged"
}

const CHANGE_LABEL: Record<Change, string> = {
  new: "New",
  removed: "Removed",
  regressed: "Regressed",
  fixed: "Fixed",
  unchanged: "No change",
}

const CHANGE_VARIANT: Record<Change, "secondary" | "destructive" | "outline"> = {
  new: "outline",
  removed: "outline",
  regressed: "destructive",
  fixed: "secondary",
  unchanged: "outline",
}

export function Regression() {
  const [runs, setRuns] = useState<EvalRunSummary[]>([])
  const [candidateId, setCandidateId] = useState("")
  const [baselineId, setBaselineId] = useState("")
  const [candidateResults, setCandidateResults] = useState<EvalResult[]>([])
  const [baselineResults, setBaselineResults] = useState<EvalResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listEvalRuns()
      .then((fetchedRuns) => {
        setRuns(fetchedRuns)
        const latest = fetchedRuns[0]
        if (latest) {
          setCandidateId(latest.run_id)
          const sameTarget = fetchedRuns.find(
            (r) => r.run_id !== latest.run_id && r.suite_target === latest.suite_target
          )
          if (sameTarget) setBaselineId(sameTarget.run_id)
        }
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (candidateId) getEvalRun(candidateId).then(setCandidateResults)
  }, [candidateId])

  useEffect(() => {
    if (baselineId) getEvalRun(baselineId).then(setBaselineResults)
    else setBaselineResults([])
  }, [baselineId])

  const candidateRun = runs.find((r) => r.run_id === candidateId)
  const baselineOptions = runs.filter(
    (r) => r.run_id !== candidateId && r.suite_target === candidateRun?.suite_target
  )

  const diffRows = useMemo(() => {
    const descriptions = Array.from(
      new Set([...baselineResults.map((r) => r.description), ...candidateResults.map((r) => r.description)])
    )
    return descriptions.map((description) => {
      const baseline = baselineResults.find((r) => r.description === description)
      const candidate = candidateResults.find((r) => r.description === description)
      return { description, baseline, candidate, change: classifyChange(baseline, candidate) }
    })
  }, [baselineResults, candidateResults])

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-primary">
            Iris workspace
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Regression</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Compare eval runs from iris-eval posted to the collector.
          </p>
        </div>
        {candidateRun && <Badge variant="outline">{candidateRun.suite_target}</Badge>}
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

      {candidateRun && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Stat
              label="Candidate"
              value={candidateRun.version_tag ?? "untagged"}
              icon={GitCompare}
            />
            <Stat
              label="Tests passed"
              value={`${candidateRun.passed_count}/${candidateRun.test_count}`}
              icon={CheckCircle2}
            />
            <Stat label="Total runs" value={String(runs.length)} icon={Activity} />
          </div>

          <Card className="border-border/70 bg-card/70 shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Regression comparison</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {baselineId
                  ? "Baseline compared against candidate, by test description."
                  : baselineOptions.length === 0
                    ? "No other run of this suite to compare against yet."
                    : "Pick a baseline to compare against."}
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-wrap gap-4">
                <RunSelect
                  label="Baseline"
                  value={baselineId}
                  onChange={setBaselineId}
                  options={baselineOptions}
                  allowNone
                />
                <RunSelect
                  label="Candidate"
                  value={candidateId}
                  onChange={setCandidateId}
                  options={runs}
                />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-left">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-[0.12em] text-muted-foreground">
                      <th className="pb-3 font-medium">Test</th>
                      {baselineId && <th className="pb-3 font-medium">Baseline</th>}
                      <th className="pb-3 font-medium">Candidate</th>
                      {baselineId && <th className="pb-3 font-medium">Change</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {diffRows.map((row) => (
                      <tr key={row.description} className="border-b border-border/50 text-sm last:border-0">
                        <td className="py-4 font-medium">{row.description}</td>
                        {baselineId && (
                          <td className="py-4">
                            {row.baseline ? (
                              <Badge variant={row.baseline.passed ? "secondary" : "destructive"}>
                                {row.baseline.passed ? "Pass" : "Fail"}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">--</span>
                            )}
                          </td>
                        )}
                        <td className="py-4">
                          {row.candidate ? (
                            <Badge variant={row.candidate.passed ? "secondary" : "destructive"}>
                              {row.candidate.passed ? "Pass" : "Fail"}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">--</span>
                          )}
                        </td>
                        {baselineId && (
                          <td className="py-4">
                            <Badge variant={CHANGE_VARIANT[row.change]}>{CHANGE_LABEL[row.change]}</Badge>
                          </td>
                        )}
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
