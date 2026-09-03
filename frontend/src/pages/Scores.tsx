import { useEffect, useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getEvalRun, listEvalRuns, type EvalResult, type EvalRunSummary } from "@/lib/api"

// Langfuse's Scores/Analytics page compares two named numeric scores on
// matched objects (Pearson/Spearman, trend, distribution, heatmap). Iris's
// real eval pipeline had no numeric per-trace score before this pass --
// eval_results only stored a boolean passed/reason (see runner.py/judge.py,
// now updated) -- so this page is real work, not a restyle: iris-eval's
// llm-rubric/answer-relevance assertions now ask the judge for a 0-10 score
// (normalized to 0-1) alongside PASS/FAIL, and an assertion can carry a
// `name:` distinguishing it from another judge assertion on the same test
// case (e.g. two rubric criteria). Two named scores are compared here by
// joining on eval_results.description, the same join key Regression.tsx
// already uses across runs.
//
// "Trend over time" has no continuous production-traffic signal to draw
// from the way Langfuse's does (Iris's scores live on versioned eval runs,
// not live traces) -- translated honestly into average score per historical
// run of the same suite, mirroring Regression's own trend treatment.

const BUCKET_COUNT = 5

function bucketIndex(v: number): number {
  return Math.min(BUCKET_COUNT - 1, Math.floor(v * BUCKET_COUNT))
}

function bucketLabel(i: number): string {
  return `${(i / BUCKET_COUNT).toFixed(1)}-${((i + 1) / BUCKET_COUNT).toFixed(1)}`
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length
}

function stddev(values: number[]): number {
  const m = mean(values)
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)))
}

function pearson(a: number[], b: number[]): number | null {
  if (a.length < 2) return null
  const ma = mean(a)
  const mb = mean(b)
  const cov = mean(a.map((v, i) => (v - ma) * (b[i] - mb)))
  const sa = stddev(a)
  const sb = stddev(b)
  if (sa === 0 || sb === 0) return null
  return cov / (sa * sb)
}

function scoresByName(result: EvalResult): Record<string, number> {
  const out: Record<string, number> = {}
  for (const ar of result.assertion_results) {
    if (ar.name && ar.score !== null && ar.score !== undefined) out[ar.name] = ar.score
  }
  return out
}

export function Scores() {
  const [runs, setRuns] = useState<EvalRunSummary[]>([])
  const [runId, setRunId] = useState("")
  const [results, setResults] = useState<EvalResult[]>([])
  const [suiteRunResults, setSuiteRunResults] = useState<Map<string, EvalResult[]>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [scoreA, setScoreA] = useState("")
  const [scoreB, setScoreB] = useState("")

  useEffect(() => {
    listEvalRuns()
      .then((fetched) => {
        setRuns(fetched)
        if (fetched[0]) setRunId(fetched[0].run_id)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (runId) getEvalRun(runId).then(setResults)
  }, [runId])

  const scoreNames = useMemo(() => {
    const names = new Set<string>()
    for (const r of results) for (const key of Object.keys(scoresByName(r))) names.add(key)
    return Array.from(names).sort()
  }, [results])

  useEffect(() => {
    if (scoreNames.length >= 2 && (!scoreA || !scoreB)) {
      setScoreA(scoreNames[0])
      setScoreB(scoreNames[1])
    }
  }, [scoreNames, scoreA, scoreB])

  const selectedRun = runs.find((r) => r.run_id === runId)

  // Every historical run of this suite -- powers the trend card. Fetched
  // lazily and cached per suite so switching back doesn't re-fetch.
  useEffect(() => {
    if (!selectedRun) return
    const suiteRuns = runs.filter((r) => r.suite_target === selectedRun.suite_target)
    const missing = suiteRuns.filter((r) => !suiteRunResults.has(r.run_id))
    if (missing.length === 0) return
    Promise.all(missing.map((r) => getEvalRun(r.run_id).then((res) => [r.run_id, res] as const))).then(
      (pairs) => {
        setSuiteRunResults((current) => {
          const next = new Map(current)
          for (const [id, res] of pairs) next.set(id, res)
          return next
        })
      }
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRun?.suite_target, runs])

  const matched = useMemo(() => {
    if (!scoreA || !scoreB) return []
    return results
      .map((r) => {
        const scores = scoresByName(r)
        return { description: r.description, a: scores[scoreA], b: scores[scoreB] }
      })
      .filter((row): row is { description: string; a: number; b: number } => row.a !== undefined && row.b !== undefined)
  }, [results, scoreA, scoreB])

  const trend = useMemo(() => {
    if (!selectedRun || !scoreA || !scoreB) return []
    return runs
      .filter((r) => r.suite_target === selectedRun.suite_target)
      .map((r) => {
        const res = suiteRunResults.get(r.run_id)
        if (!res) return null
        const pairs = res
          .map((row) => scoresByName(row))
          .filter((s) => s[scoreA] !== undefined && s[scoreB] !== undefined)
        if (pairs.length === 0) return null
        return {
          run: r,
          avgA: mean(pairs.map((p) => p[scoreA])),
          avgB: mean(pairs.map((p) => p[scoreB])),
        }
      })
      .filter((row): row is { run: EvalRunSummary; avgA: number; avgB: number } => row !== null)
      .sort((x, y) => new Date(x.run.created_at).getTime() - new Date(y.run.created_at).getTime())
  }, [runs, suiteRunResults, selectedRun, scoreA, scoreB])

  const r = pearson(
    matched.map((m) => m.a),
    matched.map((m) => m.b)
  )

  const heatmap = useMemo(() => {
    const grid = Array.from({ length: BUCKET_COUNT }, () => Array(BUCKET_COUNT).fill(0))
    for (const m of matched) grid[bucketIndex(m.a)][bucketIndex(m.b)] += 1
    return grid
  }, [matched])
  const heatmapMax = Math.max(1, ...heatmap.flat())

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Scores</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Compare two named judge scores from an eval run, matched by test case.
          </p>
        </div>
        {selectedRun && (
          <Badge variant="outline" className="font-mono">
            {selectedRun.suite_target}
          </Badge>
        )}
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading eval runs...</p>}
      {error && <p className="text-sm text-destructive">Failed to load eval runs: {error}</p>}
      {!loading && !error && runs.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No eval runs yet -- run <code>iris-eval suite.yaml --out results.json</code> and POST
          the output to <code>/eval-runs</code>.
        </p>
      )}

      {runs.length > 0 && (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 pt-6">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs uppercase tracking-[0.1em] text-muted-foreground">Run</span>
              <select
                value={runId}
                onChange={(e) => setRunId(e.target.value)}
                className="h-9 rounded-full border border-input bg-muted/40 px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                {runs.map((run) => (
                  <option key={run.run_id} value={run.run_id}>
                    {run.version_tag ?? run.run_id.slice(0, 8)} · {new Date(run.created_at).toLocaleDateString()}
                  </option>
                ))}
              </select>
            </label>
            {scoreNames.length >= 2 && (
              <>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-xs uppercase tracking-[0.1em] text-muted-foreground">Score A</span>
                  <select
                    value={scoreA}
                    onChange={(e) => setScoreA(e.target.value)}
                    className="h-9 rounded-full border border-input bg-muted/40 px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
                  >
                    {scoreNames.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-xs uppercase tracking-[0.1em] text-muted-foreground">Score B</span>
                  <select
                    value={scoreB}
                    onChange={(e) => setScoreB(e.target.value)}
                    className="h-9 rounded-full border border-input bg-muted/40 px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
                  >
                    {scoreNames.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {runs.length > 0 && scoreNames.length < 2 && (
        <p className="text-sm text-muted-foreground">
          This run has fewer than two named numeric scores to compare -- give two
          <code className="mx-1 rounded bg-muted px-1 py-0.5 font-mono text-xs">llm-rubric</code>
          or
          <code className="mx-1 rounded bg-muted px-1 py-0.5 font-mono text-xs">answer-relevance</code>
          assertions on the same test case distinct <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">name:</code> values
          in the suite YAML and re-run.
        </p>
      )}

      {scoreA && scoreB && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Statistics</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {scoreA} vs {scoreB}
              </p>
            </CardHeader>
            <CardContent>
              {matched.length === 0 ? (
                <p className="text-sm text-muted-foreground">No test case has both scores yet.</p>
              ) : (
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {scoreA}
                    </div>
                    <div className="flex gap-6">
                      <div>
                        <div className="font-mono text-lg font-semibold">
                          {mean(matched.map((m) => m.a)).toFixed(2)}
                        </div>
                        <div className="text-xs text-muted-foreground">mean</div>
                      </div>
                      <div>
                        <div className="font-mono text-lg font-semibold">
                          {stddev(matched.map((m) => m.a)).toFixed(2)}
                        </div>
                        <div className="text-xs text-muted-foreground">std dev</div>
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {scoreB}
                    </div>
                    <div className="flex gap-6">
                      <div>
                        <div className="font-mono text-lg font-semibold">
                          {mean(matched.map((m) => m.b)).toFixed(2)}
                        </div>
                        <div className="text-xs text-muted-foreground">mean</div>
                      </div>
                      <div>
                        <div className="font-mono text-lg font-semibold">
                          {stddev(matched.map((m) => m.b)).toFixed(2)}
                        </div>
                        <div className="text-xs text-muted-foreground">std dev</div>
                      </div>
                    </div>
                  </div>
                  <div className="col-span-2 border-t border-border pt-4">
                    <div className="flex gap-6">
                      <div>
                        <div className="font-mono text-lg font-semibold">{matched.length}</div>
                        <div className="text-xs text-muted-foreground">matched</div>
                      </div>
                      <div>
                        <div className="font-mono text-lg font-semibold">{r === null ? "--" : r.toFixed(3)}</div>
                        <div className="text-xs text-muted-foreground">pearson r</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Trend over time</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Average score per run of this suite</p>
            </CardHeader>
            <CardContent>
              {trend.length < 2 ? (
                <p className="text-sm text-muted-foreground">Not enough historical runs of this suite yet.</p>
              ) : (
                <>
                  <div className="mb-3 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 shrink-0 rounded-sm bg-[var(--chart-1)]" /> {scoreA}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 shrink-0 rounded-sm bg-[var(--chart-2)]" /> {scoreB}
                    </span>
                  </div>
                  <svg viewBox="0 0 100 44" preserveAspectRatio="none" className="h-40 w-full overflow-visible">
                    {(["avgA", "avgB"] as const).map((key, si) => (
                      <polyline
                        key={key}
                        points={trend
                          .map(
                            (t, i) =>
                              `${(i / (trend.length - 1)) * 100},${44 - t[key] * 40 - 2}`
                          )
                          .join(" ")}
                        fill="none"
                        stroke={si === 0 ? "var(--chart-1)" : "var(--chart-2)"}
                        strokeWidth="1.5"
                        vectorEffect="non-scaling-stroke"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ))}
                  </svg>
                  <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                    <span>{new Date(trend[0].run.created_at).toLocaleDateString()}</span>
                    <span>{new Date(trend[trend.length - 1].run.created_at).toLocaleDateString()}</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              {matched.length === 0 ? (
                <p className="text-sm text-muted-foreground">No matched pairs yet.</p>
              ) : (
                <>
                  <div className="mb-3 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 shrink-0 rounded-sm bg-[var(--chart-1)]" /> {scoreA}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 shrink-0 rounded-sm bg-[var(--chart-2)]" /> {scoreB}
                    </span>
                  </div>
                  <div className="flex h-40 items-end gap-3 border-b border-border/60 px-2">
                    {Array.from({ length: BUCKET_COUNT }).map((_, i) => {
                      const countA = matched.filter((m) => bucketIndex(m.a) === i).length
                      const countB = matched.filter((m) => bucketIndex(m.b) === i).length
                      const max = Math.max(1, ...Array.from({ length: BUCKET_COUNT }, (_, j) =>
                        Math.max(
                          matched.filter((m) => bucketIndex(m.a) === j).length,
                          matched.filter((m) => bucketIndex(m.b) === j).length
                        )
                      ))
                      return (
                        <div key={i} className="flex h-full flex-1 items-end justify-center gap-1">
                          <div
                            className="w-3 bg-[var(--chart-1)]"
                            style={{ height: `${(countA / max) * 100}%` }}
                            title={`${bucketLabel(i)}: ${countA}`}
                          />
                          <div
                            className="w-3 bg-[var(--chart-2)]"
                            style={{ height: `${(countB / max) * 100}%` }}
                            title={`${bucketLabel(i)}: ${countB}`}
                          />
                        </div>
                      )
                    })}
                  </div>
                  <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
                    {Array.from({ length: BUCKET_COUNT }).map((_, i) => (
                      <span key={i}>{bucketLabel(i)}</span>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Score comparison heatmap</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{matched.length} matched pairs</p>
            </CardHeader>
            <CardContent>
              {matched.length === 0 ? (
                <p className="text-sm text-muted-foreground">No matched pairs yet.</p>
              ) : (
                <div className="inline-grid gap-1" style={{ gridTemplateColumns: `repeat(${BUCKET_COUNT}, 1fr)` }}>
                  {heatmap.map((row, ai) =>
                    row.map((count, bi) => (
                      <div
                        key={`${ai}-${bi}`}
                        title={`${scoreA} ${bucketLabel(ai)} × ${scoreB} ${bucketLabel(bi)}: ${count}`}
                        className="size-9 rounded-sm"
                        style={{
                          background: "var(--chart-1)",
                          opacity: count === 0 ? 0.06 : 0.15 + (count / heatmapMax) * 0.85,
                        }}
                      />
                    ))
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
