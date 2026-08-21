import { useState } from "react"
import {
  BarChart3,
  Bell,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  FileSearch,
  GitCompare,
  Search,
  Settings,
  Sparkles,
} from "lucide-react"
import { NavLink, Outlet, useLocation } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

// Sidebar/header shell ported from the v0-generated IrisDashboard component.
// Nav collapsed from v0's 4 tabs (Overview/Traces/Evaluations/Analytics) to
// our 3 routes -- Overview's content was folded into Analytics (see
// pages/Analytics.tsx), and "Traces" covers both the explorer and, via
// /traces/:traceId, the detail view.
const NAV_LINKS = [
  { to: "/", label: "Traces", icon: FileSearch },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/regression", label: "Regression", icon: GitCompare },
]

function activeLabel(pathname: string): string {
  if (pathname.startsWith("/traces/")) return "Trace detail"
  if (pathname === "/") return "Traces"
  if (pathname === "/analytics") return "Analytics"
  if (pathname === "/regression") return "Regression"
  return "Iris"
}

export function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()
  const isTracesActive = location.pathname === "/" || location.pathname.startsWith("/traces/")

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside
        className={`fixed inset-y-0 left-0 z-40 border-r border-border bg-sidebar transition-all ${
          collapsed ? "w-[72px]" : "w-64"
        }`}
      >
        <div className="flex h-full flex-col p-3">
          <div className="flex h-12 items-center justify-between px-2">
            <div className={`${collapsed ? "hidden" : "flex"} items-center gap-2`}>
              <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Sparkles className="size-4" />
              </div>
              <div>
                <div className="font-semibold tracking-tight">iris</div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  observability
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCollapsed(!collapsed)}
              aria-label="Toggle sidebar"
            >
              <ChevronLeft className={`size-4 transition-transform ${collapsed ? "rotate-180" : ""}`} />
            </Button>
          </div>

          <div className="my-6 flex items-center gap-2 rounded-md border border-border bg-background/60 px-3 py-2 text-sm text-muted-foreground">
            <Search className="size-4" />
            <span className={collapsed ? "hidden" : ""}>Search traces...</span>
            <kbd
              className={
                collapsed ? "hidden" : "ml-auto rounded border border-border px-1.5 py-0.5 font-mono text-[10px]"
              }
            >
              ⌘K
            </kbd>
          </div>

          <nav className="flex flex-col gap-1">
            {NAV_LINKS.map(({ to, label, icon: Icon }) => {
              const isActive = to === "/" ? isTracesActive : location.pathname === to
              return (
                <NavLink
                  key={to}
                  to={to}
                  className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors ${
                    isActive
                      ? "bg-primary/12 font-medium text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className={collapsed ? "hidden" : ""}>{label}</span>
                </NavLink>
              )
            })}
          </nav>

          <div className="mt-auto flex flex-col gap-1">
            <button className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
              <Settings className="size-4" />
              <span className={collapsed ? "hidden" : ""}>Settings</span>
            </button>
          </div>
        </div>
      </aside>

      <main className={`min-h-screen transition-all ${collapsed ? "ml-[72px]" : "ml-64"}`}>
        <header className="flex h-16 items-center justify-between border-b border-border px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Workspace</span>
            <ChevronRight className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">{activeLabel(location.pathname)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="hidden sm:flex">
              <span className="mr-2 size-1.5 rounded-full bg-primary" />
              Production
            </Badge>
            <Button variant="ghost" size="icon" aria-label="Notifications">
              <Bell className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Help">
              <CircleHelp className="size-4" />
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
