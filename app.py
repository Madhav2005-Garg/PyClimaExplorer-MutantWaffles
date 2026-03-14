"""FastAPI app exposing data processing and agentic storytelling endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from service.agentic.storytelling import ComparisonRequest, StoryRequest, generate_comparison, generate_story
from service.dataProcessing.precipitation import DEFAULT_END as PRECIP_END
from service.dataProcessing.precipitation import DEFAULT_START as PRECIP_START
from service.dataProcessing.precipitation import RegionBounds as PrecipRegion
from service.dataProcessing.precipitation import filter_precipitation_data
from service.dataProcessing.temperature import DEFAULT_END as TEMP_END
from service.dataProcessing.temperature import DEFAULT_START as TEMP_START
from service.dataProcessing.temperature import RegionBounds as TempRegion
from service.dataProcessing.temperature import filter_temperature_data
from service.dataProcessing.windSpeed import DEFAULT_END as WIND_END
from service.dataProcessing.windSpeed import DEFAULT_START as WIND_START
from service.dataProcessing.windSpeed import RegionBounds as WindRegion
from service.dataProcessing.windSpeed import filter_wind_data

app = FastAPI(title="PyClimaExplorer API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Region(BaseModel):
    lat_min: float = -90.0
    lat_max: float = 90.0
    lon_min: float = -180.0
    lon_max: float = 180.0


class DataQuery(BaseModel):
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    region: Optional[Region] = None


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/temperature")
def temperature(query: DataQuery) -> dict:
    try:
        region = query.region or Region()
        region_model = TempRegion(**region.model_dump())
        return filter_temperature_data(
            start_date=query.start_date or TEMP_START,
            end_date=query.end_date or TEMP_END,
            region=region_model,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/precipitation")
def precipitation(query: DataQuery) -> dict:
    try:
        region = query.region or Region()
        region_model = PrecipRegion(**region.model_dump())
        return filter_precipitation_data(
            start_date=query.start_date or PRECIP_START,
            end_date=query.end_date or PRECIP_END,
            region=region_model,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/wind")
def wind(query: DataQuery) -> dict:
    try:
        region = query.region or Region()
        region_model = WindRegion(**region.model_dump())
        return filter_wind_data(
            start_date=query.start_date or WIND_START,
            end_date=query.end_date or WIND_END,
            region=region_model,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/story")
def story(request: StoryRequest) -> dict:
    try:
        text = generate_story(request)
        return {"story": text}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/story/compare")
def story_compare(request: ComparisonRequest) -> dict:
    try:
        text = generate_comparison(request)
        return {"story": text}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
