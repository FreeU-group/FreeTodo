"""GPS location reporting and querying endpoints.

Mobile clients POST location fixes here; the center node persists
them and publishes a PerceptionEvent into the perception stream.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Query
from pydantic import BaseModel

from lifetrace.perception.manager import get_perception_manager
from lifetrace.perception.models import Modality, PerceptionEvent, SourceType
from lifetrace.storage.database import location_mgr
from lifetrace.storage.models import LocationRecord
from lifetrace.util.logging_config import get_logger
from lifetrace.util.time_utils import get_utc_now

logger = get_logger()

router = APIRouter(prefix="/api", tags=["location"])


class LocationReportRequest(BaseModel):
    latitude: float
    longitude: float
    altitude: float | None = None
    accuracy: float | None = None
    speed: float | None = None
    heading: float | None = None
    timestamp: datetime | None = None
    source: str = "mobile_gps"


class LocationReportResponse(BaseModel):
    ok: bool
    id: int | None = None


class LocationItem(BaseModel):
    id: int
    timestamp: str
    latitude: float
    longitude: float
    altitude: float | None
    accuracy: float | None
    speed: float | None
    heading: float | None
    source: str


def _record_to_item(r: LocationRecord) -> LocationItem:
    return LocationItem(
        id=r.id or 0,
        timestamp=r.timestamp.isoformat(),
        latitude=r.latitude,
        longitude=r.longitude,
        altitude=r.altitude,
        accuracy=r.accuracy,
        speed=r.speed,
        heading=r.heading,
        source=r.source,
    )


@router.post("/location/report", response_model=LocationReportResponse)
async def report_location(req: LocationReportRequest):
    ts = req.timestamp or get_utc_now()

    record = LocationRecord(
        timestamp=ts,
        latitude=req.latitude,
        longitude=req.longitude,
        altitude=req.altitude,
        accuracy=req.accuracy,
        speed=req.speed,
        heading=req.heading,
        source=req.source,
    )
    saved = location_mgr.add(record)

    acc_str = f" (±{req.accuracy:.0f}m)" if req.accuracy else ""
    content = f"GPS: {req.latitude:.6f}, {req.longitude:.6f}{acc_str}"

    try:
        mgr = get_perception_manager()
        event = PerceptionEvent(
            timestamp=ts,
            source=SourceType.GPS_MOBILE,
            modality=Modality.LOCATION,
            content_text=content,
            metadata={
                "latitude": req.latitude,
                "longitude": req.longitude,
                "altitude": req.altitude,
                "accuracy": req.accuracy,
                "speed": req.speed,
                "heading": req.heading,
                "source": req.source,
            },
        )
        await mgr.publish_event(event)
    except Exception:
        logger.debug("Perception stream not available, location stored to DB only")

    logger.info(f"[location] Stored GPS fix: {content}")
    return LocationReportResponse(ok=True, id=saved.id)


@router.get("/location/latest")
async def get_latest_location():
    record = location_mgr.get_latest()
    if not record:
        return {"ok": False, "error": "no location data"}
    return {"ok": True, "location": _record_to_item(record)}


@router.get("/location/history")
async def get_location_history(
    start: str | None = Query(None, description="开始时间 ISO 8601"),
    end: str | None = Query(None, description="结束时间 ISO 8601"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    start_dt = datetime.fromisoformat(start) if start else None
    end_dt = datetime.fromisoformat(end) if end else None
    records = location_mgr.get_history(start=start_dt, end=end_dt, limit=limit, offset=offset)
    total = location_mgr.count(start=start_dt, end=end_dt)
    return {
        "ok": True,
        "total": total,
        "locations": [_record_to_item(r) for r in records],
    }
