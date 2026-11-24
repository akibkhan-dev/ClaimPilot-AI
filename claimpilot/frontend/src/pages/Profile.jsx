// Profile page — customer + vehicle + licence details, saved once to
// localStorage and reused to auto-fill every new claim (Incident step)
// and to cross-check names / numbers / expiry during Document Verification.

import { useState } from "react";
import { getProfile, saveProfile, isProfileComplete, EMPTY_PROFILE } from "../lib/profile";

const FIELD_GROUPS = [
  {
    title: "Your Details",
    subtitle: "Used to identify you and your policy — not tied to any single document.",
    fields: [
      { name: "customer_name",  label: "Full Name *",       placeholder: "As it appears on your documents" },
      { name: "policy_number",  label: "Policy Number *",   placeholder: "POL-2026-00123" },
      { name: "contact_number", label: "Contact Number *",  placeholder: "9876543210" },
    ],
  },
  {
    title: "RC Book Details",
    subtitle: "Checked against your uploaded RC Book — name and vehicle number must match.",
    fields: [
      { name: "car_number",     label: "Vehicle Number *",  placeholder: "MH04XY5678" },
      { name: "brand",          label: "Brand",  placeholder: "Maruti" },
      { name: "vehicle_model",  label: "Model",  placeholder: "Swift" },
      { name: "color",          label: "Color",  placeholder: "White" },
      { name: "vehicle_type",   label: "Type",   type: "select", options: ["Hatchback", "Sedan", "SUV", "MUV", "Truck", "Van"] },
      { name: "fuel",           label: "Fuel",   type: "select", options: ["Petrol", "Diesel", "CNG", "Electric", "Hybrid"] },
      { name: "year",           label: "Year",   type: "number", placeholder: "2019" },
    ],
  },
  {
    title: "DL Details",
    subtitle: "Checked against your uploaded Driving Licence — name and licence number must match, and the licence must not be expired.",
    fields: [
      { name: "dl_number", label: "Licence Number *", placeholder: "MH04 20230012345" },
      { name: "dl_expiry", label: "Expiry Date (optional)", type: "date", placeholder: "" },
    ],
  },
];

export default function Profile({ onSaved }) {
  const [form, setForm] = useState(() => getProfile() || EMPTY_PROFILE);
  const [savedFlash, setSavedFlash] = useState(false);

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    saveProfile(form);
    setSavedFlash(true);
    onSaved?.(form);
    setTimeout(() => setSavedFlash(false), 2500);
  }

  const complete = isProfileComplete(form);

  return (
    <div className="max-w-3xl">
      <header className="mb-8">
        <h1 className="font-display text-2xl font-semibold text-navy">Your Profile</h1>
        <p className="text-sm text-slate mt-1">
          Saved once, reused on every claim — this is also what your uploaded documents get checked against.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-8">
        {FIELD_GROUPS.map((group) => (
          <div key={group.title} className="bg-white rounded-xl border border-navy/10 shadow-card p-6">
            <h2 className="font-display text-base font-semibold text-navy mb-1">{group.title}</h2>
            {group.subtitle && <p className="text-xs text-slate mb-4">{group.subtitle}</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              {group.fields.map((f) => (
                <div key={f.name}>
                  <label className="block text-sm font-medium text-navy/80 mb-1">{f.label}</label>
                  {f.type === "select" ? (
                    <select
                      name={f.name} value={form[f.name]} onChange={handleChange}
                      className="w-full border border-navy/15 rounded-lg px-3 py-2 text-sm bg-paper focus:outline-none focus:ring-2 focus:ring-brass/50"
                    >
                      <option value="">Select…</option>
                      {f.options.map((o) => <option key={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input
                      name={f.name} value={form[f.name]} onChange={handleChange}
                      type={f.type || "text"} placeholder={f.placeholder}
                      className="w-full border border-navy/15 rounded-lg px-3 py-2 text-sm bg-paper focus:outline-none focus:ring-2 focus:ring-brass/50"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="flex items-center gap-4">
          <button type="submit"
            className="bg-brass hover:bg-brass-dark text-navy font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors">
            Save Profile
          </button>
          {savedFlash && (
            <span className="text-sm text-verified font-medium">✓ Saved — you're ready to file a claim.</span>
          )}
          {!complete && !savedFlash && (
            <span className="text-xs text-rust">Fill the required (*) fields to unlock the New Claim wizard.</span>
          )}
        </div>
      </form>
    </div>
  );
}