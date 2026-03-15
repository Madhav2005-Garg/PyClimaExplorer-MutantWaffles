"""Temperature data filtering utilities."""

from __future__ import annotations

import math
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

import numpy as np
import xarray as xr
from pydantic import BaseModel, Field, model_validator

DATASET_FILENAME = "NOAAGlobalTemp_v6.0.0_gridded_s185001_e202512_c20260107T093746.nc"
DATASET_PATH = Path(__file__).resolve().parents[2] / "data" / DATASET_FILENAME

DEFAULT_START = datetime(1850, 1, 1)
DEFAULT_END = datetime(2025, 12, 31)
GLOBE_POINT_LIMIT = 100000


class RegionBounds(BaseModel):
    """Geographic bounds (in degrees) for filtering the dataset."""

    lat_min: float = Field(-90.0, ge=-90.0, le=90.0)
    lat_max: float = Field(90.0, ge=-90.0, le=90.0)
    lon_min: float = Field(-180.0, ge=-180.0, le=360.0)
    lon_max: float = Field(360.0, ge=-180.0, le=360.0)

    @model_validator(mode="after")
    def validate_bounds(self) -> "RegionBounds":
        if self.lat_min >= self.lat_max:
            raise ValueError("lat_min must be smaller than lat_max")
        if self.lon_min >= self.lon_max:
            raise ValueError("lon_min must be smaller than lon_max")
        return self


class TemperatureQuery(BaseModel):
    """User-provided filters for extracting temperature data."""

    start_date: datetime = Field(default=DEFAULT_START, description="ISO start date")
    end_date: datetime = Field(default=DEFAULT_END, description="ISO end date")
    region: RegionBounds = Field(default_factory=RegionBounds)

    @model_validator(mode="after")
    def validate_dates(self) -> "TemperatureQuery":
        if self.start_date > self.end_date:
            raise ValueError("start_date must be earlier than or equal to end_date")
        return self


@lru_cache(maxsize=1)
def _load_dataset() -> xr.Dataset:
    """Load and cache the NOAA Global Temp dataset."""

    if not DATASET_PATH.exists():
        raise FileNotFoundError(f"Dataset not found at {DATASET_PATH}")
    # Cache the dataset in memory to avoid repeated disk reads when serving API calls.
    return xr.open_dataset(DATASET_PATH)


def _apply_region_filter(ds: xr.Dataset, region: RegionBounds) -> xr.Dataset:
    """Restrict dataset to requested lat/lon bounds irrespective of axis order."""

    filtered = ds
    if "lat" in filtered.coords:
        lat_condition = (filtered["lat"] >= region.lat_min) & (filtered["lat"] <= region.lat_max)
        filtered = filtered.where(lat_condition, drop=True)
    if "lon" in filtered.coords:
        lon_condition = (filtered["lon"] >= region.lon_min) & (filtered["lon"] <= region.lon_max)
        filtered = filtered.where(lon_condition, drop=True)
    return filtered


def _first_data_variable(ds: xr.Dataset) -> str:
    data_vars: Iterable[str] = ds.data_vars
    try:
        return next(iter(data_vars))
    except StopIteration as exc:  # pragma: no cover - defensive guard
        raise ValueError("Dataset does not contain any data variables") from exc


def _time_to_string(value: Any, dtype: Any | None = None) -> str:
    """Convert any time coordinate value to an ISO-like string."""

    if isinstance(value, np.ndarray):
        value = value.item()

    if isinstance(value, np.datetime64):
        dt64 = value
    elif isinstance(value, (np.integer, int)) and dtype is not None and np.issubdtype(dtype, np.datetime64):
        dt64 = np.datetime64(value, dtype)
    elif isinstance(value, (np.integer, int)):
        dt64 = np.datetime64(value, "ns")
    elif hasattr(value, "isoformat"):
        return value.isoformat()
    else:
        return str(value)

    return np.datetime_as_string(dt64, unit="D")


def _time_series_preview(data_array: xr.DataArray) -> List[Dict[str, float]]:
    """Return yearly aggregated regional means covering the entire time range."""

    if "time" not in data_array.dims:
        return []

    reduction_dims = [dim for dim in data_array.dims if dim != "time"]
    regional_mean = data_array
    if reduction_dims:
        regional_mean = data_array.mean(dim=reduction_dims, skipna=True)

    time_coord = regional_mean["time"]
    if time_coord.size == 0 or not hasattr(time_coord, "dt"):
        return []

    try:
        yearly = regional_mean.groupby("time.year").mean(skipna=True)
    except Exception:  # pragma: no cover - guard for exotic calendars
        return []

    preview: List[Dict[str, float]] = []
    for year, val in zip(yearly["year"].values, yearly.values):
        scalar = np.asarray(val).squeeze()
        if np.isnan(scalar):
            continue
        preview.append({"year": int(year), "value": float(scalar)})
    return preview


def _spatial_grid(data_array: xr.DataArray, target_points: int = 40) -> Optional[Dict[str, List[List[float]]]]:
    """Return a coarse lat/lon grid for heatmap visualizations."""

    lat_dim = next((dim for dim in data_array.dims if dim.lower().startswith("lat")), None)
    lon_dim = next((dim for dim in data_array.dims if dim.lower().startswith("lon")), None)
    if lat_dim is None or lon_dim is None:
        return None

    collapsed = data_array
    for dim in list(data_array.dims):
        if dim not in (lat_dim, lon_dim):
            collapsed = collapsed.mean(dim=dim, skipna=True)

    collapsed = collapsed.transpose(lat_dim, lon_dim)
    lat_vals = collapsed[lat_dim].values
    lon_vals = collapsed[lon_dim].values
    if lat_vals.size == 0 or lon_vals.size == 0:
        return None

    lat_step = max(1, lat_vals.size // target_points)
    lon_step = max(1, lon_vals.size // target_points)

    sampled_lats = lat_vals[::lat_step].astype(float).tolist()
    sampled_lons = lon_vals[::lon_step].astype(float).tolist()
    sampled_values = collapsed.values[::lat_step, ::lon_step]
    value_rows = np.asarray(sampled_values, dtype=float).tolist()

    return {"lat": sampled_lats, "lon": sampled_lons, "values": value_rows}


def _globe_points(grid: Optional[Dict[str, List[List[float]]]], limit: int = GLOBE_POINT_LIMIT) -> List[Dict[str, float]]:
    """Flatten the spatial grid into lat/lon/value points for globe rendering."""

    if not grid:
        return []

    latitudes = grid.get("lat") or []
    longitudes = grid.get("lon") or []
    values = grid.get("values") or []

    lat_count = len(latitudes)
    lon_count = len(longitudes)
    if lat_count == 0 or lon_count == 0 or not values:
        return []

    total_cells = lat_count * lon_count
    target = min(limit, total_cells)
    if target <= 0:
        return []

    sample_dim = max(1, int(math.sqrt(target)))
    lat_stride = max(1, int(math.ceil(lat_count / sample_dim)))
    lon_stride = max(1, int(math.ceil(lon_count / sample_dim)))

    points: List[Dict[str, float]] = []
    for i in range(0, lat_count, lat_stride):
        if i >= len(values):
            break
        row = values[i]
        if row is None:
            continue
        for j in range(0, lon_count, lon_stride):
            if j >= len(row):
                break
            val = row[j]
            if np.isnan(val):
                continue
            points.append({"lat": float(latitudes[i]), "lon": float(longitudes[j]), "value": float(val)})
            if len(points) >= limit:
                return points
    return points


def _ensure_datetime(value: datetime | str) -> datetime:
    """Normalize string inputs into datetime objects."""

    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("Dates must be datetime objects or ISO strings") from exc


def _coerce_time_key(time_coord: xr.DataArray, dt_value: datetime) -> Any:
    """Convert datetime into a key compatible with the dataset's time coordinate."""

    values = np.asarray(time_coord.values)
    if getattr(values, "size", 0) == 0:
        return dt_value

    if hasattr(values, "dtype") and np.issubdtype(values.dtype, np.datetime64):
        return np.datetime64(dt_value.isoformat())

    sample = values.flat[0]
    if isinstance(sample, datetime):
        return dt_value

    sample_type = type(sample)
    if sample_type.__module__.startswith("cftime"):
        return sample_type(
            dt_value.year,
            dt_value.month,
            dt_value.day,
            dt_value.hour,
            dt_value.minute,
            dt_value.second,
        )

    return dt_value


def _slice_by_time(dataset: xr.Dataset, start_date: datetime, end_date: datetime) -> xr.Dataset:
    """Slice dataset along the time coordinate using inclusive bounds."""

    if "time" not in dataset.coords:
        return dataset

    time_coord = dataset["time"]
    start_key = _coerce_time_key(time_coord, start_date)
    end_key = _coerce_time_key(time_coord, end_date)

    try:
        return dataset.sel(time=slice(start_key, end_key))
    except Exception:  # pragma: no cover - fallback for exotic calendars
        mask = (time_coord >= start_key) & (time_coord <= end_key)
        return dataset.where(mask, drop=True)


def filter_temperature_data(
    start_date: datetime = DEFAULT_START,
    end_date: datetime = DEFAULT_END,
    region: RegionBounds | None = None,
) -> Dict[str, object]:
    """Slice the NOAA dataset by date and region and return basic statistics."""

    start_date = _ensure_datetime(start_date)
    end_date = _ensure_datetime(end_date)
    if start_date > end_date:
        raise ValueError("start_date must be earlier than or equal to end_date")
    region = region or RegionBounds()
    dataset = _load_dataset()
    sliced = _slice_by_time(dataset, start_date, end_date)
    sliced = _apply_region_filter(sliced, region)

    data_var_name = _first_data_variable(sliced)
    data_array = sliced[data_var_name]
    if data_array.size == 0:
        raise ValueError("No data found for the supplied filters")

    stats = {
        "mean": float(data_array.mean(skipna=True).item()),
        "max": float(data_array.max(skipna=True).item()),
        "min": float(data_array.min(skipna=True).item()),
        "std": float(data_array.std(skipna=True).item()),
    }

    time_range = None
    if "time" in data_array.coords and data_array["time"].size:
        times = data_array["time"].values
        dtype = getattr(times, "dtype", None)
        time_range = {
            "start": _time_to_string(times[0], dtype),
            "end": _time_to_string(times[-1], dtype),
        }

    spatial_grid = _spatial_grid(data_array)
    globe_points = _globe_points(spatial_grid)

    response = {
        "dataset": DATASET_FILENAME,
        "data_variable": data_var_name,
        "filters": {
            "start_date": start_date.date().isoformat(),
            "end_date": end_date.date().isoformat(),
            "region": region.model_dump(),
        },
        "statistics": stats,
        "time_series_preview": _time_series_preview(data_array),
    }
    if time_range:
        response["time_range"] = time_range
    if spatial_grid:
        response["spatial_grid"] = spatial_grid
    if globe_points:
        response["globe_points"] = globe_points
    return response
