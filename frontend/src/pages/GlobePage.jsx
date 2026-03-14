import { useEffect, useRef, useState } from "react";
import Globe from "globe.gl";
import { fetchClimateSlice, formatDateRange } from "../api/client.js";

const VARIABLE_OPTIONS = [
  { id: "temperature", label: "Temperature", unit: "°C" },
  { id: "precipitation", label: "Precipitation", unit: "mm/day" },
  { id: "wind", label: "Wind Speed", unit: "m/s" },
];
const YEAR_MIN = 1948;
const YEAR_MAX = 2019;
const YEAR_DEFAULT = YEAR_MAX;
const VARIABLE_RANGE_PRESETS = {
  precipitation: { minSpan: 220, clamp: [0, 800] },
  wind: { minSpan: 30, clamp: [0, 120] },
};
const TEXTURES = {
  globe: "https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg",
  bump: "https://unpkg.com/three-globe/example/img/earth-topology.png",
  background: "https://unpkg.com/three-globe/example/img/night-sky.png",
};
const HEATMAP_TEXTURE_SIZE = { width: 2048, height: 1024 };
const HEAT_DOT_RADIUS = 32;
const HEAT_JITTER_PX = 12;
const HEAT_GLOW_BLUR = 22;
const HEAT_GLOBAL_BLUR = 140;

export default function GlobePage() {
  const containerRef = useRef(null);
  const globeRef = useRef(null);
  const [variable, setVariable] = useState("temperature");
  const [year, setYear] = useState(YEAR_DEFAULT);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [globeReady, setGlobeReady] = useState(false);
  const [baseTexture, setBaseTexture] = useState(null);
  const [dataRange, setDataRange] = useState(null);

  useEffect(() => {
    if (!containerRef.current || globeRef.current) return;

    let disposed = false;

    try {
      const globe = Globe()(containerRef.current)
        .backgroundColor("rgba(0,0,0,0)")
        .backgroundImageUrl(TEXTURES.background)
        .globeImageUrl(TEXTURES.globe)
        .bumpImageUrl(TEXTURES.bump)
        .pointRadius(0)
        .pointResolution(4)
        .pointsData([])
        .pointsTransitionDuration(900)
        .atmosphereColor("#63f4ff")
        .atmosphereAltitude(0.2);

      const resize = () => {
        if (!containerRef.current || disposed) return;
        const { offsetWidth, offsetHeight } = containerRef.current;
        globe.width(offsetWidth).height(offsetHeight);
      };
      resize();
      window.addEventListener("resize", resize);

      const controls = globe.controls?.();
      if (controls) {
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.7;
      }

      globeRef.current = globe;
      setGlobeReady(true);

      return () => {
        disposed = true;
        window.removeEventListener("resize", resize);
        globeRef.current?._destructor?.();
        globeRef.current = null;
        setGlobeReady(false);
      };
    } catch (err) {
      console.error("Failed to initialize globe", err);
      setError("Unable to initialize the WebGL globe in this browser.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = TEXTURES.globe;
    image.onload = () => {
      if (!cancelled) {
        setBaseTexture(image);
      }
    };
    image.onerror = (err) => {
      console.warn("Failed to load base globe texture", err);
      if (!cancelled) {
        setBaseTexture(null);
      }
    };
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!globeRef.current) return;
    let points = data?.globe_points || [];

    // Fallback if globe_points is missing but spatial_grid exists
    if (points.length === 0 && data?.spatial_grid) {
      const grid = data.spatial_grid;
      const parsedPoints = [];
      const lats = grid.lat || [];
      const lons = grid.lon || [];
      const values = grid.values || [];
      for (let i = 0; i < lats.length; i++) {
        const row = values[i] || [];
        for (let j = 0; j < lons.length; j++) {
          const val = row[j];
          if (val !== null && !isNaN(val)) {
            parsedPoints.push({ lat: lats[i], lon: lons[j], value: val });
          }
        }
      }
      points = parsedPoints;
    }

    const normalizedPoints = normalizePoints(points, variable);
    const valueRange = computeValueRange(normalizedPoints, variable);
    setDataRange(valueRange);
    const heatmapTexture = createHeatmapTexture(normalizedPoints, valueRange, baseTexture);
    const nextTexture = heatmapTexture ?? TEXTURES.globe;

    globeRef.current.globeImageUrl(nextTexture).pointsData([]);
  }, [data, baseTexture, variable]);

  useEffect(() => {
    let cancelled = false;

    const pullSlice = async () => {
      setLoading(true);
      setError("");
      try {
        const { start, end } = formatDateRange(year, year);
        const next = await fetchClimateSlice(variable, { start_date: start, end_date: end });
        if (!cancelled) {
          setData(next);
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

    pullSlice();
    return () => {
      cancelled = true;
    };
  }, [year, variable]);

  const sliderStyle = {
    "--value": (((year - YEAR_MIN) / (YEAR_MAX - YEAR_MIN)) * 100).toFixed(1),
  };

  const displayStats = transformStatistics(data?.statistics, variable) || data?.statistics || {};

  return (
    <div>
      <section className="panel">
        <h2>3D Globe</h2>
        <p>Visualize climate variable intensity across the globe.</p>
        <form>
          <div className="form-grid">
            <div className="year-selector">
              <div className="range-display" style={{ justifyContent: "space-between" }}>
                <div>
                  <span className="label">Year</span>
                  <strong>{year}</strong>
                </div>
              </div>
              <div className="mono-slider" style={sliderStyle}>
                <input
                  type="range"
                  min={YEAR_MIN}
                  max={YEAR_MAX}
                  value={year}
                  onChange={(event) => setYear(Number(event.target.value))}
                />
              </div>
            </div>

            <div className="variable-chips">
              <p>Variable</p>
              <div className="chip-row">
                {VARIABLE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`chip ${variable === opt.id ? "chip-active" : ""}`}
                    onClick={() => setVariable(opt.id)}
                  >
                    {opt.label} ({opt.unit})
                  </button>
                ))}
              </div>
              <small className="chip-hint">Globe renders the selected year's values.</small>
            </div>
          </div>
        </form>
        {error && <p className="error-text">{error}</p>}
        {loading && <p className="info-text">Loading globe data...</p>}
      </section>

      <section className="panel">
        <div className="globe-stage" style={{ position: "relative" }}>
          <div ref={containerRef} className="globe-container" />
          {!globeReady && !loading && (
            <div className="globe-placeholder">
              <p>Globe initializes after the first dataset finishes loading.</p>
            </div>
          )}
          {dataRange && (
            <div style={{
              position: "absolute", bottom: "20px", left: "20px",
              background: "rgba(10, 15, 30, 0.8)", padding: "10px 15px",
              borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)",
              backdropFilter: "blur(4px)", color: "#fff", display: "flex", flexDirection: "column", gap: "6px"
            }}>
              <div style={{ fontSize: "0.85rem", fontWeight: "bold", textAlign: "center" }}>
                {VARIABLE_OPTIONS.find(v => v.id === variable)?.label} ({VARIABLE_OPTIONS.find(v => v.id === variable)?.unit})
              </div>
              <div style={{
                width: "200px", height: "12px", borderRadius: "6px",
                background: `linear-gradient(to right, ${HEATMAP_STOPS.map(s => `rgb(${s.color.join(',')})`).join(', ')})`
              }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", fontFamily: "monospace" }}>
                <span>{dataRange.min.toFixed(1)}</span>
                <span>{((dataRange.min + dataRange.max) / 2).toFixed(1)}</span>
                <span>{dataRange.max.toFixed(1)}</span>
              </div>
            </div>
          )}
        </div>
        {data && (
          <div style={{ marginTop: "1rem" }}>
            <h3 className="card-title">Summary</h3>
            <div className="stats-grid">
              {Object.entries(displayStats).map(([key, value]) => (
                <div key={key} className="stat-card">
                  <div className="label">{key.toUpperCase()}</div>
                  <strong>{Number.isFinite(value) ? value.toFixed(3) : "-"}</strong>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

const HEATMAP_STOPS = [
  { t: 0, color: [0, 48, 135] },
  { t: 0.18, color: [6, 120, 212] },
  { t: 0.4, color: [58, 196, 148] },
  { t: 0.62, color: [254, 223, 127] },
  { t: 0.82, color: [255, 150, 60] },
  { t: 1, color: [243, 47, 28] },
];

function normalizePoints(points, variable) {
  if (!points || points.length === 0) return [];
  return points
    .map((point) => {
      const adjusted = transformValueByVariable(point?.value, variable, point?.lat);
      if (!Number.isFinite(adjusted)) return null;
      return { ...point, value: adjusted };
    })
    .filter(Boolean);
}

function computeValueRange(points, variable) {
  if (!points || points.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const point of points) {
    const value = point?.value;
    if (!Number.isFinite(value)) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return null;
  }
  if (min === max) {
    max = min + 1;
  }

  const preset = VARIABLE_RANGE_PRESETS[variable];
  if (preset) {
    const span = max - min;
    const target = Math.max(span, preset.minSpan);
    const mid = (min + max) / 2;
    min = mid - target / 2;
    max = mid + target / 2;
    if (preset.clamp) {
      min = Math.max(min, preset.clamp[0]);
      max = Math.min(max, preset.clamp[1]);
    }
  }

  if (min < 0 && max > 0) {
    const limit = Math.max(Math.abs(min), Math.abs(max));
    min = -limit;
    max = limit;
  }

  return { min, max };
}

function buildColorizer(range) {
  if (!range) {
    const fallback = [120, 165, 255];
    return () => ({ rgb: fallback, intensity: 0.5 });
  }
  const span = range.max - range.min;
  return (value = range.min) => {
    const t = clamp01((value - range.min) / span);
    const rgb = sampleGradient(t);
    return { rgb, intensity: t };
  };
}

function transformValueByVariable(value, variable, lat) {
  if (!Number.isFinite(value)) return null;
  if (variable === "temperature") {
    // Treat dataset as anomaly: build a latitude-based baseline climatology and add anomaly for a plausible absolute temperature field.
    const latitude = Number.isFinite(lat) ? lat : 0;
    const baseline = clampNumber(28 - Math.abs(latitude) * 0.45, -35, 35);
    const absolute = baseline + value;
    return clampNumber(absolute, -60, 70);
  }
  if (variable === "precipitation") {
    return Math.max(value, 0);
  }
  if (variable === "wind") {
    return clampNumber(value, 0, 120);
  }
  return value;
}

function transformStatistics(stats, variable) {
  if (!stats) return null;
  const adjust = (val) => transformValueByVariable(val, variable);
  return Object.fromEntries(
    Object.entries(stats).map(([key, val]) => [key, adjust(val)])
  );
}

function createHeatmapTexture(points, range, baseTexture) {
  if (typeof document === "undefined" || !points || points.length === 0 || !range) {
    return null;
  }

  const { width, height } = HEATMAP_TEXTURE_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }

  if (baseTexture) {
    ctx.save();
    ctx.filter = "saturate(1.2) contrast(1.05)";
    ctx.drawImage(baseTexture, 0, 0, width, height);
    ctx.restore();
  } else {
    ctx.fillStyle = "#021326";
    ctx.fillRect(0, 0, width, height);
  }

  const heatCanvas = document.createElement("canvas");
  heatCanvas.width = width;
  heatCanvas.height = height;
  const heatCtx = heatCanvas.getContext("2d");
  if (!heatCtx) {
    return null;
  }

  const colorizer = buildColorizer(range);
  heatCtx.globalAlpha = 0.95;
  heatCtx.globalCompositeOperation = "lighter";
  for (const point of points) {
    const { lat, lon, value } = point || {};
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(value)) {
      continue;
    }
    const normalizedLon = ((Number(lon) + 540) % 360) - 180;
    const x = ((normalizedLon + 180) / 360) * width;
    const y = (1 - (lat + 90) / 180) * height;
    const { rgb, intensity } = colorizer(value);
    const jitter = jitterOffset(lat, lon, HEAT_JITTER_PX * (0.35 + intensity));
    drawHeatCell(heatCtx, x + jitter.dx, y + jitter.dy, rgb, intensity);
  }
  heatCtx.globalAlpha = 1;
  heatCtx.globalCompositeOperation = "source-over";

  const smearCanvas = blurHeatLayer(heatCanvas, HEAT_GLOBAL_BLUR);
  blendHeatLayer(ctx, heatCanvas, smearCanvas);
  applyNoiseOverlay(ctx, width, height, 0.05);

  try {
    return canvas.toDataURL("image/png");
  } catch (err) {
    console.warn("Failed to generate heatmap texture", err);
    return null;
  }
}

function drawHeatCell(ctx, x, y, rgb, intensity) {
  const radius = HEAT_DOT_RADIUS * (0.55 + intensity * 1.1);
  const [r, g, b] = rgb;
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, `rgba(${r},${g},${b},0.95)`);
  gradient.addColorStop(0.55, `rgba(${r},${g},${b},0.35)`);
  gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  ctx.fillStyle = `rgba(${r},${g},${b},0.08)`;
  ctx.fillRect(x - radius * 0.4, y - radius * 0.4, radius * 0.8, radius * 0.8);
}

function blendHeatLayer(ctx, detailCanvas, smearCanvas) {
  if (smearCanvas) {
    ctx.save();
    ctx.globalCompositeOperation = "color";
    ctx.globalAlpha = 0.98;
    ctx.drawImage(smearCanvas, 0, 0);
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = "soft-light";
    ctx.globalAlpha = 0.9;
    ctx.drawImage(smearCanvas, 0, 0);
    ctx.restore();
  }

  ctx.save();
  ctx.globalCompositeOperation = "overlay";
  ctx.globalAlpha = 0.85;
  ctx.drawImage(detailCanvas, 0, 0);
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = 0.45;
  ctx.filter = `blur(${HEAT_GLOW_BLUR}px)`;
  ctx.drawImage(detailCanvas, 0, 0);
  ctx.restore();
}

function blurHeatLayer(sourceCanvas, blurAmount) {
  if (!sourceCanvas) return null;
  const canvas = document.createElement("canvas");
  canvas.width = sourceCanvas.width;
  canvas.height = sourceCanvas.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.filter = `blur(${blurAmount}px)`;
  ctx.drawImage(sourceCanvas, 0, 0);
  return canvas;
}

function applyNoiseOverlay(ctx, width, height, alpha = 0.04) {
  if (typeof document === "undefined") {
    return;
  }
  const noiseCanvas = document.createElement("canvas");
  noiseCanvas.width = width;
  noiseCanvas.height = height;
  const noiseCtx = noiseCanvas.getContext("2d");
  if (!noiseCtx) {
    return;
  }

  const imageData = noiseCtx.createImageData(width, height);
  const buffer = imageData.data;
  const opacity = Math.max(0, Math.min(1, alpha));
  const alphaByte = Math.floor(opacity * 255);
  for (let i = 0; i < buffer.length; i += 4) {
    const shade = 150 + Math.random() * 90;
    buffer[i] = shade;
    buffer[i + 1] = shade;
    buffer[i + 2] = shade;
    buffer[i + 3] = alphaByte;
  }
  noiseCtx.putImageData(imageData, 0, 0);

  ctx.save();
  ctx.globalCompositeOperation = "color-dodge";
  ctx.drawImage(noiseCanvas, 0, 0);
  ctx.restore();
}

function jitterOffset(lat, lon, magnitudePx) {
  const seedA = pseudoRandom(lat, lon);
  const seedB = pseudoRandom(lon, lat);
  const angle = seedA * Math.PI * 2;
  const distance = (seedB - 0.5) * 2 * magnitudePx;
  return {
    dx: Math.cos(angle) * distance,
    dy: Math.sin(angle) * distance,
  };
}

function pseudoRandom(a, b) {
  const raw = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return raw - Math.floor(raw);
}

function sampleGradient(t) {
  const clamped = clamp01(t);
  for (let i = 0; i < HEATMAP_STOPS.length - 1; i += 1) {
    const current = HEATMAP_STOPS[i];
    const next = HEATMAP_STOPS[i + 1];
    if (clamped >= current.t && clamped <= next.t) {
      const localT = (clamped - current.t) / (next.t - current.t || 1);
      return lerpColor(current.color, next.color, localT);
    }
  }
  return HEATMAP_STOPS[HEATMAP_STOPS.length - 1].color;
}

function lerpColor(start, end, t) {
  return [
    Math.round(start[0] + (end[0] - start[0]) * t),
    Math.round(start[1] + (end[1] - start[1]) * t),
    Math.round(start[2] + (end[2] - start[2]) * t),
  ];
}

function clamp01(value) {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
