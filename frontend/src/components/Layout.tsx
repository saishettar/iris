import { useEffect, useState } from "react"
import {
  BarChart3,
  Bell,
  CircleHelp,
  FileSearch,
  GitCompare,
  House,
  LayoutDashboard,
  LayoutGrid,
  MessagesSquare,
  Moon,
  Plug,
  Search,
  Star,
  Sun,
} from "lucide-react"
import { NavLink, Outlet, useLocation } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { API_BASE_URL } from "@/lib/api"

// Sidebar/header shell -- redesigned onto the Langfuse world (pinned by the
// user's own screenshots, see the direction contract at
// .impeccable/surfaces/frontend-src-components-layout-tsx.md): a fixed
// icon-only rail rather than a labeled, collapsible sidebar. Color stays
// out of the chrome here -- the active state is a plain ink-tinted pill,
// never a brand hue.
const NAV_LINKS = [
  { to: "/", label: "Overview", icon: LayoutGrid },
  { to: "/home", label: "Home", icon: House },
  { to: "/dashboards", label: "Dashboards", icon: LayoutDashboard },
  { to: "/traces", label: "Traces", icon: FileSearch },
  { to: "/sessions", label: "Sessions", icon: MessagesSquare },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/regression", label: "Regression", icon: GitCompare },
  { to: "/scores", label: "Scores", icon: Star },
  { to: "/alerts", label: "Alerts", icon: Bell },
  { to: "/connect", label: "Connect", icon: Plug },
]

function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"))

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark)
    localStorage.setItem("iris-theme", dark ? "dark" : "light")
  }, [dark])

  return { dark, toggle: () => setDark((d) => !d) }
}

function collectorHost(): string {
  try {
    return new URL(API_BASE_URL).host
  } catch {
    return API_BASE_URL
  }
}

// The product's one signature mark: an aperture/iris glyph (adaptive blades
// around a pupil), not a lettermark -- "Iris" names the part of the eye that
// adapts to observe, and the collector is quite literally a lens on an
// agent's behavior. Used exactly twice: here, and in public/favicon.svg.
function IrisMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
        <line
          key={deg}
          x1={12 + 3.5 * Math.cos((deg * Math.PI) / 180)}
          y1={12 + 3.5 * Math.sin((deg * Math.PI) / 180)}
          x2={12 + 8.5 * Math.cos((deg * Math.PI) / 180)}
          y2={12 + 8.5 * Math.sin((deg * Math.PI) / 180)}
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
        />
      ))}
    </svg>
  )
}

function activeLabel(pathname: string): string {
  if (pathname.startsWith("/traces/")) return "Trace detail"
  if (pathname === "/") return "Overview"
  if (pathname === "/home") return "Home"
  if (pathname === "/dashboards") return "My Custom Dashboard"
  if (pathname === "/traces") return "Traces"
  if (pathname === "/sessions") return "Sessions"
  if (pathname === "/analytics") return "Analytics"
  if (pathname === "/regression") return "Regression"
  if (pathname === "/scores") return "Scores"
  if (pathname === "/alerts") return "Alerts"
  if (pathname === "/connect") return "Connect"
  return "Iris"
}

const RAIL_WIDTH = "w-16"

function RailLink({
  to,
  label,
  icon: Icon,
  isActive,
}: {
  to: string
  label: string
  icon: typeof Search
  isActive: boolean
}) {
  return (
    <NavLink
      to={to}
      title={label}
      aria-label={label}
      className={`flex size-10 items-center justify-center rounded-md transition-colors ${
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
      }`}
    >
      <Icon className="size-4.5 shrink-0" />
    </NavLink>
  )
}

export function Layout() {
  const location = useLocation()
  const { dark, toggle } = useTheme()
  const isTracesActive = location.pathname === "/traces" || location.pathname.startsWith("/traces/")

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className={`fixed inset-y-0 left-0 z-40 ${RAIL_WIDTH} border-r border-sidebar-border bg-sidebar`}>
        <div className="flex h-full flex-col items-center gap-1 py-3">
          <NavLink to="/" title="Iris" aria-label="Iris home" className="mb-2 flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <IrisMark className="size-4.5" />
          </NavLink>

          <button
            title="Search"
            aria-label="Search traces"
            className="mb-2 flex size-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground"
          >
            <Search className="size-4 shrink-0" />
          </button>

          <nav className="flex flex-col gap-0.5">
            {NAV_LINKS.map(({ to, label, icon }) => (
              <RailLink
                key={to}
                to={to}
                label={label}
                icon={icon}
                isActive={to === "/traces" ? isTracesActive : location.pathname === to}
              />
            ))}
          </nav>

          <div className="mt-auto flex flex-col items-center gap-1">
            <span title={collectorHost()} className="flex size-10 items-center justify-center">
              <span className="size-1.5 shrink-0 rounded-full bg-success" />
            </span>
            <button
              onClick={toggle}
              title={dark ? "Light mode" : "Dark mode"}
              aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
              className="flex size-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground"
            >
              {dark ? <Sun className="size-4 shrink-0" /> : <Moon className="size-4 shrink-0" />}
            </button>
          </div>
        </div>
      </aside>

      <main className="min-h-screen pl-16">
        <header className="flex h-14 items-center justify-between border-b border-border px-6 lg:px-8">
          <span className="text-sm font-medium">{activeLabel(location.pathname)}</span>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="hidden sm:flex">
              <span className="mr-1.5 size-1.5 rounded-full bg-success" />
              Self-hosted
            </Badge>
            <Button variant="ghost" size="icon" aria-label="Connect an agent" asChild>
              <NavLink to="/connect">
                <CircleHelp className="size-4" />
              </NavLink>
            </Button>
          </div>
        </header>

        <div className="mx-auto max-w-[1500px] p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
