import { Activity, GitCompare, Workflow } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

// TODO: entirely mock data, ported as-is from v0's Evaluations tab. This view
// depends on an eval/scoring layer (prompt/model version tagging +
// promptfoo-style scores), which doesn't exist yet -- do not wire this to
// fake endpoints.

function Stat({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string
  value: string
  detail: string
  icon: typeof Activity
}) {
  return (
    <Card className="border-border/70 bg-card/70 shadow-none">
      <CardContent className="p-5">
        <div className="mb-5 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </span>
          <Icon className="size-4 text-primary" />
        </div>
        <div className="flex items-end justify-between gap-2">
          <span className="font-mono text-2xl font-semibold tracking-tight">{value}</span>
          <span className="text-xs text-primary">{detail}</span>
        </div>
      </CardContent>
    </Card>
  )
}

const REGRESSION_ROWS: [string, string, string, string][] = [
  ["Answer quality", "91.8%", "93.1%", "+1.3%"],
  ["Groundedness", "88.4%", "86.9%", "-1.5%"],
  ["Tool accuracy", "96.2%", "96.8%", "+0.6%"],
  ["Median latency", "1.84s", "1.71s", "-7.1%"],
]

export function Regression() {
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-primary">
            Iris workspace
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Regression</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Compare eval scores across prompt/model versions.
          </p>
        </div>
        <Badge variant="outline">Mock data</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Stat label="Active datasets" value="12" detail="+2 this month" icon={GitCompare} />
        <Stat label="Evaluations run" value="4,820" detail="+18.6%" icon={Activity} />
        <Stat label="Regression alerts" value="3" detail="Needs review" icon={Workflow} />
      </div>

      <Card className="border-border/70 bg-card/70 shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Regression comparison</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Production v2.4 compared with the latest candidate.
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  <th className="pb-3 font-medium">Metric</th>
                  <th className="pb-3 font-medium">Production</th>
                  <th className="pb-3 font-medium">Candidate</th>
                  <th className="pb-3 font-medium">Change</th>
                </tr>
              </thead>
              <tbody>
                {REGRESSION_ROWS.map(([metric, prod, candidate, change]) => (
                  <tr key={metric} className="border-b border-border/50 text-sm last:border-0">
                    <td className="py-4 font-medium">{metric}</td>
                    <td className="py-4 font-mono text-muted-foreground">{prod}</td>
                    <td className="py-4 font-mono">{candidate}</td>
                    <td
                      className={`py-4 font-mono ${
                        change.startsWith("-") && metric === "Groundedness"
                          ? "text-destructive"
                          : "text-primary"
                      }`}
                    >
                      {change}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
