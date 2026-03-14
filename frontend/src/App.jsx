import { useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import DashboardPage from "./pages/DashboardPage.jsx";
import ComparisonPage from "./pages/ComparisonPage.jsx";
import GlobePage from "./pages/GlobePage.jsx";

const navLinks = [
  { to: "/", label: "Explorer" },
  { to: "/compare", label: "Comparison" },
  { to: "/globe", label: "3D Globe" },
];

const getStoredTheme = () => {
  if (typeof window === "undefined") {
    return "dark";
  }
  return window.localStorage.getItem("pyce-theme") || "dark";
};

export default function App() {
  const [theme, setTheme] = useState(getStoredTheme);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.dataset.theme = theme;
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem("pyce-theme", theme);
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  const buttonLabel = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>PyClimaExplorer</h1>
        <div className="header-actions">
          <nav>
            {navLinks.map((link) => (
              <NavLink key={link.to} to={link.to} className={({ isActive }) => (isActive ? "active" : "")}
                end>
                {link.label}
              </NavLink>
            ))}
          </nav>
          <button type="button" className="theme-toggle" onClick={toggleTheme} aria-label={buttonLabel}>
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
          </button>
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/compare" element={<ComparisonPage theme={theme} />} />
          <Route path="/globe" element={<GlobePage />} />
        </Routes>
      </main>
    </div>
  );
}
