"""Flatten an OTLP ExportMetricsServiceRequest into histogram data-point
rows ready for storage. Only histogram points are handled -- that's the
only OTel metric instrument type iris_otel emits."""
from __future__ import annotations

from datetime import datetime, timezone

from .otlp_attrs import attrs_to_dict


def _ns_to_dt(nanos: int) -> datetime:
    return datetime.fromtimestamp(nanos / 1e9, tz=timezone.utc)


def extract_histogram_points(otlp_request) -> list[dict]:
    rows = []
    for resource_metrics in otlp_request.resource_metrics:
        for scope_metrics in resource_metrics.scope_metrics:
            for metric in scope_metrics.metrics:
                if metric.WhichOneof("data") != "histogram":
                    continue
                for dp in metric.histogram.data_points:
                    rows.append(
                        {
                            "metric_name": metric.name,
                            "attributes": attrs_to_dict(dp.attributes),
                            "count": dp.count,
                            "sum_value": dp.sum,
                            "min_value": dp.min if dp.HasField("min") else None,
                            "max_value": dp.max if dp.HasField("max") else None,
                            "recorded_at": _ns_to_dt(dp.time_unix_nano),
                        }
                    )
    return rows
