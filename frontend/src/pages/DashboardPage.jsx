import { useState, useEffect } from "react";
import VariableSection from "../components/VariableSection.jsx";
import { fetchClimateSlice, formatDateRange, fetchStory } from "../api/client.js";

const variableOptions = [
  { id: "temperature", label: "Temperature" },
  { id: "precipitation", label: "Precipitation" },
  { id: "wind", label: "Wind" },
];

const DEFAULT_RANGE = { start: 1948, end: 2019 };
const YEAR_MIN = 1948;
const YEAR_MAX = 2019;

export default function DashboardPage() {
  const [range, setRange] = useState(DEFAULT_RANGE);
  const [selected, setSelected] = useState(variableOptions.map((opt) => opt.id));
  const rangeStyle = {
    "--start": (((range.start - YEAR_MIN) / (YEAR_MAX - YEAR_MIN)) * 100).toFixed(1),
    "--end": (((range.end - YEAR_MIN) / (YEAR_MAX - YEAR_MIN)) * 100).toFixed(1),
  };
  const [results, setResults] = useState({});
  const [stories, setStories] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleToggle = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  useEffect(() => {
    let cancelled = false;

    const pullData = async () => {
      if (selected.length === 0) {
        setError("Select at least one variable.");
        setResults({});
        setStories({});
        setLoading(false);
        return;
      }

      setError("");
      setLoading(true);
      const { start, end } = formatDateRange(range.start, range.end);
      const nextResults = {};

      for (const variable of selected) {
        try {
          const data = await fetchClimateSlice(variable, {
            start_date: start,
            end_date: end,
          });
          if (cancelled) return;
          nextResults[variable] = data;

          // Fetch story asynchronously without blocking the loop
          fetchStory({
             variable,
             start_year: range.start,
             end_year: range.end,
             statistics: data.statistics || {},
             time_series_preview: data.time_series_preview || []
          }).then(res => {
            if(!cancelled) {
              setStories(prev => ({...prev, [variable]: res}));
            }
          });

        } catch (err) {
          if (!cancelled) {
            setError(err.message);
            setLoading(false);
          }
          return;
        }
      }

      if (!cancelled) {
        setResults(nextResults);
        setLoading(false);
      }
    };

    pullData();
    return () => {
      cancelled = true;
    };
  }, [range, selected]);

  return (
    <div>
      <section className="panel">
        <h2>Main Explorer</h2>
        <p>Pick a year and variables to generate sequential heatmaps and time-series views.</p>
        <form>
          <div className="form-grid">
            <div className="year-selector">
              <div className="range-display">
                <div>
                  <span className="label">Start year</span>
                  <strong>{range.start}</strong>
                </div>
                <div>
                  <span className="label">End year</span>
                  <strong>{range.end}</strong>
                </div>
              </div>
              <div className="dual-slider" style={rangeStyle}>
                <input
                  type="range"
                  min={YEAR_MIN}
                  max={YEAR_MAX}
                  value={range.start}
                  onChange={(event) =>
                    setRange((prev) => {
                      const next = Math.min(Number(event.target.value), prev.end);
                      return { ...prev, start: next };
                    })
                  }
                />
                <input
                  type="range"
                  min={YEAR_MIN}
                  max={YEAR_MAX}
                  value={range.end}
                  onChange={(event) =>
                    setRange((prev) => {
                      const next = Math.max(Number(event.target.value), prev.start);
                      return { ...prev, end: next };
                    })
                  }
                />
              </div>
            </div>
            <div className="variable-chips">
              <p>Variables</p>
              <div className="chip-row">
                {variableOptions.map((opt) => {
                  const active = selected.includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      className={`chip ${active ? "chip-active" : ""}`}
                      onClick={() => handleToggle(opt.id)}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <small className="chip-hint">Charts refresh automatically.</small>
            </div>
          </div>
          {error && <p className="error-text">{error}</p>}
        </form>
      </section>

      <div className="results-stack">
        {loading && <p className="info-text">Loading latest data...</p>}
        {selected.map((variable) =>
          results[variable] ? (
            <VariableSection key={variable} variable={variable} data={results[variable]} story={stories[variable]} />
          ) : null
        )}
      </div>
    </div>
  );
}
