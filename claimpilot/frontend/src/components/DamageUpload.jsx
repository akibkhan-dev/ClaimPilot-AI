// Damage upload component — image upload form + calls /api/analyze-damage then /api/fraud-check

import { useState, useRef } from "react";
import { analyzeDamage, fraudCheck } from "../api/client";
import ResultCard from "./ResultCard";

const SEVERITY_COLOR = {
  minor:    "bg-yellow-100 text-yellow-800",
  moderate: "bg-orange-100 text-orange-800",
  severe:   "bg-red-100   text-red-800",
  unclear:  "bg-gray-100  text-gray-600",
};

// Badge colour for estimation_source field
const SOURCE_COLOR = {
  trained_model:  "bg-green-100  text-green-800",
  groq_llm:       "bg-blue-100   text-blue-800",
  fallback_table: "bg-yellow-100 text-yellow-800",
};

export default function DamageUpload() {
  const [form, setForm] = useState({
    claim_id: "", car_number: "", claimed_amount_inr: "",
    // Optional vehicle metadata — sent to backend so the RF regressor can run.
    // Leave blank to fall back to Groq LLM estimation automatically.
    brand: "", vehicle_model: "", color: "", vehicle_type: "", fuel: "", year: "",
  });
  const [file, setFile]         = useState(null);
  const [preview, setPreview]   = useState(null);
  const [loading, setLoading]   = useState(false);
  const [step, setStep]         = useState("");
  const [damageResult, setDamageResult] = useState(null);
  const [fraudResult, setFraudResult]   = useState(null);
  const [error, setError]       = useState(null);
  const fileRef = useRef();

  function handleFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setDamageResult(null);
    setFraudResult(null);
    setError(null);
  }

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) { setError("Please select a damage photo."); return; }
    if (!form.claim_id || !form.car_number || !form.claimed_amount_inr) {
      setError("Please fill in all required fields."); return;
    }

    setLoading(true); setError(null);
    setDamageResult(null); setFraudResult(null);

    try {
      // ── Step 1: Damage analysis ────────────────────────────────────────
      // Determine which estimation path the UI should hint about
      const hasVehicleMeta = form.brand && form.vehicle_model && form.color &&
                             form.vehicle_type && form.fuel && form.year;
      setStep(
        hasVehicleMeta
          ? "Running YOLO + RandomForest estimation..."
          : "Analysing damage photo with Llama 4 Scout vision..."
      );

      // Pass vehicle metadata fields alongside the image so the backend RF
      // regressor can produce a "trained_model" estimation_source result.
      const dmg = await analyzeDamage(file, {
        brand:  form.brand         || undefined,
        model:  form.vehicle_model || undefined,   // "model" is the backend form alias
        color:  form.color         || undefined,
        type:   form.vehicle_type  || undefined,   // "type" is the backend form alias
        fuel:   form.fuel          || undefined,
        year:   form.year          || undefined,
      });
      if (dmg.error) throw new Error(dmg.error);
      setDamageResult(dmg);

      // ── Step 2: Fraud check ────────────────────────────────────────────
      setStep("Running fraud detection checks...");
      const fraud = await fraudCheck({
        claim_id:           form.claim_id,
        car_number:         form.car_number,
        severity:           dmg.severity || "moderate",
        damaged_part:       dmg.damaged_part || "",
        claimed_amount_inr: parseFloat(form.claimed_amount_inr),
        cost_min_inr:       dmg.estimated_cost_min_inr ?? 0,
        cost_max_inr:       dmg.estimated_cost_max_inr ?? 0,
      });
      setFraudResult(fraud);
    } catch (err) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false); setStep("");
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Form ─────────────────────────────────────────────────────── */}
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Required claim fields */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Claim ID *</label>
            <input name="claim_id" value={form.claim_id} onChange={handleChange}
              placeholder="CLM-2024-006"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Car Number *</label>
            <input name="car_number" value={form.car_number} onChange={handleChange}
              placeholder="MH04XY5678"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Claimed Amount (₹) *</label>
            <input name="claimed_amount_inr" value={form.claimed_amount_inr} onChange={handleChange}
              type="number" placeholder="25000"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
        </div>

        {/* Optional vehicle metadata — enables YOLO + RF trained-model path */}
        <details className="border border-gray-200 rounded-lg">
          <summary className="px-4 py-3 text-sm font-medium text-gray-700 cursor-pointer select-none hover:bg-gray-50 rounded-lg">
            🚗 Vehicle Details
            <span className="ml-2 text-xs font-normal text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
              Fill for AI model estimation
            </span>
          </summary>
          <div className="px-4 pb-4 pt-2 space-y-3">
            <p className="text-xs text-gray-500">
              Providing all fields activates the YOLO + RandomForest pipeline for a more accurate cost estimate.
              Leave blank to fall back to Groq LLM estimation.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Brand</label>
                <input name="brand" value={form.brand} onChange={handleChange}
                  placeholder="Maruti"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Model</label>
                <input name="vehicle_model" value={form.vehicle_model} onChange={handleChange}
                  placeholder="Swift"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Color</label>
                <input name="color" value={form.color} onChange={handleChange}
                  placeholder="White"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                <select name="vehicle_type" value={form.vehicle_type} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                  <option value="">Select…</option>
                  <option>Hatchback</option>
                  <option>Sedan</option>
                  <option>SUV</option>
                  <option>MUV</option>
                  <option>Truck</option>
                  <option>Van</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fuel</label>
                <select name="fuel" value={form.fuel} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                  <option value="">Select…</option>
                  <option>Petrol</option>
                  <option>Diesel</option>
                  <option>CNG</option>
                  <option>Electric</option>
                  <option>Hybrid</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Year</label>
                <input name="year" value={form.year} onChange={handleChange}
                  type="number" placeholder="2019" min="1990" max="2030"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
            </div>
          </div>
        </details>

        {/* Image upload */}
        <div
          onClick={() => fileRef.current.click()}
          className="border-2 border-dashed border-indigo-300 rounded-xl p-6 text-center cursor-pointer hover:border-indigo-500 transition-colors"
        >
          {preview ? (
            <img src={preview} alt="preview" className="mx-auto max-h-48 rounded-lg object-contain" />
          ) : (
            <div className="text-gray-400">
              <p className="text-3xl mb-2">📸</p>
              <p className="text-sm">Click to upload a damage photo</p>
              <p className="text-xs mt-1">JPG, PNG, WEBP</p>
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button type="submit" disabled={loading}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm">
          {loading ? step || "Processing..." : "Analyse Damage & Check Fraud"}
        </button>
      </form>

      {/* ── Damage Result ─────────────────────────────────────────────── */}
      {damageResult && (
        <ResultCard title="Damage Assessment">
          <div className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${SEVERITY_COLOR[damageResult.severity] || SEVERITY_COLOR.unclear}`}>
                {damageResult.severity ?? "unknown"}
              </span>
              <span className="text-xs text-gray-500">Confidence: {((damageResult.confidence ?? 0) * 100).toFixed(0)}%</span>
              <span className="text-xs text-gray-400 italic">[{damageResult.vision_source}]</span>
              {/* estimation_source badge — shows which pipeline produced the result */}
              {damageResult.estimation_source && (
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${SOURCE_COLOR[damageResult.estimation_source] ?? "bg-gray-100 text-gray-600"}`}>
                  {damageResult.estimation_source === "trained_model" ? "🤖 Trained Model" :
                   damageResult.estimation_source === "groq_llm"      ? "⚡ Groq LLM"      :
                                                                         "📋 Fallback Table"}
                </span>
              )}
            </div>
            {damageResult.damaged_part && (
              <p className="text-sm text-gray-700">
                <span className="font-medium">Part:</span> {damageResult.damaged_part}
              </p>
            )}
            {damageResult.reasoning && (
              <p className="text-sm text-gray-600 italic">"{damageResult.reasoning}"</p>
            )}
            <div className="bg-indigo-50 rounded-lg p-3 text-sm">
              <p className="font-semibold text-indigo-800">
                Estimated Repair: ₹{(damageResult.estimated_cost_min_inr ?? 0).toLocaleString("en-IN")}
                {" – "}₹{(damageResult.estimated_cost_max_inr ?? 0).toLocaleString("en-IN")}
              </p>
              {damageResult.cost_reasoning && (
                <p className="text-indigo-600 text-xs mt-1">{damageResult.cost_reasoning}</p>
              )}
              <p className="text-xs text-gray-400 mt-1">[{damageResult.cost_source}]</p>
            </div>
            {damageResult.manual_review_recommended && (
              <p className="text-xs text-amber-600 font-medium">
                ⚠️ Manual review recommended — confidence below threshold
              </p>
            )}
          </div>
        </ResultCard>
      )}

      {/* ── Fraud Result ──────────────────────────────────────────────── */}
      {fraudResult && (
        <ResultCard title="Fraud Check">
          <div className={`rounded-lg p-4 ${fraudResult.is_flagged ? "bg-red-50 border border-red-200" : "bg-green-50 border border-green-200"}`}>
            <p className={`font-bold text-sm ${fraudResult.is_flagged ? "text-red-700" : "text-green-700"}`}>
              {fraudResult.status}
            </p>
            {fraudResult.flags?.length > 0 && (
              <ul className="mt-2 space-y-1">
                {fraudResult.flags.map((f, i) => (
                  <li key={i} className="text-xs text-red-600">• {f}</li>
                ))}
              </ul>
            )}
          </div>
        </ResultCard>
      )}
    </div>
  );
}
