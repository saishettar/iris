import { useEffect, useState } from "react"
import {
  BarChart3,
  Bell,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  FileSearch,
  GitCompare,
  LayoutGrid,
  MessagesSquare,
  Moon,
  Plug,
  Search,
  Sun,
} from "lucide-react"
import { NavLink, Outlet, useLocation } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { API_BASE_URL } from "@/lib/api"

// Sidebar/header shell, redesigned toward the dense, developer-tool-native
// layout this category (Langfuse et al.) actually uses -- same IA as the
// original v0 port (sidebar + breadcrumb header), real accent color and a
// working dark/light toggle instead of the unused .dark tokens sitting idle.
const NAV_LINKS = [
  { to: "/", label: "Overview", icon: LayoutGrid },
  { to: "/traces", label: "Traces", icon: FileSearch },
  { to: "/sessions", label: "Sessions", icon: MessagesSquare },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/regression", label: "Regression", icon: GitCompare },
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
  if (pathname === "/traces") return "Traces"
  if (pathname === "/sessions") return "Sessions"
  if (pathname === "/analytics") return "Analytics"
  if (pathname === "/regression") return "Regression"
  if (pathname === "/alerts") return "Alerts"
  if (pathname === "/connect") return "Connect"
  return "Iris"
}

export function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()
  const { dark, toggle } = useTheme()
  const isTracesActive = location.pathname === "/traces" || location.pathname.startsWith("/traces/")

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside
        className={`fixed inset-y-0 left-0 z-40 border-r border-sidebar-border bg-sidebar transition-all ${
          collapsed ? "w-[72px]" : "w-60"
        }`}
      >
        <div className="flex h-full flex-col p-3">
          <div className="flex h-12 items-center justify-between px-1">
            <div className={`${collapsed ? "hidden" : "flex"} items-center gap-2`}>
              <div className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <IrisMark className="size-4" />
              </div>
              <span className="font-mono text-sm font-medium tracking-tight">iris</span>
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

          <div className="my-5 flex items-center gap-2 rounded-md border border-sidebar-border bg-background/40 px-2.5 py-1.5 text-sm text-muted-foreground">
            <Search className="size-3.5 shrink-0" />
            <span className={collapsed ? "hidden" : "truncate"}>Search traces</span>
            <kbd
              className={
                collapsed
                  ? "hidden"
                  : "ml-auto shrink-0 rounded border border-sidebar-border px-1.5 py-0.5 font-mono text-[10px]"
              }
            >
              /
            </kbd>
          </div>

          <nav className="flex flex-col gap-0.5">
            {NAV_LINKS.map(({ to, label, icon: Icon }) => {
              const isActive = to === "/traces" ? isTracesActive : location.pathname === to
              return (
                <NavLink
                  key={to}
                  to={to}
                  className={`flex items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors ${
                    isActive
                      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
                  }`}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className={collapsed ? "hidden" : ""}>{label}</span>
                </NavLink>
              )
            })}
          </nav>

          <div className="mt-auto flex flex-col gap-2 border-t border-sidebar-border pt-3">
            <div className={`flex items-center gap-2 px-1 text-xs text-muted-foreground ${collapsed ? "hidden" : ""}`}>
              <span className="size-1.5 shrink-0 rounded-full bg-success" />
              <span className="truncate font-mono">{collectorHost()}</span>
            </div>
            <button
              onClick={toggle}
              className="flex items-center gap-3 rounded-md px-2.5 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
            >
              {dark ? <Sun className="size-4 shrink-0" /> : <Moon className="size-4 shrink-0" />}
              <span className={collapsed ? "hidden" : ""}>{dark ? "Light mode" : "Dark mode"}</span>
            </button>
          </div>
        </div>
      </aside>

      <main className={`min-h-screen transition-all ${collapsed ? "ml-[72px]" : "ml-60"}`}>
        <header className="flex h-14 items-center justify-between border-b border-border px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">iris</span>
            <ChevronRight className="size-3.5 text-muted-foreground" />
            <span className="text-sm font-medium">{activeLabel(location.pathname)}</span>
          </div>
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
