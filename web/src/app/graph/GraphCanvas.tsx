"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import Link from "next/link";
import type { GraphLink, GraphNode } from "@/lib/db";

type Props = {
  nodes: GraphNode[];
  links: GraphLink[];
  project?: string;
};

type NodeType = "project" | "memory" | "tag" | "agent";

const TYPE_COLORS: Record<NodeType, { hex: number; str: string; glow: string }> = {
  project: { hex: 0x10b981, str: "#10b981", glow: "rgba(16, 185, 129, 0.45)" },
  memory: { hex: 0x38bdf8, str: "#38bdf8", glow: "rgba(56, 189, 248, 0.45)" },
  tag: { hex: 0xc084fc, str: "#c084fc", glow: "rgba(192, 132, 252, 0.45)" },
  agent: { hex: 0xfbbf24, str: "#fbbf24", glow: "rgba(251, 191, 36, 0.45)" },
};

type Vec3 = { x: number; y: number; z: number };

// Deterministic hash for positioning
function pseudoHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// Generate soft radial glow texture for billboard sprites
function createGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
    gradient.addColorStop(0.2, "rgba(255, 255, 255, 0.7)");
    gradient.addColorStop(0.5, "rgba(255, 255, 255, 0.2)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// Generate crisp 2D billboard text sprite
function createTextSprite(
  text: string,
  color: string,
  fontSize: number = 24,
  isBold: boolean = false
): THREE.Sprite {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const fontStr = `${isBold ? "700 " : "500 "}${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  
  if (ctx) {
    ctx.font = fontStr;
    const metrics = ctx.measureText(text);
    const textWidth = Math.ceil(metrics.width);
    const textHeight = Math.ceil(fontSize * 1.4);
    
    canvas.width = textWidth + 24;
    canvas.height = textHeight + 12;
    
    // Background pill for readability
    ctx.font = fontStr;
    ctx.fillStyle = "rgba(11, 16, 24, 0.75)";
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, 6);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.lineWidth = 1;
    ctx.stroke();
    
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 1);
  }
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const spriteMaterial = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(spriteMaterial);
  const aspect = canvas.width / canvas.height;
  const baseScale = fontSize * 0.55;
  sprite.scale.set(baseScale * aspect, baseScale, 1);
  return sprite;
}

type LayoutMode = "galaxy" | "orbit" | "helix";

interface NodeEntity {
  node: GraphNode;
  mesh: THREE.Mesh;
  glowSprite: THREE.Sprite;
  labelSprite?: THREE.Sprite;
  orbitRing?: THREE.Line;
  currentPos: Vec3;
  targetPos: Vec3;
  baseScale: number;
}

interface PulsePacket {
  linkIndex: number;
  progress: number;
  speed: number;
  sourceId: string;
  targetId: string;
}

export default function GraphCanvas({ nodes, links, project }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // User state
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<{ node: GraphNode; x: number; y: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | NodeType>("all");
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("galaxy");
  const [autoRotate, setAutoRotate] = useState(true);
  const [showPulses, setShowPulses] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Scoped nodes for specific project if prop is provided
  const scopedNodes = useMemo(() => {
    if (!project) return nodes;
    const memoryIds = new Set(
      nodes.filter((n) => n.type === "memory" && n.project === project).map((n) => n.id)
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
            (l.target === n.id && memoryIds.has(l.source))
        );
        if (!connected) keep.delete(n.id);
      }
    }
    return Array.from(keep.values());
  }, [nodes, links, project]);

  // Filtered by search and active type filter
  const visibleNodes = useMemo(() => {
    let result = scopedNodes;
    if (activeFilter !== "all") {
      result = result.filter((n) => n.type === activeFilter);
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (n) =>
          n.label.toLowerCase().includes(q) ||
          n.project?.toLowerCase().includes(q) ||
          n.type.toLowerCase().includes(q) ||
          n.memory?.content.toLowerCase().includes(q)
      );
    }
    return result;
  }, [scopedNodes, activeFilter, searchQuery]);

  // Relevant links for visible nodes
  const visibleLinks = useMemo(() => {
    const ids = new Set(visibleNodes.map((n) => n.id));
    return links.filter((l) => ids.has(l.source) && ids.has(l.target));
  }, [visibleNodes, links]);

  // Stats count
  const typeCounts = useMemo(() => {
    const counts = { project: 0, memory: 0, tag: 0, agent: 0 };
    for (const n of scopedNodes) {
      if (counts[n.type] !== undefined) counts[n.type]++;
    }
    return counts;
  }, [scopedNodes]);

  // Adjacency map for instant lookup of connected nodes
  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const link of links) {
      if (!map.has(link.source)) map.set(link.source, new Set());
      if (!map.has(link.target)) map.set(link.target, new Set());
      map.get(link.source)!.add(link.target);
      map.get(link.target)!.add(link.source);
    }
    return map;
  }, [links]);

  // Connected neighbors of selected node
  const connectedNeighbors = useMemo(() => {
    if (!selectedNode) return [];
    const neighborIds = adjacency.get(selectedNode.id) ?? new Set();
    return nodes.filter((n) => neighborIds.has(n.id));
  }, [selectedNode, adjacency, nodes]);

  // References for Three.js engine
  const threeRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    entities: Map<string, NodeEntity>;
    raycaster: THREE.Raycaster;
    pointer: THREE.Vector2;
    linesMesh: THREE.LineSegments;
    pulsesMesh: THREE.Points;
    pulsesData: PulsePacket[];
    flyTarget: {
      active: boolean;
      targetPos: THREE.Vector3;
      targetLookAt: THREE.Vector3;
      startTime: number;
      duration: number;
    } | null;
  } | null>(null);

  // Position generation algorithms
  const calculateTargetPositions = useCallback(
    (nodeList: GraphNode[], mode: LayoutMode): Map<string, Vec3> => {
      const positions = new Map<string, Vec3>();
      const total = nodeList.length;
      if (total === 0) return positions;

      if (mode === "orbit") {
        // Stratified concentric shells
        const radiusMap: Record<NodeType, number> = {
          project: 120,
          memory: 230,
          tag: 330,
          agent: 410,
        };
        const counts: Record<string, number> = {};
        const indices: Record<string, number> = {};
        for (const n of nodeList) counts[n.type] = (counts[n.type] ?? 0) + 1;

        for (const n of nodeList) {
          const idx = indices[n.type] ?? 0;
          indices[n.type] = idx + 1;
          const count = Math.max(counts[n.type], 1);
          const phi = Math.acos(1 - (2 * (idx + 0.5)) / count);
          const theta = Math.PI * (1 + Math.sqrt(5)) * idx;
          const r = radiusMap[n.type];
          positions.set(n.id, {
            x: Math.cos(theta) * Math.sin(phi) * r,
            y: Math.sin(theta) * Math.sin(phi) * r * 0.85,
            z: Math.cos(phi) * r,
          });
        }
      } else if (mode === "helix") {
        // Futuristic double-spiral cyber helix
        const sorted = [...nodeList].sort((a, b) => {
          if (a.type !== b.type) return a.type.localeCompare(b.type);
          return a.label.localeCompare(b.label);
        });
        const heightStep = 600 / Math.max(sorted.length, 1);
        sorted.forEach((n, i) => {
          const angle = i * 0.45;
          const radius = 220 + Math.sin(i * 0.2) * 50;
          const y = (i - sorted.length / 2) * heightStep;
          positions.set(n.id, {
            x: Math.cos(angle) * radius,
            y,
            z: Math.sin(angle) * radius,
          });
        });
      } else {
        // "galaxy": Organic physics-inspired cluster layout
        // Projects act as gravitational star hubs
        const projects = nodeList.filter((n) => n.type === "project");
        const projectPositions = new Map<string, Vec3>();
        const projCount = Math.max(projects.length, 1);
        projects.forEach((p, i) => {
          const angle = (i / projCount) * Math.PI * 2;
          const r = 180 + (i % 2 === 0 ? 0 : 50);
          const pos = {
            x: Math.cos(angle) * r,
            y: (Math.sin(angle * 2) * 45) + ((i % 3) - 1) * 30,
            z: Math.sin(angle) * r,
          };
          projectPositions.set(p.label, pos);
          positions.set(p.id, pos);
        });

        // Place memories near their parent projects
        const memoryNodes = nodeList.filter((n) => n.type === "memory");
        memoryNodes.forEach((m) => {
          const pLabel = m.project ?? "";
          const pPos = projectPositions.get(pLabel) ?? { x: 0, y: 0, z: 0 };
          const h = pseudoHash(m.id);
          const theta = ((h % 1000) / 1000) * Math.PI * 2;
          const phi = (((h >> 8) % 1000) / 1000) * Math.PI;
          const dist = 55 + (h % 85);
          positions.set(m.id, {
            x: pPos.x + Math.sin(phi) * Math.cos(theta) * dist,
            y: pPos.y + Math.cos(phi) * dist * 0.8,
            z: pPos.z + Math.sin(phi) * Math.sin(theta) * dist,
          });
        });

        // Place tags and agents centrally or near related memories
        const tagAndAgentNodes = nodeList.filter((n) => n.type === "tag" || n.type === "agent");
        tagAndAgentNodes.forEach((t, i) => {
          const isAgent = t.type === "agent";
          const r = isAgent ? 310 : 250;
          const angle = (i / Math.max(tagAndAgentNodes.length, 1)) * Math.PI * 2 + 0.3;
          const elevation = Math.sin(i * 1.5) * 110;
          positions.set(t.id, {
            x: Math.cos(angle) * r,
            y: elevation,
            z: Math.sin(angle) * r,
          });
        });
      }

      return positions;
    },
    []
  );

  // Initialize Three.js scene
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const w = container.clientWidth || 800;
    const h = container.clientHeight || 650;

    // Scene
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x06090d, 0.00075);

    // Camera
    const camera = new THREE.PerspectiveCamera(50, w / h, 1, 3500);
    camera.position.set(0, 180, 560);

    // WebGL Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    // Controls
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 80;
    controls.maxDistance = 1400;
    controls.rotateSpeed = 0.8;
    controls.zoomSpeed = 1.1;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 1.0;

    // Ambient & Point Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);

    const light1 = new THREE.PointLight(0x10b981, 2.5, 900, 1.2);
    light1.position.set(220, 260, 220);
    scene.add(light1);

    const light2 = new THREE.PointLight(0x38bdf8, 2.5, 900, 1.2);
    light2.position.set(-240, -180, 200);
    scene.add(light2);

    const light3 = new THREE.PointLight(0xc084fc, 2.0, 900, 1.2);
    light3.position.set(0, 320, -250);
    scene.add(light3);

    // Deep cosmic particle field (stardust stars)
    const starCount = 1200;
    const starGeom = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const radius = 600 + Math.random() * 900;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = radius * Math.cos(phi);

      const colorTint = Math.random();
      if (colorTint < 0.3) {
        starColors[i * 3] = 0.4;
        starColors[i * 3 + 1] = 0.7;
        starColors[i * 3 + 2] = 1.0;
      } else if (colorTint < 0.6) {
        starColors[i * 3] = 0.8;
        starColors[i * 3 + 1] = 0.6;
        starColors[i * 3 + 2] = 1.0;
      } else {
        starColors[i * 3] = 0.9;
        starColors[i * 3 + 1] = 0.95;
        starColors[i * 3 + 2] = 1.0;
      }
    }
    starGeom.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    starGeom.setAttribute("color", new THREE.BufferAttribute(starColors, 3));
    const starMat = new THREE.PointsMaterial({
      size: 2.2,
      vertexColors: true,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    const starfield = new THREE.Points(starGeom, starMat);
    scene.add(starfield);

    // Central subtle coordinate rings (knowledge horizon)
    const ringGeom = new THREE.RingGeometry(55, 56, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x26384a,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.35,
    });
    const horizonRing = new THREE.Mesh(ringGeom, ringMat);
    horizonRing.rotation.x = Math.PI / 2;
    scene.add(horizonRing);

    // Shared Line Mesh for graph connections
    const lineGeom = new THREE.BufferGeometry();
    const lineMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const linesMesh = new THREE.LineSegments(lineGeom, lineMat);
    scene.add(linesMesh);

    // Shared Travelling Pulses (Photons)
    const pulseCount = 180;
    const pulseGeom = new THREE.BufferGeometry();
    const pulsePositions = new Float32Array(pulseCount * 3);
    const pulseColors = new Float32Array(pulseCount * 3);
    pulseGeom.setAttribute("position", new THREE.BufferAttribute(pulsePositions, 3));
    pulseGeom.setAttribute("color", new THREE.BufferAttribute(pulseColors, 3));
    const pulseMat = new THREE.PointsMaterial({
      size: 4.8,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const pulsesMesh = new THREE.Points(pulseGeom, pulseMat);
    scene.add(pulsesMesh);

    // Save Three.js system state
    threeRef.current = {
      scene,
      camera,
      renderer,
      controls,
      entities: new Map(),
      raycaster: new THREE.Raycaster(),
      pointer: new THREE.Vector2(-999, -999),
      linesMesh,
      pulsesMesh,
      pulsesData: [],
      flyTarget: null,
    };

    // Animation Loop
    let animId = 0;
    let clock = new THREE.Clock();

    const renderLoop = () => {
      animId = requestAnimationFrame(renderLoop);
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();


      // Gently orbit point lights for dynamic surface luster
      light1.position.x = Math.cos(elapsed * 0.4) * 260;
      light1.position.z = Math.sin(elapsed * 0.4) * 260;
      light2.position.x = Math.sin(elapsed * 0.35) * 280;
      light2.position.z = Math.cos(elapsed * 0.35) * 280;

      // Smooth camera fly-to interpolation
      const sys = threeRef.current;
      if (sys?.flyTarget?.active) {
        const ft = sys.flyTarget;
        const progress = Math.min((performance.now() - ft.startTime) / ft.duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        camera.position.lerpVectors(camera.position, ft.targetPos, 0.08);
        controls.target.lerp(ft.targetLookAt, 0.08);
        if (progress >= 1) {
          ft.active = false;
        }
      }

      // Smooth node position lerp and breathing pulse
      if (sys) {
        for (const [id, entity] of sys.entities) {
          entity.currentPos.x += (entity.targetPos.x - entity.currentPos.x) * 0.08;
          entity.currentPos.y += (entity.targetPos.y - entity.currentPos.y) * 0.08;
          entity.currentPos.z += (entity.targetPos.z - entity.currentPos.z) * 0.08;

          const breathe = 1 + Math.sin(elapsed * 2.2 + pseudoHash(id)) * 0.04;
          const s = entity.baseScale * breathe;
          entity.mesh.position.set(entity.currentPos.x, entity.currentPos.y, entity.currentPos.z);
          entity.mesh.scale.set(s, s, s);

          if (entity.orbitRing) {
            entity.orbitRing.position.copy(entity.mesh.position);
            entity.orbitRing.rotation.x = Math.PI / 3 + elapsed * 0.4;
            entity.orbitRing.rotation.y = elapsed * 0.6;
          }

          entity.glowSprite.position.copy(entity.mesh.position);
          if (entity.labelSprite) {
            entity.labelSprite.position.set(
              entity.currentPos.x,
              entity.currentPos.y + (entity.node.type === "project" ? 22 : 14),
              entity.currentPos.z
            );
          }
        }

        // Animate travelling pulses along links
        if (showPulses && sys.pulsesData.length > 0) {
          const positions = sys.pulsesMesh.geometry.attributes.position.array as Float32Array;
          const colors = sys.pulsesMesh.geometry.attributes.color.array as Float32Array;
          const pCount = Math.min(sys.pulsesData.length, pulseCount);

          for (let i = 0; i < pCount; i++) {
            const p = sys.pulsesData[i];
            p.progress = (p.progress + p.speed * delta) % 1;
            const src = sys.entities.get(p.sourceId);
            const tgt = sys.entities.get(p.targetId);

            if (src && tgt) {
              const px = src.currentPos.x + (tgt.currentPos.x - src.currentPos.x) * p.progress;
              const py = src.currentPos.y + (tgt.currentPos.y - src.currentPos.y) * p.progress;
              const pz = src.currentPos.z + (tgt.currentPos.z - src.currentPos.z) * p.progress;

              positions[i * 3] = px;
              positions[i * 3 + 1] = py;
              positions[i * 3 + 2] = pz;

              const c = TYPE_COLORS[tgt.node.type] ?? TYPE_COLORS.memory;
              const colorObj = new THREE.Color(c.hex);
              colors[i * 3] = colorObj.r;
              colors[i * 3 + 1] = colorObj.g;
              colors[i * 3 + 2] = colorObj.b;
            }
          }
          sys.pulsesMesh.geometry.attributes.position.needsUpdate = true;
          sys.pulsesMesh.geometry.attributes.color.needsUpdate = true;
          sys.pulsesMesh.visible = true;
        } else if (sys.pulsesMesh) {
          sys.pulsesMesh.visible = false;
        }

        // Update link lines geometry
        updateLinesGeometry(sys);
      }

      controls.update();
      renderer.render(scene, camera);
    };

    renderLoop();

    // Resize observer
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const width = container.clientWidth;
      const height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
      controls.dispose();
    };
  }, []);

  // Sync autoRotate state with controls
  useEffect(() => {
    if (threeRef.current) {
      threeRef.current.controls.autoRotate = autoRotate;
    }
  }, [autoRotate]);

  // Update line connections geometry in Three.js
  const updateLinesGeometry = (sys: NonNullable<typeof threeRef.current>) => {
    if (!sys) return;
    const currentSelectedId = selectedNode?.id ?? null;
    const currentHoverId = hoveredNode?.node.id ?? null;
    const focusId = currentHoverId || currentSelectedId;

    const linePoints: number[] = [];
    const lineColors: number[] = [];

    for (const link of visibleLinks) {
      const src = sys.entities.get(link.source);
      const tgt = sys.entities.get(link.target);
      if (!src || !tgt) continue;

      linePoints.push(
        src.currentPos.x, src.currentPos.y, src.currentPos.z,
        tgt.currentPos.x, tgt.currentPos.y, tgt.currentPos.z
      );

      const isConnectedToFocus =
        focusId && (link.source === focusId || link.target === focusId);

      if (isConnectedToFocus) {
        // Bright radiant glowing connection
        const c1 = new THREE.Color(TYPE_COLORS[src.node.type].hex);
        const c2 = new THREE.Color(TYPE_COLORS[tgt.node.type].hex);
        lineColors.push(c1.r * 1.5, c1.g * 1.5, c1.b * 1.5);
        lineColors.push(c2.r * 1.5, c2.g * 1.5, c2.b * 1.5);
      } else if (focusId) {
        // Dim connection when another node is focused
        lineColors.push(0.08, 0.12, 0.18);
        lineColors.push(0.08, 0.12, 0.18);
      } else {
        // Subtle cyber connection
        const c1 = new THREE.Color(0x38bdf8);
        const c2 = new THREE.Color(0x72d6bd);
        lineColors.push(c1.r * 0.35, c1.g * 0.35, c1.b * 0.35);
        lineColors.push(c2.r * 0.35, c2.g * 0.35, c2.b * 0.35);
      }
    }

    const posAttr = new THREE.Float32BufferAttribute(linePoints, 3);
    const colAttr = new THREE.Float32BufferAttribute(lineColors, 3);
    sys.linesMesh.geometry.setAttribute("position", posAttr);
    sys.linesMesh.geometry.setAttribute("color", colAttr);
    sys.linesMesh.geometry.attributes.position.needsUpdate = true;
    sys.linesMesh.geometry.attributes.color.needsUpdate = true;
  };

  // Sync node meshes with visibleNodes and active layoutMode
  useEffect(() => {
    const sys = threeRef.current;
    if (!sys) return;

    const { scene } = sys;
    const glowTexture = createGlowTexture();
    const targetPositions = calculateTargetPositions(visibleNodes, layoutMode);

    // Geometries
    const projectGeom = new THREE.IcosahedronGeometry(12, 1);
    const memoryGeom = new THREE.SphereGeometry(7, 24, 24);
    const tagGeom = new THREE.OctahedronGeometry(6.2, 0);
    const agentGeom = new THREE.DodecahedronGeometry(7, 0);
    const orbitRingGeom = new THREE.TorusGeometry(19, 0.5, 6, 36);

    const newEntities = new Map<string, NodeEntity>();
    const currentEntityIds = new Set(sys.entities.keys());
    const visibleIds = new Set(visibleNodes.map((n) => n.id));

    // Remove deleted nodes
    for (const [id, entity] of sys.entities) {
      if (!visibleIds.has(id)) {
        scene.remove(entity.mesh);
        scene.remove(entity.glowSprite);
        if (entity.labelSprite) scene.remove(entity.labelSprite);
        if (entity.orbitRing) scene.remove(entity.orbitRing);
      }
    }

    // Add or update nodes
    for (const node of visibleNodes) {
      const targetPos = targetPositions.get(node.id) ?? { x: 0, y: 0, z: 0 };
      const config = TYPE_COLORS[node.type];

      if (sys.entities.has(node.id)) {
        const entity = sys.entities.get(node.id)!;
        entity.targetPos = targetPos;
        newEntities.set(node.id, entity);
      } else {
        // Create 3D Mesh
        let geom: THREE.BufferGeometry = memoryGeom;
        let baseScale = 1;
        if (node.type === "project") {
          geom = projectGeom;
          baseScale = 1.35;
        } else if (node.type === "tag") {
          geom = tagGeom;
          baseScale = 1.0;
        } else if (node.type === "agent") {
          geom = agentGeom;
          baseScale = 1.15;
        }

        const material = new THREE.MeshStandardMaterial({
          color: config.hex,
          emissive: config.hex,
          emissiveIntensity: node.type === "project" ? 0.45 : 0.25,
          metalness: 0.35,
          roughness: 0.25,
        });

        const mesh = new THREE.Mesh(geom, material);
        mesh.userData = { nodeId: node.id };

        // Soft Billboard Glow Sprite
        const glowMaterial = new THREE.SpriteMaterial({
          map: glowTexture,
          color: config.hex,
          transparent: true,
          opacity: node.type === "project" ? 0.6 : 0.4,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const glowSprite = new THREE.Sprite(glowMaterial);
        const glowSize = node.type === "project" ? 54 : 32;
        glowSprite.scale.set(glowSize, glowSize, 1);
        scene.add(glowSprite);

        // Rotating orbit ring for project hubs
        let orbitRing: THREE.Line | undefined = undefined;
        if (node.type === "project") {
          const ringMat = new THREE.LineBasicMaterial({
            color: config.hex,
            transparent: true,
            opacity: 0.6,
          });
          orbitRing = new THREE.Line(orbitRingGeom, ringMat);
          scene.add(orbitRing);
        }

        // Crisp 3D Text Label
        let labelSprite: THREE.Sprite | undefined = undefined;
        if (node.type === "project" || visibleNodes.length <= 40) {
          const shortLabel = node.label.length > 20 ? `${node.label.slice(0, 19)}…` : node.label;
          labelSprite = createTextSprite(
            shortLabel,
            config.str,
            node.type === "project" ? 22 : 18,
            node.type === "project"
          );
          scene.add(labelSprite);
        }

        mesh.position.set(targetPos.x, targetPos.y, targetPos.z);
        glowSprite.position.copy(mesh.position);
        scene.add(mesh);

        newEntities.set(node.id, {
          node,
          mesh,
          glowSprite,
          labelSprite,
          orbitRing,
          currentPos: { ...targetPos },
          targetPos,
          baseScale,
        });
      }
    }

    sys.entities = newEntities;

    // Generate traveling pulses for visible links
    const pulsePackets: PulsePacket[] = [];
    visibleLinks.forEach((link, idx) => {
      pulsePackets.push({
        linkIndex: idx,
        progress: (idx * 0.17) % 1,
        speed: 0.25 + ((idx % 5) * 0.08),
        sourceId: link.source,
        targetId: link.target,
      });
    });
    sys.pulsesData = pulsePackets;
  }, [visibleNodes, visibleLinks, layoutMode, calculateTargetPositions]);

  // Smooth camera fly-to function
  const focusNodeIn3D = useCallback((targetNode: GraphNode) => {
    const sys = threeRef.current;
    if (!sys) return;
    const entity = sys.entities.get(targetNode.id);
    if (!entity) return;

    const targetPos = new THREE.Vector3(
      entity.currentPos.x,
      entity.currentPos.y,
      entity.currentPos.z
    );
    const cameraOffset = new THREE.Vector3(0, 35, 120);
    const destination = targetPos.clone().add(cameraOffset);

    sys.flyTarget = {
      active: true,
      targetPos: destination,
      targetLookAt: targetPos,
      startTime: performance.now(),
      duration: 1200,
    };
  }, []);

  // Raycaster & Pointer Interaction (Hover & Click)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let pointerDownPos = { x: 0, y: 0 };

    const handlePointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const handlePointerMove = (e: PointerEvent) => {
      const sys = threeRef.current;
      if (!sys) return;

      const rect = canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      sys.pointer.set(x, y);

      sys.raycaster.setFromCamera(sys.pointer, sys.camera);
      const meshes = Array.from(sys.entities.values()).map((ent) => ent.mesh);
      const intersects = sys.raycaster.intersectObjects(meshes, false);

      if (intersects.length > 0) {
        const hitMesh = intersects[0].object as THREE.Mesh;
        const hitId = hitMesh.userData.nodeId;
        const entity = sys.entities.get(hitId);
        if (entity) {
          canvas.style.cursor = "pointer";
          setHoveredNode({
            node: entity.node,
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
          });
          return;
        }
      }

      canvas.style.cursor = "grab";
      setHoveredNode(null);
    };

    const handlePointerUp = (e: PointerEvent) => {
      const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (dist > 6) return; // user dragged camera, not clicked

      const sys = threeRef.current;
      if (!sys) return;

      const rect = canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      sys.pointer.set(x, y);

      sys.raycaster.setFromCamera(sys.pointer, sys.camera);
      const meshes = Array.from(sys.entities.values()).map((ent) => ent.mesh);
      const intersects = sys.raycaster.intersectObjects(meshes, false);

      if (intersects.length > 0) {
        const hitMesh = intersects[0].object as THREE.Mesh;
        const hitId = hitMesh.userData.nodeId;
        const entity = sys.entities.get(hitId);
        if (entity) {
          setSelectedNode(entity.node);
          focusNodeIn3D(entity.node);
          return;
        }
      }
    };

    const handlePointerLeave = () => {
      setHoveredNode(null);
    };

    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointerleave", handlePointerLeave);

    return () => {
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, [focusNodeIn3D]);

  // Reset Camera View
  const handleResetCamera = () => {
    const sys = threeRef.current;
    if (!sys) return;
    sys.flyTarget = {
      active: true,
      targetPos: new THREE.Vector3(0, 180, 560),
      targetLookAt: new THREE.Vector3(0, 0, 0),
      startTime: performance.now(),
      duration: 900,
    };
  };

  return (
    <div className="graph-container">
      {/* Top Toolbar */}
      <div className="graph-toolbar">
        <div className="graph-search-group">
          <input
            className="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search nodes: react-query, HRM, Hermes, SQLite..."
          />
        </div>

        {/* Filter Pills */}
        <div className="graph-filters">
          <button
            className={`filter-chip ${activeFilter === "all" ? "active" : ""}`}
            onClick={() => setActiveFilter("all")}
          >
            All <span className="filter-count">{scopedNodes.length}</span>
          </button>
          <button
            className={`filter-chip ${activeFilter === "project" ? "active" : ""}`}
            onClick={() => setActiveFilter("project")}
          >
            <i className="dot" style={{ background: TYPE_COLORS.project.str }} />
            Projects <span className="filter-count">{typeCounts.project}</span>
          </button>
          <button
            className={`filter-chip ${activeFilter === "memory" ? "active" : ""}`}
            onClick={() => setActiveFilter("memory")}
          >
            <i className="dot" style={{ background: TYPE_COLORS.memory.str }} />
            Memories <span className="filter-count">{typeCounts.memory}</span>
          </button>
          <button
            className={`filter-chip ${activeFilter === "tag" ? "active" : ""}`}
            onClick={() => setActiveFilter("tag")}
          >
            <i className="dot" style={{ background: TYPE_COLORS.tag.str }} />
            Tags <span className="filter-count">{typeCounts.tag}</span>
          </button>
          <button
            className={`filter-chip ${activeFilter === "agent" ? "active" : ""}`}
            onClick={() => setActiveFilter("agent")}
          >
            <i className="dot" style={{ background: TYPE_COLORS.agent.str }} />
            Agents <span className="filter-count">{typeCounts.agent}</span>
          </button>
        </div>
      </div>

      {/* Main 3D Card Viewport */}
      <div
        ref={containerRef}
        className={`graph-card ${isFullscreen ? "is-fullscreen" : ""}`}
      >
        <canvas ref={canvasRef} role="img" aria-label="Interactive 3D Knowledge Graph" />

        {/* Top-Left Info HUD */}
        <div className="graph-hud-top-left">
          <div className="hud-badge">
            <span className="hud-badge-dot" />
            <span>{visibleNodes.length} Nodes · {visibleLinks.length} Connections</span>
          </div>
          {project && (
            <div className="hud-badge">
              <span>Project: <strong>{project}</strong></span>
            </div>
          )}
        </div>

        {/* Top-Right Control Buttons */}
        <div className="graph-hud-top-right">
          {/* Layout Selector */}
          <button
            className="hud-btn"
            title="Switch 3D Layout Structure"
            onClick={() => {
              const modes: LayoutMode[] = ["galaxy", "orbit", "helix"];
              const nextIndex = (modes.indexOf(layoutMode) + 1) % modes.length;
              setLayoutMode(modes[nextIndex]);
            }}
          >
            <span>Layout:</span>
            <strong style={{ textTransform: "capitalize", color: "var(--accent)" }}>
              {layoutMode}
            </strong>
          </button>

          {/* Auto Rotate Toggle */}
          <button
            className={`hud-btn ${autoRotate ? "active" : ""}`}
            title="Toggle Cosmic Auto-Rotation"
            onClick={() => setAutoRotate(!autoRotate)}
          >
            <span>{autoRotate ? "⏸ Orbit" : "▶ Orbit"}</span>
          </button>

          {/* Data Pulses Toggle */}
          <button
            className={`hud-btn ${showPulses ? "active" : ""}`}
            title="Toggle Data Pulses"
            onClick={() => setShowPulses(!showPulses)}
          >
            <span>⚡ Pulses</span>
          </button>

          {/* Center / Reset View */}
          <button
            className="hud-btn"
            title="Reset Camera to Center"
            onClick={handleResetCamera}
          >
            <span>🎯 Center</span>
          </button>

          {/* Fullscreen Toggle */}
          <button
            className="hud-btn"
            title="Toggle Fullscreen"
            onClick={() => setIsFullscreen(!isFullscreen)}
          >
            <span>{isFullscreen ? "↙ Exit" : "⛶ Expand"}</span>
          </button>
        </div>

        {/* Bottom Legend */}
        <div className="graph-legend">
          <span className="legend-item">
            <i className="dot" style={{ background: TYPE_COLORS.project.str }} /> Project
          </span>
          <span className="legend-item">
            <i className="dot" style={{ background: TYPE_COLORS.memory.str }} /> Memory
          </span>
          <span className="legend-item">
            <i className="dot" style={{ background: TYPE_COLORS.tag.str }} /> Tag
          </span>
          <span className="legend-item">
            <i className="dot" style={{ background: TYPE_COLORS.agent.str }} /> Agent
          </span>
        </div>

        <div className="graph-hint">
          Drag to rotate · Scroll to zoom · Click node to inspect details
        </div>

        {/* Hover Tooltip Cursor */}
        {hoveredNode && !selectedNode && (
          <div
            className="graph-hover-card"
            style={{
              left: hoveredNode.x,
              top: hoveredNode.y,
            }}
          >
            <div className="graph-hover-header">
              <i
                className="dot"
                style={{ background: TYPE_COLORS[hoveredNode.node.type].str }}
              />
              <span>{hoveredNode.node.label}</span>
              <span
                className="graph-hover-type"
                style={{
                  background: TYPE_COLORS[hoveredNode.node.type].glow,
                  color: TYPE_COLORS[hoveredNode.node.type].str,
                }}
              >
                {hoveredNode.node.type}
              </span>
            </div>
          </div>
        )}

        {/* Floating Glassmorphic Node Inspector Drawer */}
        {selectedNode && (
          <div className="graph-inspector">
            <div className="inspector-header">
              <span
                className="inspector-badge"
                style={{
                  background: TYPE_COLORS[selectedNode.type].glow,
                  color: TYPE_COLORS[selectedNode.type].str,
                }}
              >
                <i
                  className="dot"
                  style={{ background: TYPE_COLORS[selectedNode.type].str }}
                />
                {selectedNode.type}
              </span>
              <button
                className="inspector-close"
                onClick={() => setSelectedNode(null)}
                title="Close Inspector"
              >
                ✕
              </button>
            </div>

            <h3 className="inspector-title">{selectedNode.label}</h3>

            {selectedNode.project && (
              <div className="inspector-meta">
                <span>Belongs to project:</span>
                <Link
                  href={`/project/${encodeURIComponent(selectedNode.project)}`}
                  style={{ color: "var(--accent)", textDecoration: "underline" }}
                >
                  {selectedNode.project}
                </Link>
              </div>
            )}

            {/* Memory Specific Content */}
            {selectedNode.memory && (
              <>
                <div className="inspector-desc">
                  {selectedNode.memory.content.slice(0, 240)}
                  {selectedNode.memory.content.length > 240 ? "…" : ""}
                </div>

                <div className="inspector-meta">
                  <span>Type: <strong>{selectedNode.memory.type}</strong></span>
                  {selectedNode.memory.agent && (
                    <span>· Agent: <strong>{selectedNode.memory.agent}</strong></span>
                  )}
                </div>
              </>
            )}

            {/* Connected Neighbors Links */}
            {connectedNeighbors.length > 0 && (
              <div>
                <div className="inspector-section-label">
                  Connected Nodes ({connectedNeighbors.length})
                </div>
                <div className="inspector-chips">
                  {connectedNeighbors.slice(0, 16).map((neighbor) => (
                    <button
                      key={neighbor.id}
                      className="inspector-chip"
                      onClick={() => {
                        setSelectedNode(neighbor);
                        focusNodeIn3D(neighbor);
                      }}
                      title={`Jump to ${neighbor.label}`}
                    >
                      <i
                        className="dot"
                        style={{ background: TYPE_COLORS[neighbor.type].str }}
                      />
                      <span>
                        {neighbor.label.length > 18
                          ? `${neighbor.label.slice(0, 16)}…`
                          : neighbor.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="inspector-actions">
              <button
                className="inspector-action-btn primary"
                onClick={() => focusNodeIn3D(selectedNode)}
              >
                🔍 Focus 3D
              </button>

              {selectedNode.type === "project" ? (
                <Link
                  className="inspector-action-btn"
                  href={`/project/${encodeURIComponent(selectedNode.label)}`}
                >
                  Open Page ↗
                </Link>
              ) : selectedNode.type === "memory" && selectedNode.memory ? (
                <Link
                  className="inspector-action-btn"
                  href={`/memory/${selectedNode.memory.id}`}
                >
                  View Details ↗
                </Link>
              ) : selectedNode.project ? (
                <Link
                  className="inspector-action-btn"
                  href={`/project/${encodeURIComponent(selectedNode.project)}`}
                >
                  View Project ↗
                </Link>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
