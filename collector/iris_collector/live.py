"""In-process pub/sub for the live-tail SSE stream. One collector process,
one broadcaster -- no external queue needed for a self-hosted single instance.
Each connected dashboard tab holds its own asyncio.Queue; ingest_traces()
publishes real trace summaries to every queue right after a batch of spans
actually lands in Postgres, so a subscriber never sees a trace before it's
queryable through the normal REST endpoints too.
"""
from __future__ import annotations

import asyncio


class TraceBroadcaster:
    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue] = set()

    def subscribe(self) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue()
        self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue) -> None:
        self._subscribers.discard(queue)

    def publish(self, trace: dict) -> None:
        for queue in self._subscribers:
            queue.put_nowait(trace)


broadcaster = TraceBroadcaster()
