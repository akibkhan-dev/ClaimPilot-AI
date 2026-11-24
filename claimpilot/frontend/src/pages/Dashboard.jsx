// Dashboard page — welcome header + live stats + recent claims, pulled from
// GET /api/claims (previously wired into the backend but never called from
// the frontend). Read-only overview; filing happens in the New Claim wizard.

import { useEffect, useState } from "react";
import { fetchClaims } from "../api/client";
import { getProfile, isProfileComplete } from "../lib/profile";
import StatusBadge from "../components/StatusBadge";

export default function Dashboard({ setPage }) {
  const [claims, setClaims]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const profile = getProfile();

  useEffect(() => {
    fetchClaims()
      .then(setClaims)
      .catch((err) => setError(err.message || "Could not load claims."))
      .finally(() => setLoading(false));
  }, []);

  const total    = claims.length;
  const flagged  = claims.filter((c) => c.is_flagged).length;
  const clear    = total - flagged;
  const totalClaimed = claims.reduce((sum, c) => sum + (c.claimed_amount || 0), 0);

  return (
    <div>
      <header className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-navy">
            {profile?.customer_name ? `Welcome back, ${profile.customer_name.split(" ")[0]}` : "Welcome to ClaimPilot"}
          </h1>
          <p className="text-sm text-slate mt-1">
            {profile?.policy_number ? (
              <>Policy <span className="font-mono text-navy">{profile.policy_number}</span></>
            ) : (
              "Complete your profile to start filing claims."
            )}
          </p>
        </div>
        <button
          onClick={() => setPage("new-claim")}
          className="bg-brass hover:bg-brass-dark text-navy font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors shrink-0"
        >
          + File a New Claim
        </button>
      </header>

      {!isProfileComplete(profile) && (
        <div className="mb-6 bg-brass/10 border border-brass/30 rounded-xl p-4 flex items-center justify-between">
          <p className="text-sm text-navy">Your profile is incomplete — this is required before filing a claim.</p>
          <button onClick={() => setPage("profile")} className="text-sm font-semibold text-brass-dark hover:underline shrink-0 ml-4">
            Complete Profile →
          </button>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard label="Total Claims" value={total} />
        <StatCard label="Clear" value={clear} tone="success" />
        <StatCard label="Flagged for Review" value={flagged} tone="danger" />
      </div>

      {/* Recent claims */}
      <div className="bg-white rounded-xl border border-navy/10 shadow-card">
        <div className="px-6 py-4 border-b border-navy/10 flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-navy">Recent Claims</h2>
          <button onClick={() => setPage("claims")} className="text-xs font-semibold text-brass-dark hover:underline">
            View all →
          </button>
        </div>

        {loading ? (
          <p className="px-6 py-8 text-sm text-slate text-center">Loading claims…</p>
        ) : error ? (
          <p className="px-6 py-8 text-sm text-rust text-center">{error}</p>
        ) : claims.length === 0 ? (
          <p className="px-6 py-8 text-sm text-slate text-center">No claims filed yet — file your first one to see it here.</p>
        ) : (
          <ul className="divide-y divide-navy/5">
            {claims.slice(0, 5).map((c) => (
              <li key={c.id} className="px-6 py-3.5 flex items-center justify-between text-sm">
                <div>
                  <p className="font-mono text-navy font-medium">{c.claim_id}</p>
                  <p className="text-xs text-slate mt-0.5">{c.car_number} · {c.damaged_part || "—"}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-slate">₹{(c.claimed_amount || 0).toLocaleString("en-IN")}</span>
                  <StatusBadge tone={c.is_flagged ? "danger" : "success"}>
                    {c.is_flagged ? "Flagged" : "Clear"}
                  </StatusBadge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, tone = "info" }) {
  const toneText = { info: "text-navy", success: "text-verified-dark", danger: "text-rust-dark" }[tone];
  return (
    <div className="bg-white rounded-xl border border-navy/10 shadow-card p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate/70">{label}</p>
      <p className={`font-display text-3xl font-semibold mt-1 ${toneText}`}>{value}</p>
    </div>
  );
}