// StatusBadge — a single generalized pill used everywhere a severity, source,
// or verification state needs a colored label. Replaces the ad-hoc
// SEVERITY_COLOR / SOURCE_COLOR maps that used to live inside DamageUpload.

const TONES = {
  neutral:  "bg-slate/10 text-slate",
  info:     "bg-navy/10 text-navy",
  brass:    "bg-brass/15 text-brass-dark",
  success:  "bg-verified/15 text-verified-dark",
  warning:  "bg-brass/20 text-brass-dark",
  danger:   "bg-rust/15 text-rust-dark",
};

export default function StatusBadge({ children, tone = "neutral", className = "" }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${TONES[tone] || TONES.neutral} ${className}`}
    >
      {children}
    </span>
  );
}