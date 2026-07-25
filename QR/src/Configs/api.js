
// ─────────────────────────────────────────────────────────────
// QR App → Backend Connection
//
// IMPORTANT: Use your PC's local WiFi IP (not localhost).
// Phones on the same WiFi network need the real IP to connect.
//
// Your PC's current local IP: 10.190.187.6
// Backend runs on port: 3000
//
// To find your IP: run `ipconfig` in cmd and look for IPv4
// ─────────────────────────────────────────────────────────────

export const BASE_URL =
  process.env.REACT_APP_API_URL ||   // set in .env file for easy override
  "http://10.190.187.6:3000";        // ← your PC's WiFi IP + backend port

// Production (Railway) fallback — uncomment when deployed:
// export const BASE_URL = "https://demo2026pondy-production.up.railway.app";