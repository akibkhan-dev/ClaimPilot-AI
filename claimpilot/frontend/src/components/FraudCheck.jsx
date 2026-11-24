// Fraud check component — standalone fraud check form (without image upload)

import { useState } from "react";
import { fraudCheck } from "../api/client";
import ResultCard from "./ResultCard";

export default function FraudCheck() {
  const [form, setForm] = useState({
    claim_id: "", car_number: "", severity: "moderate", damaged_part: "",
    claimed_amount_inr: "", cost_min_inr: "", cost_max_inr: "",
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);
  const [error, setError]     = useState(null);

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const required = ["claim_id","car_number","claimed_amount_inr","cost_min_inr","cost_max_inr"];
    if (required.some(k => !form[k])) { setError("Fill in all required fields."); return; }
    setLoading(true); setError(null);
    try {
      const data = await fraudCheck({
        ...form,
        claimed_amount_inr: parseFloat(form.claimed_amount_inr),
        cost_min_inr:       parseFloat(form.cost_min_inr),
        cost_max_inr:       parseFloat(form.cost_max_inr),
      });
      if (data.error) throw new Error(data.error);
      setResult(data);
    } catch (err) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  const fields = [
    { name:"claim_id",           label:"Claim ID *",             placeholder:"CLM-2024-003" },
    { name:"car_number",         label:"Car Number *",           placeholder:"MH02AB1234" },
    { name:"damaged_part",       label:"Damaged Part",           placeholder:"front hood" },
    { name:"claimed_amount_inr", label:"Claimed Amount ₹ *",    placeholder:"55000", type:"number" },
    { name:"cost_min_inr",       label:"Est. Cost Min ₹ *",     placeholder:"40000", type:"number" },
    { name:"cost_max_inr",       label:"Est. Cost Max ₹ *",     placeholder:"70000", type:"number" },
  ];

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {fields.map(f => (
            <div key={f.name}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
              <input name={f.name} value={form[f.name]} onChange={handleChange}
                type={f.type || "text"} placeholder={f.placeholder}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Severity *</label>
            <select name="severity" value={form.severity} onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400">
              <option value="minor">Minor</option>
              <option value="moderate">Moderate</option>
              <option value="severe">Severe</option>
            </select>
          </div>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button type="submit" disabled={loading}
          className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm">
          {loading ? "Checking..." : "Run Fraud Check"}
        </button>
      </form>

      {result && (
        <ResultCard title="Fraud Verdict">
          <div className={`rounded-lg p-4 ${result.is_flagged ? "bg-red-50 border border-red-200" : "bg-green-50 border border-green-200"}`}>
            <p className={`font-bold text-base ${result.is_flagged ? "text-red-700" : "text-green-700"}`}>
              {result.status}
            </p>
            {result.flags?.length > 0 && (
              <ul className="mt-2 space-y-1">
                {result.flags.map((f, i) => (
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
