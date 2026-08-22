// Types mirror collector/iris_collector/db.py's list_traces() / get_trace_spans()
// row shapes exactly (RealDictCursor columns), not an independently invented contract.

export interface TraceSummary {
  trace_id: string
  first_seen_at: string
  span_count: number
}

export interface Span {
  span_id: string
  trace_id: string
  parent_span_id: string | null
  name: string
  service_name: string | null
  start_time: string
  end_time: string | null
  status_code: string
  attributes: Record<string, unknown>
}

export interface EvalRunSummary {
  run_id: string
  suite_target: string
  version_tag: string | null
  created_at: string
  test_count: number
  passed_count: number
}

export interface AssertionResult {
  assertion_type: string
  passed: boolean
  detail: string
}

export interface EvalResult {
  result_id: string
  run_id: string
  description: string
  passed: boolean
  latency_ms: number
  assertion_results: AssertionResult[]
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4318"

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`)
  if (!res.ok) {
    throw new Error(`API request failed: ${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

export function listTraces(limit = 50): Promise<TraceSummary[]> {
  return apiFetch<TraceSummary[]>(`/traces?limit=${limit}`)
}

export function getTraceSpans(traceId: string): Promise<Span[]> {
  return apiFetch<Span[]>(`/traces/${encodeURIComponent(traceId)}`)
}

export function listEvalRuns(limit = 50): Promise<EvalRunSummary[]> {
  return apiFetch<EvalRunSummary[]>(`/eval-runs?limit=${limit}`)
}

export function getEvalRun(runId: string): Promise<EvalResult[]> {
  return apiFetch<EvalResult[]>(`/eval-runs/${encodeURIComponent(runId)}`)
}
