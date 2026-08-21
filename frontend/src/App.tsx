import { NavLink, Route, Routes } from "react-router-dom"

import { cn } from "@/lib/utils"
import { Analytics } from "@/pages/Analytics"
import { Regression } from "@/pages/Regression"
import { TraceDetail } from "@/pages/TraceDetail"
import { TraceExplorer } from "@/pages/TraceExplorer"

const NAV_LINKS = [
  { to: "/", label: "Traces", end: true },
  { to: "/analytics", label: "Analytics" },
  { to: "/regression", label: "Regression" },
]

function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <nav className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
          <span className="font-semibold">Iris</span>
          {NAV_LINKS.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "text-sm text-muted-foreground hover:text-foreground",
                  isActive && "text-foreground font-medium"
                )
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl">
        <Routes>
          <Route path="/" element={<TraceExplorer />} />
          <Route path="/traces/:traceId" element={<TraceDetail />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/regression" element={<Regression />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
