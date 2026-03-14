import { useState, useEffect, useMemo, useCallback } from "react";
import Plot from "react-plotly.js";
import { fetchClimateSlice, formatDateRange, fetchGeocode, fetchStoryCompare } from "../api/client.js";

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

const DEFAULT_RANGE_A = { start: 1948, end: 1983 };
const DEFAULT_RANGE_B = { start: 1983, end: 2019 };
const YEAR_MIN = 1948;
const YEAR_MAX = 2019;

export default function ComparisonPage({ theme = "dark" }) {
  const [variable, setVariable] = useState("temperature");
  const [rangeA, setRangeA] = useState(DEFAULT_RANGE_A);
  const [rangeB, setRangeB] = useState(DEFAULT_RANGE_B);
  const [chartType, setChartType] = useState("time");
  
  const rangeStyleA = {
    "--start": (((rangeA.start - YEAR_MIN) / (YEAR_MAX - YEAR_MIN)) * 100).toFixed(1),
    "--end": (((rangeA.end - YEAR_MIN) / (YEAR_MAX - YEAR_MIN)) * 100).toFixed(1),
  };
  const rangeStyleB = {
    "--start": (((rangeB.start - YEAR_MIN) / (YEAR_MAX - YEAR_MIN)) * 100).toFixed(1),
    "--end": (((rangeB.end - YEAR_MIN) / (YEAR_MAX - YEAR_MIN)) * 100).toFixed(1),
  };
  
  const [locationStr, setLocationStr] = useState("");
  const [geocodedRegion, setGeocodedRegion] = useState(null);
  const [locationLabel, setLocationLabel] = useState("Global");

  const [data, setData] = useState(null);
  const [storyOutput, setStoryOutput] = useState(null);
  const [loading, setLoading] = useState(false);
  const [storyLoading, setStoryLoading] = useState(false);
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

  const executeGeocode = async (e) => {
    e.preventDefault();
    if (!locationStr.trim()) {
      setGeocodedRegion(null);
      setLocationLabel("Global");
      return;
    }
    setLoading(true);
    try {
      const g = await fetchGeocode(locationStr);
      setGeocodedRegion(g.bounding_box);
      setLocationLabel(g.display_name.split(",")[0]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const compareWindows = async () => {
      setLoading(true);
      setError("");
      setStoryOutput(null);
      try {
        const windowA = formatDateRange(rangeA.start, rangeA.end);
        const windowB = formatDateRange(rangeB.start, rangeB.end);

        const payloadA = { start_date: windowA.start, end_date: windowA.end };
        const payloadB = { start_date: windowB.start, end_date: windowB.end };

        if (geocodedRegion) {
          payloadA.region = geocodedRegion;
          payloadB.region = geocodedRegion;
        }

        const [first, second] = await Promise.all([
          fetchClimateSlice(variable, payloadA),
          fetchClimateSlice(variable, payloadB),
        ]);
        if (!cancelled) {
          setData({ first, second, windowA: { ...rangeA }, windowB: { ...rangeB } });
          
          setStoryLoading(true);
          fetchStoryCompare({
            variable,
            location_a: `Window ${rangeA.start}-${rangeA.end} at ${locationLabel}`,
            location_b: `Window ${rangeB.start}-${rangeB.end} at ${locationLabel}`,
            stats_a: first.statistics || {},
            stats_b: second.statistics || {},
            time_series_a: first.time_series_preview || [],
            time_series_b: second.time_series_preview || [],
          }).then((res) => {
            if(!cancelled) {
               setStoryOutput(res);
            }
          }).finally(() => {
            if(!cancelled) setStoryLoading(false);
          });
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
  }, [variable, rangeA.start, rangeA.end, rangeB.start, rangeB.end, geocodedRegion, locationLabel]);

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
        <h2>Comparison Lab - {locationLabel}</h2>
        <p>Compare the same variable across two different time windows using your preferred visualization.</p>
        
        <form className="location-form" onSubmit={executeGeocode} style={{marginBottom: "1rem", display: "flex", gap: "0.5rem"}}>
          <input 
            type="text" 
            placeholder="Enter location (e.g. Japan)..." 
            value={locationStr} 
            onChange={e => setLocationStr(e.target.value)} 
            style={{flex: 1, padding: "0.5rem", borderRadius: "4px"}}
          />
          <button type="submit" style={{padding: "0.5rem 1rem", borderRadius: "4px", backgroundColor: "#4ad6ff", color: "#000", border: 'none'}}>Search Location</button>
        </form>

        <form className="comparison-form" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: "1rem" }}>
          <div>
            <label style={{ display: "block", marginBottom: "0.5rem" }}>Variable</label>
            <select value={variable} onChange={(event) => setVariable(event.target.value)} style={{ padding: "0.5rem", borderRadius: "4px" }}>
              {variableOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="year-selector" style={{ maxWidth: '400px' }}>
            <p>Window A</p>
            <div className="range-display">
              <div>
                <span className="label">Start year</span>
                <strong>{rangeA.start}</strong>
              </div>
              <div>
                <span className="label">End year</span>
                <strong>{rangeA.end}</strong>
              </div>
            </div>
            <div className="dual-slider" style={rangeStyleA}>
              <input
                type="range"
                min={YEAR_MIN}
                max={YEAR_MAX}
                value={rangeA.start}
                onChange={(e) => setRangeA(p => ({ ...p, start: Math.min(Number(e.target.value), p.end) }))}
              />
              <input
                type="range"
                min={YEAR_MIN}
                max={YEAR_MAX}
                value={rangeA.end}
                onChange={(e) => setRangeA(p => ({ ...p, end: Math.max(Number(e.target.value), p.start) }))}
              />
            </div>
          </div>

          <div className="year-selector" style={{ maxWidth: '400px' }}>
            <p>Window B</p>
            <div className="range-display">
              <div>
                <span className="label">Start year</span>
                <strong>{rangeB.start}</strong>
              </div>
              <div>
                <span className="label">End year</span>
                <strong>{rangeB.end}</strong>
              </div>
            </div>
            <div className="dual-slider" style={rangeStyleB}>
              <input
                type="range"
                min={YEAR_MIN}
                max={YEAR_MAX}
                value={rangeB.start}
                onChange={(e) => setRangeB(p => ({ ...p, start: Math.min(Number(e.target.value), p.end) }))}
              />
              <input
                type="range"
                min={YEAR_MIN}
                max={YEAR_MAX}
                value={rangeB.end}
                onChange={(e) => setRangeB(p => ({ ...p, end: Math.max(Number(e.target.value), p.start) }))}
              />
            </div>
          </div>

          <div>
            <label style={{ display: "block", marginBottom: "0.5rem" }}>Graph Type</label>
            <select value={chartType} onChange={(event) => setChartType(event.target.value)} style={{ padding: "0.5rem", borderRadius: "4px" }}>
              {graphOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <small className="chip-hint">Charts refresh automatically.</small>
        </form>
        {error && <p className="error-text">{error}</p>}
        {loading && <p className="info-text">Updating comparison...</p>}
      </section>

      {data && <section className="panel chart-wrapper">{buildChart()}</section>}
      {data && (
        <section className="panel">
          <h3>Agentic Insights ✨</h3>
          {storyLoading ? (
            <p>Generating insights...</p>
          ) : storyOutput ? (
            <div>
              <p>{storyOutput.story}</p>
              {storyOutput.risk_score && (
                <div style={{ marginTop: "1rem", padding: "0.5rem", borderRadius: "8px", background: "rgba(248, 95, 115, 0.1)", border: "1px solid #f85f73" }}>
                  <strong>Climate Risk Score:</strong> {storyOutput.risk_score} / 10
                </div>
              )}
            </div>
          ) : (
            <p className="error-text">Failed to fetch insights.</p>
          )}
        </section>
      )}
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
          zsmooth: "best",
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
