import Plot from "react-plotly.js";

function buildHeatmapTrace(spatialGrid, label) {
  if (!spatialGrid) return null;
  return {
    type: "heatmap",
    x: spatialGrid.lon,
    y: spatialGrid.lat,
    z: spatialGrid.values,
    colorscale: "RdBu",
    reversescale: label === "temperature",
    name: `${label} heatmap`,
    showscale: false,
  };
}

function buildTimeSeriesTrace(preview, label) {
  if (!preview || preview.length === 0) return null;
  const x = preview.map((item) => item.year ?? item.time ?? "");
  const y = preview.map((item) => item.value);
  return {
    type: "scatter",
    mode: "lines+markers",
    line: { shape: "spline" },
    x,
    y,
    name: `${label} trend`,
  };
}

export default function VariableSection({ variable, data }) {
  const heatmapTrace = buildHeatmapTrace(data.spatial_grid, variable);
  const timeSeriesTrace = buildTimeSeriesTrace(data.time_series_preview, variable);

  return (
    <section className="panel">
      <h3 className="card-title">{variable.toUpperCase()}</h3>
      <div className="stats-grid">
        {Object.entries(data.statistics || {}).map(([key, value]) => (
          <div key={key} className="stat-card">
            <div className="label">{key.toUpperCase()}</div>
            <strong>{value.toFixed(3)}</strong>
          </div>
        ))}
      </div>
      <div className="chart-row">
        {heatmapTrace ? (
          <div className="chart-wrapper">
            <Plot
              data={[heatmapTrace]}
              layout={{
                title: `${capitalize(variable)} Heatmap`,
                xaxis: {
                  title: "Longitude",
                  color: "#e9ecff",
                  tickfont: { color: "#dfe5ff" },
                  titlefont: { size: 14 },
                },
                yaxis: {
                  title: "Latitude",
                  color: "#e9ecff",
                  tickfont: { color: "#dfe5ff" },
                  titlefont: { size: 14 },
                },
                font: { color: "#f7f9ff", size: 12 },
                paper_bgcolor: "rgba(0,0,0,0)",
                plot_bgcolor: "rgba(0,0,0,0)",
                margin: { t: 60, r: 20, b: 60, l: 60 },
              }}
              config={{ displayModeBar: false }}
              style={{ width: "100%", height: "360px" }}
            />
          </div>
        ) : (
          <p>No spatial grid available.</p>
        )}
        {timeSeriesTrace ? (
          <div className="chart-wrapper">
            <Plot
              data={[timeSeriesTrace]}
              layout={{
                title: `${capitalize(variable)} Time Series`,
                xaxis: {
                  title: "Year",
                  color: "#e9ecff",
                  tickfont: { color: "#dfe5ff" },
                  titlefont: { size: 14 },
                },
                yaxis: {
                  title: "Value",
                  color: "#e9ecff",
                  tickfont: { color: "#dfe5ff" },
                  titlefont: { size: 14 },
                },
                font: { color: "#f7f9ff", size: 12 },
                paper_bgcolor: "rgba(0,0,0,0)",
                plot_bgcolor: "rgba(0,0,0,0)",
                margin: { t: 60, r: 20, b: 60, l: 60 },
              }}
              config={{ displayModeBar: false }}
              style={{ width: "100%", height: "320px" }}
            />
          </div>
        ) : (
          <p>No time-series data for this selection.</p>
        )}
      </div>
    </section>
  );
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
