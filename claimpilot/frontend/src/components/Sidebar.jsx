// Sidebar — left icon-rail navigation for the app shell. No router: parent
// App.jsx owns the `page` state and passes it down with a setter.

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard",  icon: DashboardIcon },
  { id: "profile",   label: "Profile",    icon: ProfileIcon   },
  { id: "claims",    label: "Claims",     icon: ClaimsIcon    },
  { id: "new-claim", label: "New Claim",  icon: PlusIcon      },
];

export default function Sidebar({ page, setPage }) {
  return (
    <aside className="w-60 shrink-0 bg-navy text-paper flex flex-col min-h-screen">
      <div className="px-5 py-6 border-b border-paper/10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-brass flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 3.5v5c0 4.5-3 8-7 9-4-1-7-4.5-7-9v-5L12 3z" />
            </svg>
          </div>
          <div>
            <p className="font-display font-semibold text-[15px] leading-tight">ClaimPilot</p>
            <p className="text-[10px] tracking-widest text-brass-light uppercase">AI Claims Platform</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-5 space-y-1">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setPage(id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              page === id
                ? "bg-paper/10 text-paper"
                : "text-paper/60 hover:bg-paper/5 hover:text-paper/90"
            }`}
          >
            <Icon className="w-[18px] h-[18px] shrink-0" />
            {label}
          </button>
        ))}
      </nav>

      <div className="px-5 py-4 border-t border-paper/10">
        <p className="text-[11px] text-paper/40 leading-relaxed">
          Document verification, damage assessment &amp; fraud screening — powered by AI.
        </p>
      </div>
    </aside>
  );
}

function DashboardIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13h8V3H3v10zm10 8h8V3h-8v18zM3 21h8v-6H3v6z" />
    </svg>
  );
}
function ProfileIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14c-4.4 0-8 2.24-8 5v1h16v-1c0-2.76-3.6-5-8-5z" />
    </svg>
  );
}
function ClaimsIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6M9 8h1M7 3h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z" />
    </svg>
  );
}
function PlusIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14" />
    </svg>
  );
}