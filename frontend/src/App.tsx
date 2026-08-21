import { Route, Routes } from "react-router-dom"

import { Layout } from "@/components/Layout"
import { Analytics } from "@/pages/Analytics"
import { Regression } from "@/pages/Regression"
import { TraceDetail } from "@/pages/TraceDetail"
import { TraceExplorer } from "@/pages/TraceExplorer"

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<TraceExplorer />} />
        <Route path="/traces/:traceId" element={<TraceDetail />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/regression" element={<Regression />} />
      </Route>
    </Routes>
  )
}

export default App
