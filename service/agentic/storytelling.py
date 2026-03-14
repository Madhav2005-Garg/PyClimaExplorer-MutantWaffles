"""Agentic storytelling utilities using LangGraph + Gemini via LangChain.

Provides lightweight narrative generation for climate variables (temperature,
precipitation, wind speed). Designed to be fast and simple for API use.
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Dict, List, TypedDict

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.output_parsers import StrOutputParser
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field

DEFAULT_MODEL = "gemini-1.5-flash"


class StoryRequest(BaseModel):
    """Inputs for single-location storytelling."""

    variable: str = Field(..., description="Climate variable name, e.g., temperature")
    dataset: str | None = Field(None, description="Dataset identifier")
    start_year: int | None = Field(None, description="Start year of the data slice")
    end_year: int | None = Field(None, description="End year of the data slice")
    region_name: str | None = Field(None, description="Human-readable region name")
    statistics: Dict[str, float] = Field(default_factory=dict, description="Basic stats like mean/max/min/std")
    time_series_preview: List[Dict[str, float]] = Field(
        default_factory=list, description="Yearly preview items: [{year: int, value: float}]"
    )


class ComparisonRequest(BaseModel):
    """Inputs for two-location or two-slice comparison storytelling."""

    variable: str = Field(..., description="Climate variable name")
    location_a: str = Field(..., description="Label for first location")
    location_b: str = Field(..., description="Label for second location")
    start_year: int | None = None
    end_year: int | None = None
    stats_a: Dict[str, float] = Field(default_factory=dict)
    stats_b: Dict[str, float] = Field(default_factory=dict)
    time_series_a: List[Dict[str, float]] = Field(default_factory=list)
    time_series_b: List[Dict[str, float]] = Field(default_factory=list)


class _StoryState(TypedDict):
    prompt: str
    response: str | None


@lru_cache(maxsize=1)
def _get_llm(model: str = DEFAULT_MODEL) -> ChatGoogleGenerativeAI:
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("GOOGLE_API_KEY environment variable is required for Gemini access")
    return ChatGoogleGenerativeAI(model=model, temperature=0.3, max_output_tokens=300)


def _build_story_prompt(request: StoryRequest) -> str:
    stats_lines = [f"- {k}: {v}" for k, v in request.statistics.items()] or ["- (no stats provided)"]
    preview_lines = [f"- {item.get('year')}: {item.get('value')}" for item in request.time_series_preview] or [
        "- (no time-series preview provided)"
    ]
    region = request.region_name or "the selected region"
    start = request.start_year or "(unknown start year)"
    end = request.end_year or "(unknown end year)"

    return "\n".join(
        [
            "You are a concise climate data analyst.",
            "Write 3-5 sentences that summarize the trend for the given variable.",
            "Stay factual, cite numbers where possible, avoid speculation.",
            "If data is sparse, state that uncertainty is high.",
            "",
            f"Variable: {request.variable}",
            f"Dataset: {request.dataset or '(unspecified)'}",
            f"Region: {region}",
            f"Time range: {start} to {end}",
            "Statistics:",
            *stats_lines,
            "Time series preview (year:value):",
            *preview_lines,
        ]
    )


def _build_comparison_prompt(request: ComparisonRequest) -> str:
    stats_a = [f"- {k}: {v}" for k, v in request.stats_a.items()] or ["- (no stats for A)"]
    stats_b = [f"- {k}: {v}" for k, v in request.stats_b.items()] or ["- (no stats for B)"]
    preview_a = [f"- {item.get('year')}: {item.get('value')}" for item in request.time_series_a] or [
        "- (no series A)"
    ]
    preview_b = [f"- {item.get('year')}: {item.get('value')}" for item in request.time_series_b] or [
        "- (no series B)"
    ]
    start = request.start_year or "(unknown start year)"
    end = request.end_year or "(unknown end year)"

    return "\n".join(
        [
            "You are a concise climate analyst.",
            "Compare the two locations in 3-5 sentences.",
            "Highlight differences, quantify where possible, and note any trends.",
            "Stay factual; if data is thin, mention uncertainty.",
            "",
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
        ]
    )


def _build_story_graph(model: str = DEFAULT_MODEL):
    parser = StrOutputParser()

    def _call_model(state: _StoryState) -> _StoryState:
        llm = _get_llm(model)
        content = llm.invoke(state["prompt"])
        text = parser.invoke(content)
        return {"prompt": state["prompt"], "response": text}

    graph = StateGraph(_StoryState)
    graph.add_node("llm", _call_model)
    graph.add_edge(START, "llm")
    graph.add_edge("llm", END)
    return graph.compile()


_STORY_GRAPH = _build_story_graph()
_COMPARISON_GRAPH = _build_story_graph()


def generate_story(request: StoryRequest, model: str = DEFAULT_MODEL) -> str:
    """Generate a concise narrative for a single slice."""

    state = {"prompt": _build_story_prompt(request), "response": None}
    graph = _STORY_GRAPH if model == DEFAULT_MODEL else _build_story_graph(model)
    result = graph.invoke(state)
    return result["response"] or "No response generated."


def generate_comparison(request: ComparisonRequest, model: str = DEFAULT_MODEL) -> str:
    """Generate a concise comparison narrative for two slices."""

    state = {"prompt": _build_comparison_prompt(request), "response": None}
    graph = _COMPARISON_GRAPH if model == DEFAULT_MODEL else _build_story_graph(model)
    result = graph.invoke(state)
    return result["response"] or "No response generated."


__all__ = [
    "StoryRequest",
    "ComparisonRequest",
    "generate_story",
    "generate_comparison",
]
