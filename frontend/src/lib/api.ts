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

export interface TraceVolumeDay {
  day: string
  count: number
}

export interface ModelUsage {
  model: string
  count: number
  input_tokens: number
  output_tokens: number
  cost_usd: number | null
}

export interface LatencyPercentiles {
  p50: number | null
  p95: number | null
  p99: number | null
}

export interface LatencyByDay {
  day: string
  p50: number
}

export interface MetricsSummary {
  trace_volume: TraceVolumeDay[]
  model_usage: ModelUsage[]
  latency_percentiles: LatencyPercentiles
  latency_by_day: LatencyByDay[]
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4318"

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`)
  if (!res.ok) {
    throw new Error(`API request failed: ${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

export interface TraceFilters {
  model?: string
  since?: string
  until?: string
  hasError?: boolean
}

export function listTraces(limit = 50, filters: TraceFilters = {}): Promise<TraceSummary[]> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (filters.model) params.set("model", filters.model)
  if (filters.since) params.set("since", filters.since)
  if (filters.until) params.set("until", filters.until)
  if (filters.hasError !== undefined) params.set("has_error", String(filters.hasError))
  return apiFetch<TraceSummary[]>(`/traces?${params.toString()}`)
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

export function getMetricsSummary(days = 14): Promise<MetricsSummary> {
  return apiFetch<MetricsSummary>(`/metrics/summary?days=${days}`)
}
