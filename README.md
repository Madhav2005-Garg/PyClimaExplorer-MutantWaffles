# PyClimaExplorer
## Team: MutantWaffle

PyClimaExplorer is an interactive platform for exploring, visualizing, and interpreting global climate datasets (NetCDF). It helps researchers, students, and decision-makers quickly derive insights from multi-dimensional climate variables using maps, time-series, comparative analyses, and an AI-driven "Story Mode" that explains visual findings in plain language.

## Features

## Frontend views
- Globe view: Three-Globe renderer with Blue Marble textures, anomaly-aware color scales, single-year selector, and adjustable warming offset to surface small deviations. Ideal for spotting hemispheric and latitudinal patterns at a glance.
- Map view: Leaflet base tiles plus GeoJSON country overlays; clicking a country zooms and triggers data fetch for the chosen variable/year. Graceful fallbacks show informative empty states when data is missing.
- Comparison view: Dual-pane layout keeping variable/year selectors in sync; presents two regions or periods side-by-side with matched scales to minimize visual bias. Designed for quick what-changed analysis across space or time.
- Story panel: Consumes the Gemini JSON response to show narrative, trend label, risk score, and notable events—giving users a concise explanation layer on top of charts.

## Platform capabilities
- Temporal slicing: Year-based selection with consistent formatting utilities to build start/end ranges for API queries.
- Regional focus: Bounding boxes and country-level selections feed into backend filters to avoid over-fetching global volumes.
- Multi-variable support: Temperature, precipitation, and wind pipelines share a common DataQuery shape for uniform handling.
- Error resilience: Client-side fallbacks when story generation fails or data is absent, keeping UX responsive.

## Architecture & tech stack

## Data processing pipeline
- NetCDF ingestion with xarray, exposing slices based on start/end dates and region bounds.
- Variable-specific filters: temperature, precipitation, and wind speed each wrap shared query semantics but respect their native units and ranges.
- Geocoding helper: Nominatim lookup to turn free-text location queries into coordinates plus a padded bounding box for immediate data pulls.

## API surface (REST)
- `POST /api/temperature` — body: DataQuery { start_date, end_date, region {lat_min, lat_max, lon_min, lon_max} }
- `POST /api/precipitation` — same shape as temperature.
- `POST /api/wind` — same shape as temperature.
- `POST /api/geocode` — body: { query } ⇒ returns lat/lon and a small bounding box.
- `POST /api/story` — body: StoryRequest ⇒ returns JSON narrative or raw text fallback.
- `POST /api/story/compare` — body: ComparisonRequest ⇒ returns JSON narrative for A vs B.

## Story mode behavior
- Prompt contains variable, dataset label, region name, time range, stats block, and a short preview of year:value pairs.
- Gemini is asked to emit only JSON with keys: story (3–5 sentences), risk_score (1–10), trend (short phrase), events (up to 3 strings).
- If JSON parsing fails, the raw text is returned to keep the UI responsive.

## Architecture & tech stack
- AI storytelling: Gemini via the `google-genai` client
- Data: NetCDF assets in `data/` (temperature, precipitation, wind)

## Data format & preparation
- Supported input: NetCDF (.nc) with standard climate variables and coordinates (time, lat, lon, optional level)
- Recommended: ensure CF-compliant time coordinates, documented units, and consistent variable names; inspect via `xarray.open_dataset()`

## Usage examples
- Compare spatial maps of mean temperature between two years
- Plot seasonal cycles for a selected region and variable
- Generate a narrative explaining a detected trend using Story Mode

## Team
- **Madhav Garg** — Lead Developer
- **Pranav Jain** — Agentic AI Engineer
- **Aditya Pandey** — Creative Lead (Creative Thinker)
- **Chitranshi Singh** — UX / Visual Designer