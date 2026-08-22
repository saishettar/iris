"""OTLP KeyValue-list -> dict parsing, shared by trace and metric parsing --
the attribute wire format is identical across every OTel signal."""
from __future__ import annotations


def attr_value(value):
    kind = value.WhichOneof("value")
    if kind is None:
        return None
    if kind == "array_value":
        return [attr_value(v) for v in value.array_value.values]
    if kind == "kvlist_value":
        return {kv.key: attr_value(kv.value) for kv in value.kvlist_value.values}
    return getattr(value, kind)


def attrs_to_dict(attrs) -> dict:
    return {kv.key: attr_value(kv.value) for kv in attrs}
