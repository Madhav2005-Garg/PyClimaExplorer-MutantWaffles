const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

const endpointMap = {
  temperature: "/api/temperature",
  precipitation: "/api/precipitation",
  wind: "/api/wind",
};

export async function fetchClimateSlice(variable, payload) {
  const endpoint = endpointMap[variable];
  if (!endpoint) {
    throw new Error(`Unknown variable: ${variable}`);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || "Failed to fetch climate data");
  }

  return response.json();
}

export async function fetchGeocode(query) {
  const response = await fetch(`${API_BASE}/api/geocode`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || "Failed to fetch geocode");
  }
  return response.json();
}

export async function fetchStory(payload) {
  const response = await fetch(`${API_BASE}/api/story`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) return { story: "Error generating insight." };
  return response.json();
}

export async function fetchStoryCompare(payload) {
  const response = await fetch(`${API_BASE}/api/story/compare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) return { story: "Error generating insight." };
  return response.json();
}

export function formatDateRange(yearStart, yearEnd) {
  const start = `${yearStart}-01-01`;
  const end = `${yearEnd}-12-31`;
  return { start, end };
}
