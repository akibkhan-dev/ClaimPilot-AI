// API client — centralizes all fetch calls from the frontend to the FastAPI backend
// Uses relative "/api/..." paths — works in dev (Vite proxy) and prod (StaticFiles)

const BASE = "";   // empty = same origin; Vite proxy forwards /api → localhost:8000

/**
 * POST /api/analyze-damage
 * @param {File}   file        - The uploaded image file
 * @param {Object} vehicleMeta - Optional vehicle metadata fields that enable the
 *                               YOLO + RandomForest trained-model estimation path.
 *                               Keys: brand, model, color, type, fuel, year.
 *                               Undefined/empty values are omitted from the request.
 */
export async function analyzeDamage(file, vehicleMeta = {}) {
  const form = new FormData();
  form.append("file", file);
  // Append each vehicle metadata field only if it has a value
  Object.entries(vehicleMeta).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== "") {
      form.append(key, val);
    }
  });
  const res = await fetch(`${BASE}/api/analyze-damage`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`analyzeDamage HTTP ${res.status}`);
  return res.json();
}

/**
 * POST /api/verify-document
 * @param {File} file  - The uploaded document image
 */
export async function verifyDocument(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/api/verify-document`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`verifyDocument HTTP ${res.status}`);
  return res.json();
}

/**
 * POST /api/fraud-check
 * @param {Object} data - Claim fields
 */
export async function fraudCheck(data) {
  const form = new FormData();
  Object.entries(data).forEach(([k, v]) => form.append(k, v));
  const res = await fetch(`${BASE}/api/fraud-check`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`fraudCheck HTTP ${res.status}`);
  return res.json();
}

/**
 * GET /api/claims
 */
export async function fetchClaims() {
  const res = await fetch(`${BASE}/api/claims`);
  if (!res.ok) throw new Error(`fetchClaims HTTP ${res.status}`);
  return res.json();
}
