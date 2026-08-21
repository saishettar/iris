"""Flatten an OTLP ExportTraceServiceRequest into span rows ready for storage."""
from __future__ import annotations

from datetime import datetime, timezone

from opentelemetry.proto.trace.v1.trace_pb2 import Status as StatusProto


def _attr_value(value):
    kind = value.WhichOneof("value")
    if kind is None:
        return None
    if kind == "array_value":
        return [_attr_value(v) for v in value.array_value.values]
    if kind == "kvlist_value":
        return {kv.key: _attr_value(kv.value) for kv in value.kvlist_value.values}
    return getattr(value, kind)


def _attrs_to_dict(attrs) -> dict:
    return {kv.key: _attr_value(kv.value) for kv in attrs}


def _ns_to_dt(nanos: int) -> datetime | None:
    if not nanos:
        return None
    return datetime.fromtimestamp(nanos / 1e9, tz=timezone.utc)


def extract_spans(otlp_request) -> list[dict]:
    rows = []
    for resource_spans in otlp_request.resource_spans:
        service_name = _attrs_to_dict(resource_spans.resource.attributes).get("service.name")

        for scope_spans in resource_spans.scope_spans:
            for span in scope_spans.spans:
                rows.append(
                    {
                        "span_id": span.span_id.hex(),
                        "trace_id": span.trace_id.hex(),
                        "parent_span_id": span.parent_span_id.hex() if span.parent_span_id else None,
                        "name": span.name,
                        "service_name": service_name,
                        "start_time": _ns_to_dt(span.start_time_unix_nano),
                        "end_time": _ns_to_dt(span.end_time_unix_nano),
                        "status_code": StatusProto.StatusCode.Name(span.status.code),
                        "attributes": _attrs_to_dict(span.attributes),
                    }
                )
    return rows
