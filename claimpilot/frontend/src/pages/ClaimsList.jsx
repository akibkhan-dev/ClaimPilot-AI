// ClaimsList page — full table of every claim in the database, via
// GET /api/claims. Read-only ledger view; filing happens in the wizard.

import { useEffect, useState } from "react";
import { fetchClaims } from "../api/client";
import StatusBadge from "../components/StatusBadge";

const SEVERITY_TONE = { minor: "warning", moderate: "brass", severe: "danger" };

export default function ClaimsList({ setPage }) {
  const [claims, setClaims]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [filter, setFilter]   = useState("all"); // all | clear | flagged

  useEffect(() => {
    fetchClaims()
      .then(setClaims)
      .catch((err) => setError(err.message || "Could not load claims."))
      .finally(() => setLoading(false));
  }, []);

  const visible = claims.filter((c) => {
    if (filter === "clear")   return !c.is_flagged;
    if (filter === "flagged") return c.is_flagged;
    return true;
  });

  return (
    <div>
      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-navy">All Claims</h1>
          <p className="text-sm text-slate mt-1">Every claim submitted through the platform, most recent first.</p>
        </div>
        <button
          onClick={() => setPage("new-claim")}
          className="bg-brass hover:bg-brass-dark text-navy font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors shrink-0"
        >
          + File a New Claim
        </button>
      </header>

      <div className="flex gap-2 mb-4">
        {["all", "clear", "flagged"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition-colors ${
              filter === f ? "bg-navy text-paper" : "bg-navy/5 text-navy/60 hover:bg-navy/10"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-navy/10 shadow-card overflow-hidden">
        {loading ? (
          <p className="px-6 py-10 text-sm text-slate text-center">Loading claims…</p>
        ) : error ? (
          <p className="px-6 py-10 text-sm text-rust text-center">{error}</p>
        ) : visible.length === 0 ? (
          <p className="px-6 py-10 text-sm text-slate text-center">No claims match this filter.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy/10 text-left text-xs font-semibold uppercase tracking-wide text-slate/60">
                <th className="px-6 py-3">Claim ID</th>
                <th className="px-6 py-3">Vehicle</th>
                <th className="px-6 py-3">Severity</th>
                <th className="px-6 py-3">Claimed</th>
                <th className="px-6 py-3">Estimated Range</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Filed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy/5">
              {visible.map((c) => (
                <tr key={c.id} className="hover:bg-paper/60 transition-colors">
                  <td className="px-6 py-3.5 font-mono text-navy font-medium">{c.claim_id}</td>
                  <td className="px-6 py-3.5">
                    <p className="font-mono text-navy">{c.car_number}</p>
                    <p className="text-xs text-slate">{c.damaged_part || "—"}</p>
                  </td>
                  <td className="px-6 py-3.5">
                    <StatusBadge tone={SEVERITY_TONE[c.severity] || "neutral"}>{c.severity || "—"}</StatusBadge>
                  </td>
                  <td className="px-6 py-3.5 font-mono">₹{(c.claimed_amount || 0).toLocaleString("en-IN")}</td>
                  <td className="px-6 py-3.5 font-mono text-xs text-slate">
                    ₹{(c.estimated_cost_min || 0).toLocaleString("en-IN")} – ₹{(c.estimated_cost_max || 0).toLocaleString("en-IN")}
                  </td>
                  <td className="px-6 py-3.5">
                    <StatusBadge tone={c.is_flagged ? "danger" : "success"}>
                      {c.is_flagged ? "Flagged" : "Clear"}
                    </StatusBadge>
                    {c.is_flagged && c.flag_reasons?.length > 0 && (
                      <p className="text-[11px] text-rust mt-1 max-w-xs">{c.flag_reasons[0]}</p>
                    )}
                  </td>
                  <td className="px-6 py-3.5 text-xs text-slate">{c.created_at?.slice(0, 16).replace("T", " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}