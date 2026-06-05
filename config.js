/* ============================================================
   KIFIYA CEO DASHBOARD — CONFIGURATION
   This is the ONLY file you edit to go from demo → live data.
   ============================================================ */

window.DASHBOARD_CONFIG = {

  // ---- DATA SOURCE ----------------------------------------------------
  // "demo"  = use embedded sample data in data.js (works offline, today)
  // "live"  = fetch JSON from your proxy endpoints (see PROXY_BASE below)
  MODE: "live",   // "Demo" or "live"

  // Base URL of the small proxy/API that talks to Business Central ON-PREM.
  // The browser CANNOT call BC OData directly (CORS + credentials must stay
  // server-side), so this proxy holds the BC username + Web Service Access Key
  // and returns clean JSON. Run the included `proxy/server.js` on a machine
  // that can reach your BC server (same LAN/VPN), then put its URL here.
  // Leave blank while in demo mode.
  PROXY_BASE:"http://localhost:8080",   // e.g. "http://localhost:8080"

  // Endpoint map — the proxy should expose these returning the shapes
  // documented in data.js. Change paths to match your proxy if needed.
  ENDPOINTS: {
    budgetActual:  "/api/budget-actual",
    budgetOverview:"/api/budget-overview",
    cashflow:      "/api/cashflow",
    reports:       "/api/reports"
  },

  // Auto-refresh interval in seconds (0 = off). 300 = every 5 min.
  REFRESH_SECONDS: 300,

  // Currency formatting
  CURRENCY: "ETB",
  SCALE_LABEL: "Millions"
};
