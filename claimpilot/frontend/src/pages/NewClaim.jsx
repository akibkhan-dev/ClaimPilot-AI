// NewClaim page — the core enhancement: a 4-step guided wizard that wraps
// Module B (document verification), Module A (damage assessment), and
// Module C (fraud check) into one sequential, gated flow instead of three
// independent tabs. Nothing about the backend contract changes — this file
// just calls the same api/client.js functions in the right order.

import { useState } from "react";
import { verifyDocument, analyzeDamage, fraudCheck } from "../api/client";
import { getProfile, nameMatches, idNumberMatch, dlNotExpired } from "../lib/profile";
import Stepper from "../components/Stepper";
import VerificationSeal from "../components/VerificationSeal";
import StatusBadge from "../components/StatusBadge";
import ResultCard from "../components/ResultCard";

const STEPS = ["Incident", "Documents", "Damage", "Review"];

const SEVERITY_TONE = { minor: "warning", moderate: "brass", severe: "danger", unclear: "neutral" };

const SOURCE_LABEL = {
  trained_model:  { icon: <IconCpu />, text: "Trained model" },
  groq_llm:       {  text: "Verified" },
  fallback_table: { icon: <IconTable />, text: "Reference table" },
};

// A document only counts as verified if the backend says complete, the AI
// call actually succeeded (not the defensive fallback), no fields are
// missing, AND the extracted name matches the profile owner.
function isReallyVerified(doc, profileName, extraCheck, { checkName = true } = {}) {
  const r = doc.result;
  if (!r) return false;
  const baseOk = (
    r.is_complete === true &&
    r.source !== "fallback" &&
    (!r.missing_fields || r.missing_fields.length === 0) &&
    (!checkName || nameMatches(profileName, r.fields_found?.name))
  );
  if (!baseOk) return false;
  // Optional document-type-specific extra rule check (e.g. RC book's
  // extracted registration number must match the profile's car_number,
  // or DL's number + expiry checks).
  return extraCheck ? extraCheck(r) : true;
}

const EMPTY_DOC_SLOT = { file: null, preview: null, result: null, loading: false, error: null };

export default function NewClaim({ setPage }) {
  const profile = getProfile();
  const [step, setStep] = useState(0);

  // ── Step 1: Incident details ─────────────────────────────────────────
  const [incident, setIncident] = useState({
    claim_id: "",
    claimed_amount_inr: "",
    brand: profile?.brand || "",
    vehicle_model: profile?.vehicle_model || "",
    color: profile?.color || "",
    vehicle_type: profile?.vehicle_type || "",
    fuel: profile?.fuel || "",
    year: profile?.year || "",
  });

  // ── Step 2: Document verification ────────────────────────────────────
  const [documents, setDocuments] = useState({
    rc_book:         { ...EMPTY_DOC_SLOT },
    driving_licence: { ...EMPTY_DOC_SLOT },
  });

  // ── Step 3: Damage assessment ─────────────────────────────────────────
  const [damage, setDamage] = useState({ file: null, preview: null, result: null, loading: false, error: null });

  // ── Step 4: Review & submit (fraud check) ────────────────────────────
  const [submit, setSubmit] = useState({ loading: false, result: null, error: null });

  const rcVerified = isReallyVerified(
    documents.rc_book,
    profile?.customer_name,
    (r) => idNumberMatch(profile?.car_number, r.fields_found?.id_number)
  );

  const dlVerified = isReallyVerified(
    documents.driving_licence,
    profile?.customer_name,
    (r) => {
      const numberOk = idNumberMatch(profile?.dl_number, r.fields_found?.id_number);
      // dlNotExpired returns true / false / null (unparseable — don't block on unknown)
      const expiryOk = dlNotExpired(r.fields_found?.expiry_date) !== false;
      return numberOk && expiryOk;
    },
    { checkName: false } // DL: name isn't checked — only licence number + expiry
  );

  const bothVerified = rcVerified && dlVerified;

  const incidentValid = incident.claim_id.trim() && incident.claimed_amount_inr;

  async function handleDocUpload(slot, file) {
    if (!file) return;
    setDocuments((prev) => ({
      ...prev,
      [slot]: { ...EMPTY_DOC_SLOT, file, preview: URL.createObjectURL(file), loading: true },
    }));
    try {
      const result = await verifyDocument(file);
      if (result.error) throw new Error(result.error);
      setDocuments((prev) => ({ ...prev, [slot]: { ...prev[slot], result, loading: false } }));
    } catch (err) {
      setDocuments((prev) => ({
        ...prev,
        [slot]: { ...prev[slot], loading: false, error: err.message || "Verification failed." },
      }));
    }
  }

  async function handleDamageUpload(file) {
    if (!file) return;
    setDamage({ file, preview: URL.createObjectURL(file), result: null, loading: true, error: null });
    try {
      const result = await analyzeDamage(file, {
        brand: incident.brand || undefined,
        model: incident.vehicle_model || undefined,
        color: incident.color || undefined,
        type: incident.vehicle_type || undefined,
        fuel: incident.fuel || undefined,
        year: incident.year || undefined,
      });
      if (result.error) throw new Error(result.error);
      setDamage((prev) => ({ ...prev, result, loading: false }));
    } catch (err) {
      setDamage((prev) => ({ ...prev, loading: false, error: err.message || "Damage analysis failed." }));
    }
  }

  async function handleFinalSubmit() {
    setSubmit({ loading: true, result: null, error: null });
    try {
      const result = await fraudCheck({
        claim_id: incident.claim_id,
        car_number: profile?.car_number || "",
        severity: damage.result?.severity || "moderate",
        damaged_part: damage.result?.damaged_part || "",
        claimed_amount_inr: parseFloat(incident.claimed_amount_inr),
        cost_min_inr: damage.result?.estimated_cost_min_inr ?? 0,
        cost_max_inr: damage.result?.estimated_cost_max_inr ?? 0,
      });
      if (result.error) throw new Error(result.error);
      setSubmit({ loading: false, result, error: null });
    } catch (err) {
      setSubmit({ loading: false, result: null, error: err.message || "Submission failed." });
    }
  }

  if (!profile?.car_number || !profile?.dl_number) {
    return (
      <div className="max-w-lg bg-white rounded-xl border border-brass/30 shadow-card p-6">
        <h2 className="font-display text-lg font-semibold text-navy mb-2">Profile required</h2>
        <p className="text-sm text-slate mb-4">
          We need your vehicle and licence details before you can file a claim — this is also what your uploaded
          documents get checked against.
        </p>
        <button onClick={() => setPage("profile")} className="bg-brass hover:bg-brass-dark text-navy font-semibold px-5 py-2.5 rounded-lg text-sm">
          Complete Profile
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <header className="mb-2">
        <h1 className="font-display text-2xl font-semibold text-navy">File a New Claim</h1>
        <p className="text-sm text-slate mt-1">Vehicle {profile.car_number} · Policy {profile.policy_number}</p>
      </header>

      <Stepper steps={STEPS} currentStep={step} />

      {step === 0 && (
        <IncidentStep
          incident={incident} setIncident={setIncident}
          onNext={() => setStep(1)} valid={incidentValid}
        />
      )}

      {step === 1 && (
        <DocumentsStep
          documents={documents} onUpload={handleDocUpload}
          rcVerified={rcVerified} dlVerified={dlVerified} bothVerified={bothVerified}
          profileName={profile.customer_name}
          profileCarNumber={profile.car_number}
          profileDlNumber={profile.dl_number}
          onBack={() => setStep(0)} onNext={() => setStep(2)}
        />
      )}

      {step === 2 && (
        <DamageStep
          damage={damage} onUpload={handleDamageUpload}
          onBack={() => setStep(1)} onNext={() => setStep(3)}
        />
      )}

      {step === 3 && (
        <ReviewStep
          incident={incident} profile={profile} damage={damage} submit={submit}
          onBack={() => setStep(2)} onSubmit={handleFinalSubmit}
          onDone={() => setPage("claims")}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Inline icons — kept local to this file, matches the SVG style already
// used in VerificationSeal.jsx and Stepper.jsx (stroke-based, currentColor)
// ─────────────────────────────────────────────────────────────────────────
function IconDocument() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m-7 5h8a2 2 0 002-2V7.414a1 1 0 00-.293-.707l-3.414-3.414A1 1 0 0013.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  );
}
function IconIdCard() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <rect x="3" y="5" width="18" height="14" rx="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="8.5" cy="10.5" r="1.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.5 15c.5-1.5 1.8-2 3-2s2.5.5 3 2M14 9.5h5M14 13h5" />
    </svg>
  );
}
function IconCamera() {
  return (
    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h1.5l1-1.5h9l1 1.5H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
      <circle cx="12" cy="13" r="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconWarning({ className = "w-4 h-4 inline -mt-0.5 mr-1" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </svg>
  );
}
function IconCpu() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <rect x="6" y="6" width="12" height="12" rx="1" />
      <path strokeLinecap="round" d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" />
    </svg>
  );
}
function IconSpark() {
  return (
    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2z" />
    </svg>
  );
}
function IconTable() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <rect x="4" y="4" width="16" height="16" rx="1" />
      <path strokeLinecap="round" d="M4 10h16M10 4v16" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// STEP 1 — Incident & Vehicle Details
// ─────────────────────────────────────────────────────────────────────────
function IncidentStep({ incident, setIncident, onNext, valid }) {
  function handleChange(e) {
    setIncident((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }
  return (
    <div className="bg-white rounded-xl border border-navy/10 shadow-card p-6 space-y-5">
      <h2 className="font-display text-base font-semibold text-navy">Incident Details</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Claim ID *" name="claim_id" value={incident.claim_id} onChange={handleChange} placeholder="CLM-2026-001" mono />
        <Field label="Claimed Amount (₹) *" name="claimed_amount_inr" value={incident.claimed_amount_inr} onChange={handleChange} type="number" placeholder="25000" />
      </div>

      <details className="border border-navy/10 rounded-lg" open>
        <summary className="px-4 py-3 text-sm font-medium text-navy cursor-pointer select-none">
          Vehicle Details
          <span className="ml-2 text-xs font-normal text-brass-dark bg-brass/10 px-2 py-0.5 rounded-full">Improves damage estimate accuracy</span>
        </summary>
        <div className="px-4 pb-4 pt-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Field label="Brand" name="brand" value={incident.brand} onChange={handleChange} placeholder="Maruti" />
          <Field label="Model" name="vehicle_model" value={incident.vehicle_model} onChange={handleChange} placeholder="Swift" />
          <Field label="Color" name="color" value={incident.color} onChange={handleChange} placeholder="White" />
          <SelectField label="Type" name="vehicle_type" value={incident.vehicle_type} onChange={handleChange} options={["Hatchback","Sedan","SUV","MUV","Truck","Van"]} />
          <SelectField label="Fuel" name="fuel" value={incident.fuel} onChange={handleChange} options={["Petrol","Diesel","CNG","Electric","Hybrid"]} />
          <Field label="Year" name="year" value={incident.year} onChange={handleChange} type="number" placeholder="2019" />
        </div>
      </details>

      <div className="flex justify-end">
        <button onClick={onNext} disabled={!valid}
          className="bg-navy hover:bg-navy-light disabled:bg-slate/30 text-paper font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors">
          Next: Document Verification →
        </button>
      </div>
    </div>
  );
}

function Field({ label, mono, ...props }) {
  return (
    <div>
      <label className="block text-sm font-medium text-navy/80 mb-1">{label}</label>
      <input {...props}
        className={`w-full border border-navy/15 rounded-lg px-3 py-2 text-sm bg-paper focus:outline-none focus:ring-2 focus:ring-brass/50 ${mono ? "font-mono" : ""}`} />
    </div>
  );
}
function SelectField({ label, options, ...props }) {
  return (
    <div>
      <label className="block text-sm font-medium text-navy/80 mb-1">{label}</label>
      <select {...props} className="w-full border border-navy/15 rounded-lg px-3 py-2 text-sm bg-paper focus:outline-none focus:ring-2 focus:ring-brass/50">
        <option value="">Select…</option>
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────
// STEP 2 — Document Verification (the gate)
// ─────────────────────────────────────────────────────────────────────────
function DocumentsStep({ documents, onUpload, rcVerified, dlVerified, bothVerified, profileName, profileCarNumber, profileDlNumber, onBack, onNext }) {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-navy/10 shadow-card p-6">
        <h2 className="font-display text-base font-semibold text-navy mb-1">Document Verification</h2>
        <p className="text-xs text-slate mb-5">
          Upload your RC book and driving licence. Each document's extracted details (system-verified) get
          checked against what's on your profile (client-provided) — before you can continue.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <DocSlot
            slotKey="rc_book" title="RC Book" icon={<IconDocument />}
            slot={documents.rc_book} verified={rcVerified}
            onUpload={(file) => onUpload("rc_book", file)}
            profileName={profileName}
            matchFieldLabel="Vehicle Number"
            profileMatchValue={profileCarNumber}
            checkExpiry={false}
            checkName={true}
          />
          <DocSlot
            slotKey="driving_licence" title="Driving Licence" icon={<IconIdCard />}
            slot={documents.driving_licence} verified={dlVerified}
            onUpload={(file) => onUpload("driving_licence", file)}
            profileName={profileName}
            matchFieldLabel="Licence Number"
            profileMatchValue={profileDlNumber}
            checkExpiry={true}
            checkName={false}
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-navy/10 shadow-card p-6 flex flex-col items-center">
        <VerificationSeal verified={bothVerified} />
      </div>

      <div className="flex justify-between">
        <button onClick={onBack} className="text-slate hover:text-navy font-medium text-sm px-4 py-2.5">
          ← Back
        </button>
        <button onClick={onNext} disabled={!bothVerified}
          className="bg-navy hover:bg-navy-light disabled:bg-slate/30 text-paper font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors">
          Next: Damage Assessment →
        </button>
      </div>
    </div>
  );
}

// Generalized for both RC Book (matchFieldLabel="Vehicle Number", no expiry)
// and DL (matchFieldLabel="Licence Number", checkExpiry=true). Each slot is
// split into what the client provided (profile + uploaded photo) vs what
// the system extracted and verified (OCR/LLM fields + match status).
function DocSlot({ title, icon, slot, verified, onUpload, profileName, matchFieldLabel, profileMatchValue, checkExpiry, checkName = true }) {
  const r = slot.result;
  const extractionOk = r?.is_complete && r?.source !== "fallback";

  const nameOk = checkName && extractionOk && r?.fields_found?.name ? nameMatches(profileName, r.fields_found.name) : null;
  const nameMismatch = checkName && extractionOk && r?.fields_found?.name && nameOk === false;

  const numberOk = extractionOk && r?.fields_found?.id_number
    ? idNumberMatch(profileMatchValue, r.fields_found.id_number)
    : null;
  const numberMismatch = extractionOk && r?.fields_found?.id_number && numberOk === false;

  const expiryStatus = checkExpiry && r?.fields_found?.expiry_date
    ? dlNotExpired(r.fields_found.expiry_date) // true / false / null
    : null;
  const expired = checkExpiry && expiryStatus === false;
  const expiryUnknown = checkExpiry && extractionOk && !r?.fields_found?.expiry_date;

  const hasIssue = slot.error || nameMismatch || numberMismatch || expired;

  return (
    <div className={`border-2 rounded-xl p-4 transition-colors ${
      verified ? "border-verified/40 bg-verified/5" : hasIssue ? "border-rust/40 bg-rust/5" : "border-dashed border-navy/20"
    }`}>
      <label className="cursor-pointer">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-navy flex items-center gap-1.5">
            <span className="text-navy/70">{icon}</span> {title}
          </p>
          {verified && <StatusBadge tone="success">Verified</StatusBadge>}
          {!verified && r && !slot.loading && <StatusBadge tone="danger">Not Verified</StatusBadge>}
        </div>

        {slot.preview ? (
          <img src={slot.preview} alt="" className="w-full h-28 object-contain rounded-lg bg-paper mb-2" />
        ) : (
          <div className="w-full h-28 flex items-center justify-center text-xs text-slate/50 rounded-lg bg-paper mb-2">
            Click to upload
          </div>
        )}
        <input type="file" accept="image/*" className="hidden" onChange={(e) => onUpload(e.target.files[0])} />
      </label>

      {slot.loading && <p className="text-xs text-slate mt-1">Verifying…</p>}
      {slot.error && <p className="text-xs text-rust mt-1">{slot.error}</p>}

      {/* Client-provided reference values (from Profile) */}
      <div className="mt-2 text-[11px] text-slate/70 flex flex-wrap gap-x-3 gap-y-0.5">
        <span className="uppercase tracking-wide font-medium text-slate/50">Provided by you:</span>
        {checkName && <span>Name: <span className="text-navy/70">{profileName || "—"}</span></span>}
        <span>{matchFieldLabel}: <span className="text-navy/70">{profileMatchValue || "—"}</span></span>
      </div>

      {r && !slot.loading && (
        <div className="mt-2 space-y-1 text-xs border-t border-navy/10 pt-2">
          <p className="uppercase tracking-wide font-medium text-slate/50 text-[11px]">System verified:</p>
          <p className="text-slate">Detected: <span className="text-navy">{r.document_type_guess}</span></p>
          {checkName && r.fields_found?.name && <p className="text-slate">Name on document: <span className="text-navy">{r.fields_found.name}</span></p>}
          {r.fields_found?.id_number && <p className="text-slate">{matchFieldLabel} on document: <span className="text-navy">{r.fields_found.id_number}</span></p>}
          {checkExpiry && r.fields_found?.expiry_date && (
            <p className="text-slate">Expiry on document: <span className="text-navy">{r.fields_found.expiry_date}</span></p>
          )}

          {nameMismatch && <p className="text-rust font-medium"><IconWarning />Name doesn't match your profile — re-check or re-upload.</p>}
          {numberMismatch && <p className="text-rust font-medium"><IconWarning />{matchFieldLabel} doesn't match your saved {matchFieldLabel.toLowerCase()} — re-check or re-upload.</p>}
          {expired && <p className="text-rust font-medium"><IconWarning />Licence has expired — claim cannot be verified with an expired DL.</p>}
          {expiryUnknown && <p className="text-brass-dark">Could not read expiry date from the document.</p>}
          {r.missing_fields?.length > 0 && <p className="text-brass-dark">Missing: {r.missing_fields.join(", ")}</p>}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// STEP 3 — Damage Assessment
// ─────────────────────────────────────────────────────────────────────────
function DamageStep({ damage, onUpload, onBack, onNext }) {
  const r = damage.result;
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-navy/10 shadow-card p-6">
        <h2 className="font-display text-base font-semibold text-navy mb-4">Damage Photo</h2>
        <label className="cursor-pointer block">
          <div className="border-2 border-dashed border-navy/20 rounded-xl p-6 text-center hover:border-brass/50 transition-colors">
            {damage.preview ? (
              <img src={damage.preview} alt="" className="mx-auto max-h-56 rounded-lg object-contain" />
            ) : (
              <div className="text-slate/50 flex flex-col items-center gap-2">
                <IconCamera />
                <p className="text-sm">Click to upload a damage photo</p>
              </div>
            )}
          </div>
          <input type="file" accept="image/*" className="hidden" onChange={(e) => onUpload(e.target.files[0])} />
        </label>
        {damage.loading && <p className="text-sm text-slate mt-3">Analysing damage photo…</p>}
        {damage.error && <p className="text-sm text-rust mt-3">{damage.error}</p>}
      </div>

      {r && (
        <ResultCard title="Damage Assessment">
          <div className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <StatusBadge tone={SEVERITY_TONE[r.severity] || "neutral"}>{r.severity || "unknown"}</StatusBadge>
              <span className="text-xs text-slate">Confidence: {((r.confidence ?? 0) * 100).toFixed(0)}%</span>
              {r.estimation_source && SOURCE_LABEL[r.estimation_source] && (
                <StatusBadge tone="info">
                  <span className="flex items-center gap-1">
                    {SOURCE_LABEL[r.estimation_source].icon}
                    {SOURCE_LABEL[r.estimation_source].text}
                  </span>
                </StatusBadge>
              )}
            </div>
            {r.damaged_part && <p className="text-sm text-navy"><span className="font-medium">Part:</span> {r.damaged_part}</p>}
            <div className="bg-brass/10 rounded-lg p-3 text-sm">
              <p className="font-semibold text-navy">
                Estimated Repair: ₹{(r.estimated_cost_min_inr ?? 0).toLocaleString("en-IN")} – ₹{(r.estimated_cost_max_inr ?? 0).toLocaleString("en-IN")}
              </p>
              {r.cost_reasoning && <p className="text-slate text-xs mt-1">{r.cost_reasoning}</p>}
            </div>
            {r.manual_review_recommended && (
              <p className="text-xs text-brass-dark font-medium"><IconWarning />Manual review recommended — confidence below threshold</p>
            )}
          </div>
        </ResultCard>
      )}

      <div className="flex justify-between">
        <button onClick={onBack} className="text-slate hover:text-navy font-medium text-sm px-4 py-2.5">← Back</button>
        <button onClick={onNext} disabled={!r}
          className="bg-navy hover:bg-navy-light disabled:bg-slate/30 text-paper font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors">
          Next: Review & Submit →
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// STEP 4 — Review & Submit (Module C: fraud check + persistence)
// ─────────────────────────────────────────────────────────────────────────
function ReviewStep({ incident, profile, damage, submit, onBack, onSubmit, onDone }) {
  if (submit.result) {
    const flagged = submit.result.is_flagged;
    return (
      <div className={`rounded-xl border shadow-card p-6 ${flagged ? "border-rust/30 bg-rust/5" : "border-verified/30 bg-verified/5"}`}>
        <h2 className={`font-display text-lg font-semibold mb-2 ${flagged ? "text-rust-dark" : "text-verified-dark"}`}>
          {submit.result.status}
        </h2>
        <p className="text-sm text-navy mb-3">
          Claim <span className="font-mono">{incident.claim_id}</span> has been {flagged ? "submitted and flagged for manual review." : "submitted successfully."}
        </p>
        {submit.result.flags?.length > 0 && (
          <ul className="space-y-1 mb-4">
            {submit.result.flags.map((f, i) => <li key={i} className="text-xs text-rust">• {f}</li>)}
          </ul>
        )}
        <button onClick={onDone} className="bg-navy hover:bg-navy-light text-paper font-semibold px-5 py-2.5 rounded-lg text-sm">
          View All Claims →
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-navy/10 shadow-card p-6">
        <h2 className="font-display text-base font-semibold text-navy mb-4">Review</h2>
        <dl className="grid grid-cols-2 gap-y-3 text-sm">
          <dt className="text-slate">Claim ID</dt><dd className="font-mono text-navy">{incident.claim_id}</dd>
          <dt className="text-slate">Vehicle</dt><dd className="font-mono text-navy">{profile.car_number}</dd>
          <dt className="text-slate">Claimed Amount</dt><dd className="text-navy">₹{parseFloat(incident.claimed_amount_inr || 0).toLocaleString("en-IN")}</dd>
          <dt className="text-slate">Severity</dt><dd className="text-navy capitalize">{damage.result?.severity}</dd>
          <dt className="text-slate">Estimated Cost</dt>
          <dd className="text-navy">₹{(damage.result?.estimated_cost_min_inr ?? 0).toLocaleString("en-IN")} – ₹{(damage.result?.estimated_cost_max_inr ?? 0).toLocaleString("en-IN")}</dd>
        </dl>
      </div>

      {submit.error && <p className="text-sm text-rust">{submit.error}</p>}

      <div className="flex justify-between">
        <button onClick={onBack} className="text-slate hover:text-navy font-medium text-sm px-4 py-2.5">← Back</button>
        <button onClick={onSubmit} disabled={submit.loading}
          className="bg-brass hover:bg-brass-dark disabled:bg-brass/40 text-navy font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors">
          {submit.loading ? "Running fraud check…" : "Submit Claim"}
        </button>
      </div>
    </div>
  );
}