"""Remote perception event ingestion endpoints.

Sensor nodes POST text-based perception events here;
the center node injects them into the local PerceptionStream.
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from perception.manager import get_perception_manager
from perception.models import (
    PerceptionEvent,  # noqa: TC001 — runtime for FastAPI body parsing
)

router = APIRouter(prefix="/api/perception", tags=["perception-ingest"])


@router.post("/ingest")
async def ingest_event(event: PerceptionEvent):
    mgr = get_perception_manager()
    await mgr.publish_event(event)
    return {"ok": True, "event_id": event.event_id, "sequence_id": event.sequence_id}


class BatchIngestRequest(BaseModel):
    node_id: str = ""
    events: list[PerceptionEvent]


@router.post("/ingest/batch")
async def ingest_batch(req: BatchIngestRequest):
    mgr = get_perception_manager()
    for event in req.events:
        if req.node_id:
            event.metadata.setdefault("node_id", req.node_id)
        await mgr.publish_event(event)
    return {"ok": True, "count": len(req.events)}
