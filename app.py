"""FastAPI app exposing data processing and agentic storytelling endpoints."""

from __future__ import annotations

import json
import os
from datetime import datetime
from typing import Optional
from dotenv import load_dotenv

load_dotenv("service/agentic/.env")

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from geopy.geocoders import Nominatim
from google import genai

from service.agentic.storytelling import ComparisonRequest, StoryRequest
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
    lon_max: float = 360.0


class DataQuery(BaseModel):
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    region: Optional[Region] = None


class GeocodeRequest(BaseModel):
    query: str

@app.post("/api/geocode")
def geocode(request: GeocodeRequest) -> dict:
    try:
        geolocator = Nominatim(user_agent="pyclimaexplorer_1.0")
        location = geolocator.geocode(request.query)
        if not location:
            raise HTTPException(status_code=404, detail="Location not found")
        # Define a small bounded box around the coordinate just for default querying
        offset = 5.0
        return {
            "lat": location.latitude,
            "lon": location.longitude,
            "display_name": location.address,
            "bounding_box": {
                "lat_min": location.latitude - offset,
                "lat_max": location.latitude + offset,
                "lon_min": location.longitude - offset,
                "lon_max": location.longitude + offset,
            }
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

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


def _get_gemini_client() -> genai.Client:
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY or GOOGLE_API_KEY is required for Gemini access")
    return genai.Client(api_key=api_key)


def _call_gemini(prompt: str, model: str = "gemini-1.5-flash") -> str:
    client = _get_gemini_client()
    resp = client.models.generate_content(model=model, contents=prompt)
    return resp.text or ""


def _build_story_prompt(request: StoryRequest) -> str:
    stats_lines = [f"- {k}: {v}" for k, v in (request.statistics or {}).items()] or ["- (no stats provided)"]
    preview_lines = [f"- {item.get('year')}: {item.get('value')}" for item in (request.time_series_preview or [])] or [
        "- (no time-series preview provided)"
    ]
    region = request.region_name or "the selected region"
    start = request.start_year or "(unknown)"
    end = request.end_year or "(unknown)"
    return "\n".join(
        [
            "You are a concise climate analyst. Output ONLY JSON: {\"story\": str, \"risk_score\": int, \"trend\": str, \"events\": [str]}",
            f"Variable: {request.variable}",
            f"Dataset: {request.dataset or '(unspecified)'}",
            f"Region: {region}",
            f"Time range: {start} to {end}",
            "Statistics:",
            *stats_lines,
            "Time series preview (year:value):",
            *preview_lines,
            "Constraints: keep story 3-5 sentences, trend one short phrase, events list up to 3 items, risk_score 1-10.",
        ]
    )


def _build_comparison_prompt(request: ComparisonRequest) -> str:
    stats_a = [f"- {k}: {v}" for k, v in (request.stats_a or {}).items()] or ["- (no stats for A)"]
    stats_b = [f"- {k}: {v}" for k, v in (request.stats_b or {}).items()] or ["- (no stats for B)"]
    preview_a = [f"- {item.get('year')}: {item.get('value')}" for item in (request.time_series_a or [])] or ["- (no series A)"]
    preview_b = [f"- {item.get('year')}: {item.get('value')}" for item in (request.time_series_b or [])] or ["- (no series B)"]
    start = request.start_year or "(unknown)"
    end = request.end_year or "(unknown)"
    return "\n".join(
        [
            "You are a concise climate analyst. Output ONLY JSON: {\"story\": str, \"risk_score\": int, \"trend\": str, \"events\": [str]}",
            f"Variable: {request.variable}",
            f"Time range: {start} to {end}",
            "Location A:",
            f"- Name: {request.location_a}",
            "- Stats:",
            *stats_a,
            "- Time series preview:",
            *preview_a,
            "Location B:",
            f"- Name: {request.location_b}",
            "- Stats:",
            *stats_b,
            "- Time series preview:",
            *preview_b,
            "Constraints: keep story 3-5 sentences, trend one short phrase, events list up to 3 items, risk_score 1-10.",
        ]
    )

@app.post("/api/story")
def story(request: StoryRequest) -> dict:
    try:
        prompt = _build_story_prompt(request)
        text = _call_gemini(prompt)
        try:
            parsed = json.loads(text)
            return parsed
        except json.JSONDecodeError:
            return {"story": text, "risk_score": None}
    except Exception as exc:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/story/compare")
def story_compare(request: ComparisonRequest) -> dict:
    try:
        prompt = _build_comparison_prompt(request)
        text = _call_gemini(prompt)
        try:
            parsed = json.loads(text)
            return parsed
        except json.JSONDecodeError:
            return {"story": text, "risk_score": None}
    except Exception as exc:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(exc)) from exc


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
