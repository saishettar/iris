import { useEffect, useMemo, useState } from "react"
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import { ms, spanDuration, formatDuration } from "@/pages/TraceDetail"
import type { Span } from "@/lib/api"

// Structural companion to the waterfall: OTel spans form a strict tree (one
// parent_span_id each), never an arbitrary DAG, so this lays out a real call
// tree -- who called whom -- rather than a general graph layout. The
// waterfall answers "where did the time go"; this answers "what called
// what," which matters more on branchier, multi-round tool-use traces where
// depth-indentation alone gets hard to scan.

const X_SPACING = 240
const Y_SPACING = 130

interface SpanNodeData extends Record<string, unknown> {
  label: string
  duration: number
  isError: boolean
  isRoot: boolean
}

function SpanNode({ data }: NodeProps<Node<SpanNodeData>>) {
  return (
    <div
      className={`w-[210px] rounded-lg border bg-card px-3 py-2.5 shadow-sm ${
        data.isError ? "border-destructive/50" : "border-border"
      } ${data.isRoot ? "ring-1 ring-primary/40" : ""}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-border" />
      <div className="flex items-center gap-2">
        <span className={`size-1.5 shrink-0 rounded-full ${data.isError ? "bg-destructive" : "bg-primary"}`} />
        <span className="truncate text-sm font-medium">{data.label}</span>
      </div>
      <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-mono">{formatDuration(data.duration)}</span>
        {data.isError && <span className="font-medium text-destructive">error</span>}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-border" />
    </div>
  )
}

const nodeTypes = { spanNode: SpanNode }

function useIsDarkMode(): boolean {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"))
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setDark(document.documentElement.classList.contains("dark"))
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    return () => observer.disconnect()
  }, [])
  return dark
}

function layoutTree(spans: Span[]) {
  const byId = new Map(spans.map((s) => [s.span_id, s]))
  const childrenOf = new Map<string, Span[]>()
  const roots: Span[] = []

  for (const s of spans) {
    if (s.parent_span_id && byId.has(s.parent_span_id)) {
      const siblings = childrenOf.get(s.parent_span_id) ?? []
      siblings.push(s)
      childrenOf.set(s.parent_span_id, siblings)
    } else {
      roots.push(s)
    }
  }
  const byStart = (a: Span, b: Span) => ms(a.start_time) - ms(b.start_time)
  for (const siblings of childrenOf.values()) siblings.sort(byStart)
  roots.sort(byStart)

  const positioned: { span: Span; depth: number; x: number }[] = []
  let nextSlot = 0

  function place(span: Span, depth: number): number {
    const children = childrenOf.get(span.span_id) ?? []
    let x: number
    if (children.length === 0) {
      x = nextSlot
      nextSlot += 1
    } else {
      const childXs = children.map((c) => place(c, depth + 1))
      x = childXs.reduce((a, b) => a + b, 0) / childXs.length
    }
    positioned.push({ span, depth, x })
    return x
  }
  for (const root of roots) place(root, 0)

  const nodes: Node<SpanNodeData>[] = positioned.map(({ span, depth, x }) => ({
    id: span.span_id,
    type: "spanNode",
    position: { x: x * X_SPACING, y: depth * Y_SPACING },
    data: {
      label: span.name,
      duration: spanDuration(span),
      isError: span.status_code === "STATUS_CODE_ERROR",
      isRoot: depth === 0,
    },
  }))

  const edges: Edge[] = spans
    .filter((s) => s.parent_span_id && byId.has(s.parent_span_id))
    .map((s) => ({
      id: `${s.parent_span_id}-${s.span_id}`,
      source: s.parent_span_id!,
      target: s.span_id,
      type: "smoothstep",
      style: { stroke: "var(--color-border)", strokeWidth: 1.5 },
    }))

  return { nodes, edges }
}

export function TraceGraph({ spans }: { spans: Span[] }) {
  const dark = useIsDarkMode()
  const { nodes, edges } = useMemo(() => layoutTree(spans), [spans])

  return (
    <div className="h-[500px] overflow-hidden rounded-lg border border-border">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        colorMode={dark ? "dark" : "light"}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
      >
        <Background gap={24} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
