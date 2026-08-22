"""Threshold-based alerting (Datadog Monitors): an in-process background
loop, not a cron job or a fake "scheduled" abstraction -- the collector is
already a single long-running process, so a real asyncio loop checking real
DB aggregates on an interval is the honest way to do this here.
"""
from __future__ import annotations

import asyncio
import logging
import os

import httpx

from . import db

logger = logging.getLogger("iris.collector.alerts")

CHECK_INTERVAL_S = int(os.environ.get("IRIS_ALERT_CHECK_INTERVAL_S", "60"))


async def alert_loop() -> None:
    while True:
        try:
            await check_all_rules()
        except Exception:
            logger.exception("alert rule check failed")
        await asyncio.sleep(CHECK_INTERVAL_S)


async def check_all_rules() -> None:
    for rule in db.list_alert_rules():
        if not rule["enabled"]:
            continue

        value = db.evaluate_alert_rule(rule)
        if value is None:
            continue  # no data in the window yet -- not the same as "0", see evaluate_alert_rule
        if value <= rule["threshold"]:
            continue
        if db.recently_fired(rule["id"], rule["window_minutes"]):
            continue

        message = (
            f"{rule['name']}: {rule['metric']} is {value:.2f} "
            f"(threshold {rule['threshold']}, last {rule['window_minutes']}m)"
        )
        db.record_alert_event(rule["id"], value, message)
        logger.warning("alert fired: %s", message)
        if rule["webhook_url"]:
            await _send_webhook(rule, value, message)


async def _send_webhook(rule: dict, value: float, message: str) -> None:
    payload = {
        "text": message,  # Slack incoming webhooks read this key directly
        "rule": rule["name"],
        "metric": rule["metric"],
        "value": value,
        "threshold": rule["threshold"],
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(rule["webhook_url"], json=payload)
            response.raise_for_status()
    except Exception:
        logger.exception("webhook delivery failed for rule %s", rule["name"])
