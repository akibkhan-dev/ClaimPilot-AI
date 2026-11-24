// lib/profile.js
// Profile shape, persistence, and cross-check helpers used by
// Profile.jsx (data entry) and NewClaim.jsx (document verification).

const STORAGE_KEY = "claim_profile_v1";

export const EMPTY_PROFILE = {
  // Your Details
  customer_name: "",
  policy_number: "",
  contact_number: "",

  // RC Book Details
  car_number: "",
  brand: "",
  vehicle_model: "",
  color: "",
  vehicle_type: "",
  fuel: "",
  year: "",

  // DL Details
  dl_number: "",
  dl_expiry: "", // optional manual entry; OCR-extracted expiry (at claim time) is cross-checked against this if present
};

const REQUIRED_FIELDS = ["customer_name", "policy_number", "contact_number", "car_number", "dl_number"];

export function getProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return { ...EMPTY_PROFILE, ...JSON.parse(raw) };
  } catch {
    return null;
  }
}

export function saveProfile(profile) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

export function isProfileComplete(profile) {
  if (!profile) return false;
  return REQUIRED_FIELDS.every((key) => String(profile[key] || "").trim().length > 0);
}

// --- Cross-check helpers used during document verification (NewClaim.jsx) ---

function normalize(str) {
  return String(str || "").trim().toUpperCase().replace(/\s+/g, "");
}

export function nameMatches(extractedName, profileName) {
  if (!extractedName || !profileName) return false;
  return normalize(extractedName) === normalize(profileName);
}

// Generic id/registration-number matcher — used for both
// RC Book (car_number) and DL (dl_number) checks.
export function idNumberMatch(extractedId, profileId) {
  if (!extractedId || !profileId) return false;
  return normalize(extractedId) === normalize(profileId);
}

// Parses common date formats seen in OCR output (DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD)
export function parseDate(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();

  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/); // YYYY-MM-DD
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/); // DD/MM/YYYY or DD-MM-YYYY
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = `20${y}`;
    return new Date(Number(y), Number(mo) - 1, Number(d));
  }

  const fallback = new Date(s);
  return isNaN(fallback.getTime()) ? null : fallback;
}

// Returns true only if we can parse the expiry date AND it is today-or-later.
// A missing/unparseable date does NOT count as "not expired" — caller should
// treat it as "unable to verify" rather than pass/fail.
export function dlNotExpired(extractedExpiryStr) {
  const expiry = parseDate(extractedExpiryStr);
  if (!expiry) return null; // unknown — could not parse
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);
  return expiry.getTime() >= today.getTime();
}