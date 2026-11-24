// Stepper — horizontal wizard progress indicator for the New Claim flow.
// Purely presentational; NewClaim.jsx owns the actual step state.

export default function Stepper({ steps, currentStep }) {
  return (
    <ol className="flex items-center w-full mb-8">
      {steps.map((step, i) => {
        const isDone    = i < currentStep;
        const isCurrent = i === currentStep;
        return (
          <li key={step} className="flex-1 flex items-center last:flex-none">
            <div className="flex flex-col items-center gap-2 shrink-0">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-mono font-semibold border-2 transition-colors ${
                  isDone
                    ? "bg-verified border-verified text-paper"
                    : isCurrent
                    ? "bg-navy border-navy text-paper"
                    : "bg-paper border-slate/30 text-slate/50"
                }`}
              >
                {isDone ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span className={`text-[11px] font-medium text-center max-w-[92px] leading-tight ${
                isCurrent ? "text-navy" : "text-slate/60"
              }`}>
                {step}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mx-2 mb-5 rounded-full ${isDone ? "bg-verified" : "bg-slate/20"}`} />
            )}
          </li>
        );
      })}
    </ol>
  );
}