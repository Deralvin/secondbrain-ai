"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GraphLink, GraphNode } from "@/lib/db";

type Props = { nodes: GraphNode[]; links: GraphLink[]; project?: string };

const colors: Record<string, string> = {
  project: "#72d6bd",
  memory: "#8bb8ff",
  tag: "#c5a7ff",
  agent: "#ffb86c",
};
const shellRadius: Record<string, number> = {
  project: 150,
  memory: 252,
  tag: 330,
  agent: 385,
};
const baseRadius: Record<string, number> = {
  project: 13,
  memory: 8,
  tag: 6,
  agent: 7,
};

type Vec3 = { x: number; y: number; z: number };

function spherePoint(index: number, count: number, radius: number): Vec3 {
  const phi = Math.acos(1 - (2 * (index + 0.5)) / Math.max(count, 1));
  const theta = Math.PI * (1 + Math.sqrt(5)) * index;
  const sin = Math.sin(phi);
  return {
    x: Math.cos(theta) * sin * radius,
    y: Math.sin(theta) * sin * radius,
    z: Math.cos(phi) * radius,
  };
}

type Projected = {
  node: GraphNode;
  x: number;
  y: number;
  scale: number;
  depth: number;
  r: number;
};
type Positioned = { node: GraphNode; pos: Vec3 };

export default function GraphCanvas({ nodes, links, project }: Props) {
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [query, setQuery] = useState("");

  const scoped = useMemo(() => {
    if (!project) return nodes;
    const memoryIds = new Set(
      nodes
        .filter((n) => n.type === "memory" && n.project === project)
        .map((n) => n.id),
    );
    const keep = new Map<string, GraphNode>();
    for (const n of nodes) {
      if (n.type === "project" && n.label === project) keep.set(n.id, n);
      else if (n.type === "memory" && n.project === project) keep.set(n.id, n);
      else if (n.type === "tag" || n.type === "agent") keep.set(n.id, n);
    }
    for (const n of nodes) {
      if (n.type === "tag" || n.type === "agent") {
        const connected = links.some(
          (l) =>
            (l.source === n.id && memoryIds.has(l.target)) ||
            (l.target === n.id && memoryIds.has(l.source)),
        );
        if (!connected) keep.delete(n.id);
      }
    }
    return Array.from(keep.values());
  }, [nodes, links, project]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? scoped.filter(
          (n) =>
            n.label.toLowerCase().includes(q) ||
            n.project?.toLowerCase().includes(q),
        )
      : scoped;
  }, [scoped, query]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const projectedRef = useRef<Projected[]>([]);
  const hoverRef = useRef<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  const viewRef = useRef({
    yaw: 0.6,
    pitch: -0.28,
    zoom: 1,
    dragging: false,
    lastX: 0,
    lastY: 0,
    moved: 0,
    lastInteract: 0,
  });
  const dataRef = useRef<{ links: GraphLink[]; positions: Positioned[] }>({
    links: [],
    positions: [],
  });

  useEffect(() => {
    selectedRef.current = selected?.id ?? null;
  }, [selected]);

  useEffect(() => {
    const counts: Record<string, number> = {};
    const seen: Record<string, number> = {};
    for (const node of visible)
      counts[node.type] = (counts[node.type] ?? 0) + 1;
    const positions: Positioned[] = visible.map((node) => {
      const index = seen[node.type] ?? 0;
      seen[node.type] = index + 1;
      return {
        node,
        pos: spherePoint(
          index,
          counts[node.type],
          shellRadius[node.type] ?? 200,
        ),
      };
    });
    const ids = new Set(visible.map((n) => n.id));
    dataRef.current = {
      links: links.filter((l) => ids.has(l.source) && ids.has(l.target)),
      positions,
    };
  }, [visible, links]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const fov = 950;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      if (
        canvas.width !== Math.round(w * dpr) ||
        canvas.height !== Math.round(h * dpr)
      ) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const view = viewRef.current;
      if (!view.dragging && performance.now() - view.lastInteract > 2200)
        view.yaw += 0.0022;

      const cosY = Math.cos(view.yaw);
      const sinY = Math.sin(view.yaw);
      const cosP = Math.cos(view.pitch);
      const sinP = Math.sin(view.pitch);
      const cx = w / 2;
      const cy = h / 2;

      // center marker
      ctx.setLineDash([3, 7]);
      ctx.strokeStyle = "#253342";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, 46 * view.zoom, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#647386";
      ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillText("your knowledge", cx, cy + 4);

      // project all nodes into 3D-rotated screen space
      const projected: Projected[] = [];
      for (const { node, pos } of dataRef.current.positions) {
        const x1 = pos.x * cosY - pos.z * sinY;
        const z1 = pos.x * sinY + pos.z * cosY;
        const y2 = pos.y * cosP - z1 * sinP;
        const z2 = pos.y * sinP + z1 * cosP;
        const scale = (fov / (fov + z2)) * view.zoom;
        projected.push({
          node,
          x: cx + x1 * scale,
          y: cy + y2 * scale,
          scale,
          depth: z2,
          r: (baseRadius[node.type] ?? 6) * scale,
        });
      }
      projected.sort((a, b) => b.depth - a.depth);
      projectedRef.current = projected;
      const map = new Map(projected.map((p) => [p.node.id, p]));

      // links (depth-faded)
      for (const link of dataRef.current.links) {
        const a = map.get(link.source);
        const b = map.get(link.target);
        if (!a || !b) continue;
        const alpha = Math.max(
          0.06,
          Math.min(0.5, 0.9 * Math.min(a.scale, b.scale) - 0.35),
        );
        ctx.strokeStyle = `rgba(65, 80, 100, ${alpha.toFixed(3)})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      // nodes, far to near
      const hover = hoverRef.current;
      const sel = selectedRef.current;
      for (const p of projected) {
        const color = colors[p.node.type] ?? "#8b98a8";
        const isFocus = p.node.id === hover || p.node.id === sel;
        const alpha = Math.max(0.25, Math.min(1, (p.scale - 0.6) * 1.6));

        ctx.globalAlpha = alpha * 0.1;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r + 8 * p.scale, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();

        if (isFocus) {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r + 5, 0, Math.PI * 2);
          ctx.stroke();
        }

        const showLabel =
          isFocus || p.node.type === "project" || p.scale > 1.02;
        if (showLabel && alpha > 0.45) {
          ctx.globalAlpha = Math.min(1, alpha + 0.15);
          const size = Math.max(
            9.5,
            (p.node.type === "project" ? 13 : 11) * p.scale,
          );
          ctx.font = `${size.toFixed(1)}px ui-sans-serif, system-ui, sans-serif`;
          ctx.textAlign = "center";
          const label =
            p.node.label.length > 25
              ? `${p.node.label.slice(0, 24)}…`
              : p.node.label;
          ctx.fillStyle = isFocus ? "#e8edf3" : "#aab5c3";
          ctx.fillText(label, p.x, p.y + p.r + size + 3);
        }
      }
      ctx.globalAlpha = 1;
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const view = viewRef.current;

    const hit = (mx: number, my: number): Projected | null => {
      let best: Projected | null = null;
      let bestDist = Infinity;
      for (const p of projectedRef.current) {
        const dx = p.x - mx;
        const dy = p.y - my;
        const dist = dx * dx + dy * dy;
        const threshold = Math.max(p.r + 7, 11);
        if (dist < threshold * threshold && dist < bestDist) {
          best = p;
          bestDist = dist;
        }
      }
      return best;
    };

    const onDown = (event: PointerEvent) => {
      view.dragging = true;
      view.moved = 0;
      view.lastX = event.clientX;
      view.lastY = event.clientY;
      view.lastInteract = performance.now();
      canvas.setPointerCapture(event.pointerId);
    };

    const onMove = (event: PointerEvent) => {
      if (view.dragging) {
        const dx = event.clientX - view.lastX;
        const dy = event.clientY - view.lastY;
        view.moved += Math.abs(dx) + Math.abs(dy);
        view.yaw += dx * 0.005;
        view.pitch = Math.max(-1.2, Math.min(1.2, view.pitch + dy * 0.005));
        view.lastX = event.clientX;
        view.lastY = event.clientY;
        view.lastInteract = performance.now();
        canvas.style.cursor = "grabbing";
      } else {
        const rect = canvas.getBoundingClientRect();
        const found = hit(event.clientX - rect.left, event.clientY - rect.top);
        hoverRef.current = found?.node.id ?? null;
        canvas.style.cursor = found ? "pointer" : "grab";
      }
    };

    const onUp = (event: PointerEvent) => {
      if (!view.dragging) return;
      view.dragging = false;
      view.lastInteract = performance.now();
      canvas.style.cursor = "grab";
      if (view.moved < 5) {
        const rect = canvas.getBoundingClientRect();
        const found = hit(event.clientX - rect.left, event.clientY - rect.top);
        setSelected(found ? found.node : null);
      }
    };

    const onLeave = () => {
      hoverRef.current = null;
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      view.zoom = Math.max(
        0.45,
        Math.min(2.2, view.zoom * (event.deltaY > 0 ? 0.92 : 1.08)),
      );
      view.lastInteract = performance.now();
    };

    canvas.style.cursor = "grab";
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, []);

  return (
    <div>
      <div className="graph-toolbar">
        <input
          className="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search nodes: firebase, HRM, Flutter..."
        />
        <span className="button">
          {visible.length} / {nodes.length} nodes
        </span>
      </div>
      <div className="graph-card">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Second Brain knowledge graph 3D"
        />
        <div className="graph-legend">
          <span className="legend-item">
            <i className="dot" style={{ background: colors.project }} /> project
          </span>
          <span className="legend-item">
            <i className="dot" style={{ background: colors.memory }} /> memory
          </span>
          <span className="legend-item">
            <i className="dot" style={{ background: colors.tag }} /> tag
          </span>
          <span className="legend-item">
            <i className="dot" style={{ background: colors.agent }} /> agent
          </span>
        </div>
        <div className="graph-hint">
          drag untuk memutar · scroll untuk zoom · klik node untuk detail
        </div>
        {selected && (
          <div className="graph-tooltip">
            <strong>{selected.label}</strong>
            <span>
              {selected.type}
              {selected.project ? ` · ${selected.project}` : ""}
            </span>
            {selected.memory && (
              <>
                <br />
                <span>
                  {selected.memory.content.slice(0, 130)}
                  {selected.memory.content.length > 130 ? "…" : ""}
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
