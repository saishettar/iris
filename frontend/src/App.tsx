import { Route, Routes } from "react-router-dom"

import { Layout } from "@/components/Layout"
import { Alerts } from "@/pages/Alerts"
import { Analytics } from "@/pages/Analytics"
import { Connect } from "@/pages/Connect"
import { Home } from "@/pages/Home"
import { Overview } from "@/pages/Overview"
import { Regression } from "@/pages/Regression"
import { Sessions } from "@/pages/Sessions"
import { TraceDetail } from "@/pages/TraceDetail"
import { TraceExplorer } from "@/pages/TraceExplorer"

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Overview />} />
        <Route path="/home" element={<Home />} />
        <Route path="/traces" element={<TraceExplorer />} />
        <Route path="/traces/:traceId" element={<TraceDetail />} />
        <Route path="/sessions" element={<Sessions />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/regression" element={<Regression />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/connect" element={<Connect />} />
      </Route>
    </Routes>
  )
}

export default App
