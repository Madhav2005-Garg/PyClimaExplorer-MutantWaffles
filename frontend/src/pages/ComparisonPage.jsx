import { useState, useEffect, useMemo } from "react";
import Plot from "react-plotly.js";
import { fetchClimateSlice, formatDateRange } from "../api/client.js";

const variableOptions = [
  { id: "temperature", label: "Temperature" },
  { id: "precipitation", label: "Precipitation" },
  { id: "wind", label: "Wind" },
];

const graphOptions = [
  { id: "heatmap", label: "Heatmap" },
  { id: "histogram", label: "Histogram" },
  { id: "time", label: "Time-series" },
];

const accentPalette = ["#4ad6ff", "#f85f73"];
const plotStyle = { width: "100%", height: "360px" };

const cssVar = (name, fallback) => {
  if (typeof window === "undefined") {
    return fallback;
  }
  const value = getComputedStyle(document.documentElement).getPropertyValue(name);
  return value?.trim() || fallback;
};

export default function ComparisonPage({ theme = "dark" }) {
  const [variable, setVariable] = useState("temperature");
  const [rangeA, setRangeA] = useState({ start: 1948, end: 1983 });
  const [rangeB, setRangeB] = useState({ start: 1983, end: 2019 });
  const [chartType, setChartType] = useState("time");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const plotTheme = useMemo(
    () => ({
      text: cssVar("--plot-text", "#f7f9ff"),
      grid: cssVar("--plot-grid", "rgba(255,255,255,0.08)"),
    }),
    [theme]
  );

  const handleInput = (setter) => (event) => {
    const { name, value } = event.target;
    const numeric = Number(value);
    setter((prev) => {
      const safe = Number.isFinite(numeric) ? numeric : prev[name];
      if (name === "start") {
        return { ...prev, start: Math.min(safe, prev.end) };
      }
      return { ...prev, end: Math.max(safe, prev.start) };
    });
  };

  useEffect(() => {
    let cancelled = false;

    const compareWindows = async () => {
      setLoading(true);
      setError("");
      try {
        const windowA = formatDateRange(rangeA.start, rangeA.end);
        const windowB = formatDateRange(rangeB.start, rangeB.end);
        const [first, second] = await Promise.all([
          fetchClimateSlice(variable, { start_date: windowA.start, end_date: windowA.end }),
          fetchClimateSlice(variable, { start_date: windowB.start, end_date: windowB.end }),
        ]);
        if (!cancelled) {
          setData({ first, second, windowA: { ...rangeA }, windowB: { ...rangeB } });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setData(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    compareWindows();

    return () => {
      cancelled = true;
    };
  }, [variable, rangeA.start, rangeA.end, rangeB.start, rangeB.end]);

  const buildChart = () => {
    if (!data) return null;

    const windows = [
      {
        key: "first",
        title: `${capitalize(variable)} ${data.windowA.start}-${data.windowA.end}`,
        dataset: data.first,
        accent: accentPalette[0],
      },
      {
        key: "second",
        title: `${capitalize(variable)} ${data.windowB.start}-${data.windowB.end}`,
        dataset: data.second,
        accent: accentPalette[1],
      },
    ];

    return (
      <div className="comparison-grid">
        {windows.map(({ key, title, dataset, accent }) => (
          <div key={key} className="chart-wrapper comparison-tile">
            {renderChartByType(chartType, dataset, title, accent, plotTheme)}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div>
      <section className="panel">
        <h2>Comparison Lab</h2>
        <p>Compare the same variable across two different time windows using your preferred visualization.</p>
        <form className="comparison-form">
          <label>
            Variable
            <select value={variable} onChange={(event) => setVariable(event.target.value)}>
              {variableOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Start A
            <input
              type="number"
              name="start"
              min="1948"
              max="2020"
              value={rangeA.start}
              onChange={handleInput(setRangeA)}
            />
          </label>
          <label>
            End A
            <input
              type="number"
              name="end"
              min={rangeA.start}
              max="2025"
              value={rangeA.end}
              onChange={handleInput(setRangeA)}
            />
          </label>
          <label>
            Start B
            <input
              type="number"
              name="start"
              min="1948"
              max="2020"
              value={rangeB.start}
              onChange={handleInput(setRangeB)}
            />
          </label>
          <label>
            End B
            <input
              type="number"
              name="end"
              min={rangeB.start}
              max="2025"
              value={rangeB.end}
              onChange={handleInput(setRangeB)}
            />
          </label>
          <label>
            Graph Type
            <select value={chartType} onChange={(event) => setChartType(event.target.value)}>
              {graphOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <small className="chip-hint">Charts refresh automatically.</small>
        </form>
        {error && <p className="error-text">{error}</p>}
        {loading && <p className="info-text">Updating comparison...</p>}
      </section>

      {data && <section className="panel chart-wrapper">{buildChart()}</section>}
    </div>
  );
}
function renderChartByType(type, dataset, title, accent, plotTheme) {
  if (type === "heatmap") {
    return renderHeatmap(dataset?.spatial_grid, title, plotTheme);
  }
  if (type === "histogram") {
    return renderHistogram(dataset?.time_series_preview, title, accent, plotTheme);
  }
  return renderTimeSeries(dataset?.time_series_preview, title, accent, plotTheme);
}

function renderHeatmap(spatialGrid, title, plotTheme) {
  if (!spatialGrid) {
    return <p className="error-text">Spatial grid not available for this window.</p>;
  }

  const lat = spatialGrid.lat || [];
  const shouldReverse = lat.length > 1 && lat[0] < lat[lat.length - 1];

  return (
    <Plot
      data={[
        {
          type: "heatmap",
          x: spatialGrid.lon,
          y: spatialGrid.lat,
          z: spatialGrid.values,
          colorscale: "Viridis",
          showscale: false,
          hovertemplate: "Lon %{x}<br>Lat %{y}<br>Value %{z:.2f}<extra></extra>",
        },
      ]}
      layout={{
        ...buildBaseLayout(title, plotTheme),
        xaxis: axisProps("Longitude", plotTheme),
        yaxis: axisProps("Latitude", plotTheme, shouldReverse ? { autorange: "reversed" } : {}),
      }}
      style={plotStyle}
      config={{ displayModeBar: false }}
    />
  );
}

function renderHistogram(preview, title, accent, plotTheme) {
  if (!preview || preview.length === 0) {
    return <p className="error-text">Not enough sample points to build a histogram.</p>;
  }

  const values = preview.map((row) => row.value);
  const bins = Math.min(40, Math.max(10, Math.round(values.length / 4)));

  return (
    <Plot
      data={[
        {
          type: "histogram",
          x: values,
          marker: { color: accent, opacity: 0.8 },
          nbinsx: bins,
          hovertemplate: "Value %{x:.2f}<br>Count %{y}<extra></extra>",
        },
      ]}
      layout={{
        ...buildBaseLayout(title, plotTheme),
        xaxis: axisProps("Value", plotTheme),
        yaxis: axisProps("Frequency", plotTheme),
      }}
      style={plotStyle}
      config={{ displayModeBar: false }}
    />
  );
}

function renderTimeSeries(preview, title, accent, plotTheme) {
  if (!preview || preview.length === 0) {
    return <p className="error-text">No time-series data for this period.</p>;
  }

  const usesYear = preview[0]?.year !== undefined;
  const xLabel = usesYear ? "Year" : "Time";
  const trace = buildLineTrace(preview, title, accent, xLabel);

  return (
    <Plot
      data={[trace]}
      layout={{
        ...buildBaseLayout(title, plotTheme),
        xaxis: axisProps(xLabel, plotTheme),
        yaxis: axisProps("Value", plotTheme),
      }}
      style={plotStyle}
      config={{ displayModeBar: false }}
    />
  );
}

function buildLineTrace(preview, name, color, xLabel) {
  return {
    type: "scatter",
    mode: "lines+markers",
    name,
    x: preview.map((row) => row.year ?? row.time),
    y: preview.map((row) => row.value),
    line: { color, width: 2 },
    marker: { color, size: 6 },
    hovertemplate: `${xLabel} %{x}<br>Value %{y:.2f}<extra></extra>`,
    showlegend: false,
  };
}

function buildBaseLayout(title, plotTheme) {
  return {
    title,
    showlegend: false,
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { color: plotTheme.text, size: 12 },
    margin: { t: 60, r: 24, b: 60, l: 65 },
  };
}

function axisProps(title, plotTheme, extra = {}) {
  return {
    title,
    color: plotTheme.text,
    tickfont: { color: plotTheme.text },
    titlefont: { size: 14 },
    gridcolor: plotTheme.grid,
    zeroline: false,
    ...extra,
  };
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
