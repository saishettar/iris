// Types mirror collector/iris_collector/db.py's list_traces() / get_trace_spans()
// row shapes exactly (RealDictCursor columns), not an independently invented contract.

export interface TraceSummary {
  trace_id: string
  first_seen_at: string
  span_count: number
  agent_name: string | null
  service_name: string | null
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

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4318"

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`)
  if (!res.ok) {
    throw new Error(`API request failed: ${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

export interface TraceFilters {
  model?: string
  agent?: string
  since?: string
  until?: string
  hasError?: boolean
}

export function listTraces(limit = 50, filters: TraceFilters = {}): Promise<TraceSummary[]> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (filters.model) params.set("model", filters.model)
  if (filters.agent) params.set("agent", filters.agent)
  if (filters.since) params.set("since", filters.since)
  if (filters.until) params.set("until", filters.until)
  if (filters.hasError !== undefined) params.set("has_error", String(filters.hasError))
  return apiFetch<TraceSummary[]>(`/traces?${params.toString()}`)
}

export function getTraceSpans(traceId: string): Promise<Span[]> {
  return apiFetch<Span[]>(`/traces/${encodeURIComponent(traceId)}`)
}

export interface Annotation {
  id: string
  trace_id: string
  verdict: "good" | "bad"
  note: string | null
  created_at: string
}

export function listAnnotations(traceId: string): Promise<Annotation[]> {
  return apiFetch<Annotation[]>(`/traces/${encodeURIComponent(traceId)}/annotations`)
}

export async function addAnnotation(
  traceId: string,
  verdict: "good" | "bad",
  note?: string
): Promise<Annotation> {
  const res = await fetch(`${API_BASE_URL}/traces/${encodeURIComponent(traceId)}/annotations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ verdict, note: note || undefined }),
  })
  if (!res.ok) {
    throw new Error(`API request failed: ${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<Annotation>
}

// Plain text, not JSON -- a paste-ready YAML snippet, not a structured
// resource. Throws the collector's real "content wasn't captured" message
// on 404 rather than a generic HTTP error, so the UI can show it as-is.
export async function getEvalCaseSnippet(traceId: string): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/traces/${encodeURIComponent(traceId)}/eval-case`)
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.detail ?? `API request failed: ${res.status} ${res.statusText}`)
  }
  return res.text()
}

// Live tail: one real SSE event per trace the moment its spans are queryable
// (collector/iris_collector/live.py broadcasts right after insert_spans()),
// not a poll loop pretending to be live. Returns an unsubscribe function.
export function subscribeToTraceStream(onTrace: (trace: TraceSummary) => void): () => void {
  const source = new EventSource(`${API_BASE_URL}/traces/stream`)
  source.onmessage = (event) => {
    onTrace(JSON.parse(event.data) as TraceSummary)
  }
  return () => source.close()
}

export function listEvalRuns(limit = 50): Promise<EvalRunSummary[]> {
  return apiFetch<EvalRunSummary[]>(`/eval-runs?limit=${limit}`)
}

export interface AgentSummary {
  agent_name: string
  trace_count: number
  error_count: number
  last_seen_at: string
  p50_latency_ms: number | null
  primary_model: string | null
}

export function getAgentSummary(): Promise<AgentSummary[]> {
  return apiFetch<AgentSummary[]>("/agents")
}

export function getEvalRun(runId: string): Promise<EvalResult[]> {
  return apiFetch<EvalResult[]>(`/eval-runs/${encodeURIComponent(runId)}`)
}

export function getMetricsSummary(days = 14): Promise<MetricsSummary> {
  return apiFetch<MetricsSummary>(`/metrics/summary?days=${days}`)
}

export interface OtelTokenUsage {
  model: string
  token_type: string
  total_tokens: number
}

export interface OtelOperationsByHour {
  bucket: string
  operation_count: number
}

export interface OtelMetricsSummary {
  operation_count: number
  avg_duration_s: number | null
  token_usage: OtelTokenUsage[]
  operations_by_hour: OtelOperationsByHour[]
}

export function getOtelMetricsSummary(hours = 24): Promise<OtelMetricsSummary> {
  return apiFetch<OtelMetricsSummary>(`/metrics/otel-summary?hours=${hours}`)
}
