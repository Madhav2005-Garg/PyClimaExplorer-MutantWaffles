# PyClimaExplorer
## Team: MutantWaffle

PyClimaExplorer is an interactive platform for exploring, visualizing, and interpreting global climate datasets (NetCDF). It helps researchers, students, and decision-makers quickly derive insights from multi-dimensional climate variables using maps, time-series, comparative analyses, and an Agentic AI-driven "Story Mode" that explains visual findings in plain language.

## Table of Contents
- Project overview
- Key features
- Architecture & tech stack
- Installation
- Quick start
- Data format & preparation
- Usage examples
- Roadmap
- Contributing
- License
- Team

## Project overview
PyClimaExplorer focuses on rapid, exploratory analysis of climate model outputs and observational products. Users can load NetCDF files, select variables and time ranges, and interactively visualize spatial and temporal patterns. The platform also supports dataset comparison and an AI-powered explanation layer to produce narrative summaries of observed trends.

## Key features
- Upload and process NetCDF (xarray-backed) climate datasets
- Variable selection (temperature, precipitation, wind, etc.)
- Time-range filtering and aggregation (monthly, seasonal, annual)
- Interactive maps and time-series plots (Plotly / Matplotlib)
- Dataset comparison mode (compare years, scenarios, or models)
- Story Mode: Agentic AI generates human-readable explanations and insights
- Export visualizations and summarized reports (PNG, CSV)

## Architecture & tech stack
- Language: Python 3.11+
- Data processing: xarray, numpy, pandas
- Visualization: plotly, matplotlib, geopandas (for geographic overlays)
- Backend API: FastAPI (or Flask as fallback)
- Frontend / Dashboard: Streamlit (quick prototype) or React + Plotly Dash for production
- Agentic AI: integrations with LangChain / LangGraph and large-model APIs for explanation generation
## Data format & preparation
- Supported input: NetCDF (.nc) files with standard climate variables and coordinate dimensions (time, lat, lon, level if present).
- Recommended preprocessing: ensure time coordinates are CF-compliant, units are documented, and variables are named consistently. Use `xarray.open_dataset()` to inspect files.

## Usage examples
- Compare spatial maps of mean temperature between two years.
- Plot seasonal cycles for a selected region and variable.
- Generate a short narrative explaining a detected trend using the Story Mode.

## Meet the Amazing Team
- **Madhav Garg** — Lead Developer
- **Pranav Jain** — Agentic AI Engineer
- **Aditya Pandey** — Creative Lead (Creative Thinker)
- **Chitranshi Singh** — UX / Visual Designer