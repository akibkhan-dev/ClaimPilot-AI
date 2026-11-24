// Result card component — displays formatted AI analysis results returned from the backend

export default function ResultCard({ title, children, className = "" }) {
  return (
    <div className={`rounded-xl border border-navy/10 bg-white shadow-card p-5 ${className}`}>
      {title && (
        <h3 className="font-display text-sm font-semibold text-navy uppercase tracking-wide mb-3">
          {title}
        </h3>
      )}
      {children}
    </div>
  );
}