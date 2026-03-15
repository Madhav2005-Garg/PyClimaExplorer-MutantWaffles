import { useEffect, useRef, useState } from "react";
import { fetchClimateSlice, formatDateRange } from "../api/client.js";

const VARIABLE_OPTIONS = [
  { id: "temperature", label: "Temperature", unit: "°C" },
  { id: "precipitation", label: "Precipitation", unit: "mm/day" },
  { id: "wind", label: "Wind Speed", unit: "m/s" },
];

export default function MapPage() {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const geoLayerRef = useRef(null);
  const [variable, setVariable] = useState("temperature");
  const [year, setYear] = useState(2010);
  const [selection, setSelection] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mapReady, setMapReady] = useState(false);
  const [noData, setNoData] = useState(false);

  // load Leaflet from CDN lazily
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!mapRef.current || mapInstance.current) return;

      // inject Leaflet CSS if missing
      const cssId = "leaflet-cdn-style";
      if (!document.getElementById(cssId)) {
        const link = document.createElement("link");
        link.id = cssId;
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }

      const L = await import("https://unpkg.com/leaflet@1.9.4/dist/leaflet-src.esm.js");
      if (cancelled) return;

      const map = L.map(mapRef.current, { worldCopyJump: true }).setView([20, 0], 2.4);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        minZoom: 2,
        maxZoom: 6,
      }).addTo(map);

      mapInstance.current = { map, L };
      setMapReady(true);
    };
    load();
    return () => {
      cancelled = true;
      if (mapInstance.current) {
        mapInstance.current.map.remove();
        mapInstance.current = null;
      }
    };
  }, []);

  // load geojson and bind click
  useEffect(() => {
    let cancelled = false;
    const attachGeo = async () => {
      if (!mapInstance.current || !mapReady) return;
      const { L, map } = mapInstance.current;
      if (geoLayerRef.current) {
        geoLayerRef.current.remove();
        geoLayerRef.current = null;
      }
      const res = await fetch("https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json");
      const geojson = await res.json();
      if (cancelled) return;
      const layer = L.geoJSON(geojson, {
        style: () => ({
          color: "#4ad6ff",
          weight: 0.8,
          fillColor: "#4ad6ff",
          fillOpacity: 0.1,
        }),
        onEachFeature: (feature, leafletLayer) => {
          leafletLayer.on("click", () => handleCountryClick(feature, leafletLayer));
          leafletLayer.on("mouseover", () => leafletLayer.setStyle({ fillOpacity: 0.25 }));
          leafletLayer.on("mouseout", () => leafletLayer.setStyle({ fillOpacity: 0.1 }));
        },
      });
      layer.addTo(map);
      geoLayerRef.current = layer;
    };
    attachGeo();
    return () => {
      cancelled = true;
    };
  }, [mapReady]);

  const handleCountryClick = async (feature, leafletLayer) => {
    try {
      const bounds = leafletLayer.getBounds();
      mapInstance.current.map.fitBounds(bounds.pad(0.2));
      const bbox = featureBBox(feature);
      if (!bbox) return;
      setSelection({
        name: feature.properties?.name || "Unknown",
        region: bbox,
      });
      await pullData(bbox);
    } catch (err) {
      setError(err.message || "Failed to load country data");
    }
  };

  const pullData = async (region) => {
    setLoading(true);
    setError("");
    setNoData(false);
    try {
      const { start, end } = formatDateRange(year, year);
      const payload = {
        start_date: start,
        end_date: end,
        region,
      };
      const data = await fetchClimateSlice(variable, payload);
      const statsObj = data.statistics || null;
      setStats(statsObj);
      setNoData(!statsObj || Object.keys(statsObj).length === 0);
    } catch (err) {
      setStats(null);
      setError(err.message || "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  };

  // Refresh data when variable/year changes for the current selection
  useEffect(() => {
    if (selection?.region) {
      pullData(selection.region);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variable, year]);

  const variableLabel = VARIABLE_OPTIONS.find((v) => v.id === variable)?.label;
  const variableUnit = VARIABLE_OPTIONS.find((v) => v.id === variable)?.unit;

  return (
    <div>
      <section className="panel">
        <h2>World Map</h2>
        <p>Click a country to zoom and view a single year's data for the selected variable.</p>

        <div className="map-controls">
          <div className="control-card">
            <label>Variable</label>
            <select value={variable} onChange={(e) => setVariable(e.target.value)}>
              {VARIABLE_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="control-card">
            <label>Year: {year}</label>
            <div className="mono-slider" style={{ "--value": ((year - 1948) / (2019 - 1948) * 100).toFixed(1) }}>
              <input
                type="range"
                min={1948}
                max={2019}
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              />
            </div>
          </div>
        </div>

        <div className="map-container">
          <div ref={mapRef} className="leaflet-host" />
          {selection && (
            <div className="map-sidebar">
              <h4>{selection.name}</h4>
              <p>
                {variableLabel} ({variableUnit}) — {year}
              </p>
              {loading && <p className="info-text">Loading…</p>}
              {error && <p className="error-text">{error}</p>}
              {stats && (
                <div className="stats-grid">
                  {Object.entries(stats).map(([k, v]) => (
                    <div key={k} className="stat-card">
                      <div className="label">{k.toUpperCase()}</div>
                      <strong>{Number.isFinite(v) ? Number(v).toFixed(3) : "-"}</strong>
                    </div>
                  ))}
                </div>
              )}
              {!loading && noData && !error && <p className="info-text">No data available for this country.</p>}
              {!loading && !noData && !stats && !error && <p className="info-text">Click a country to load data.</p>}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function featureBBox(feature) {
  try {
    const coords = feature.geometry?.coordinates;
    if (!coords) return null;
    const flat = flattenCoords(coords, feature.geometry.type);
    if (!flat.length) return null;
    let latMin = Infinity, latMax = -Infinity, lonMin = Infinity, lonMax = -Infinity;
    flat.forEach(([lon, lat]) => {
      if (lat < latMin) latMin = lat;
      if (lat > latMax) latMax = lat;
      if (lon < lonMin) lonMin = lon;
      if (lon > lonMax) lonMax = lon;
    });
    return { lat_min: latMin, lat_max: latMax, lon_min: lonMin, lon_max: lonMax };
  } catch (err) {
    console.warn("Failed to compute bbox", err);
    return null;
  }
}

function flattenCoords(coords, type) {
  // Handles Polygon and MultiPolygon
  if (type === "Polygon") {
    return coords.flat();
  }
  if (type === "MultiPolygon") {
    return coords.flat(2);
  }
  return [];
}
