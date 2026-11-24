// VerificationSeal — the platform's signature element. Stays an empty brass
// outline until every required document has passed verification, then
// animates into a filled wax-seal stamp with a checkmark ridge. Used as the
// visual gate before a claim can move past document verification.

export default function VerificationSeal({ verified, label }) {
  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div
        key={verified ? "verified" : "pending"}
        className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-colors duration-300 ${
          verified
            ? "bg-brass border-4 border-brass-dark shadow-seal animate-seal"
            : "bg-transparent border-4 border-dashed border-slate/40"
        }`}
      >
        {/* Ridge marks — only visible once filled, evokes a wax-seal edge */}
        {verified &&
          Array.from({ length: 12 }).map((_, i) => (
            <span
              key={i}
              className="absolute w-1 h-2 bg-brass-dark/40 rounded-full"
              style={{
                transform: `rotate(${i * 30}deg) translateY(-34px)`,
                transformOrigin: "center 34px",
              }}
            />
          ))}

        {verified ? (
          <svg className="w-9 h-9 text-paper relative z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-8 h-8 text-slate/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 10-8 0v4h8z" />
          </svg>
        )}
      </div>
      <p className={`text-xs font-semibold uppercase tracking-wide ${verified ? "text-brass-dark" : "text-slate/60"}`}>
        {label || (verified ? "Documents Verified" : "Awaiting Verification")}
      </p>
    </div>
  );
}