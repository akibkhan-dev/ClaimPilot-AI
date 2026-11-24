// Root React component — app shell (sidebar + page area). No router: a
// single `page` state decides which page renders, same pattern the original
// tab-based App.jsx used, just extended to real pages.

import { useState } from "react";
import Sidebar from "./components/Sidebar";
import Dashboard from "./pages/Dashboard";
import Profile from "./pages/Profile";
import ClaimsList from "./pages/ClaimsList";
import NewClaim from "./pages/NewClaim";

export default function App() {
  const [page, setPage] = useState("dashboard");

  return (
    <div className="min-h-screen flex bg-paper">
      <Sidebar page={page} setPage={setPage} />
      <main className="flex-1 px-8 py-8 overflow-y-auto">
        {page === "dashboard" && <Dashboard setPage={setPage} />}
        {page === "profile"   && <Profile onSaved={() => setPage("dashboard")} />}
        {page === "claims"    && <ClaimsList setPage={setPage} />}
        {page === "new-claim" && <NewClaim setPage={setPage} />}
      </main>
    </div>
  );
}