import { spawnSync } from "node:child_process";

export type Memory = {
  id: string;
  title: string;
  content: string;
  type: string;
  project: string;
  tags: string[];
  files: string[];
  agent: string | null;
  created_at: string;
  git_commit: string | null;
};

export type Project = {
  id: number;
  name: string;
  git_remote: string | null;
  created_at: string;
  memories: number;
};

export type GraphNode = {
  id: string;
  label: string;
  type: "project" | "memory" | "tag" | "agent";
  project?: string;
  memory?: Memory;
};

export type GraphLink = {
  source: string;
  target: string;
  kind: string;
  is_relation?: boolean;
};
export type MemoryRelation = {
  from_id: string;
  to_id: string;
  kind: string;
  direction?: "outgoing" | "incoming";
};
export type MemoryDetail = Memory & { relations?: MemoryRelation[] };

export type BridgeAction = "memories" | "projects" | "stats" | "graph" | "memory" | "create_memory" | "update_memory" | "delete_memory";

export type CreateMemoryInput = {
  title: string;
  content: string;
  project: string;
  type?: string;
  tags?: string[];
  files?: string[];
  agent?: string;
};

export type UpdateMemoryInput = {
  id: string;
  title?: string;
  content?: string;
  project?: string;
  type?: string;
  tags?: string[];
  files?: string[];
};

const python = process.env.SECONDBRAIN_PYTHON ?? "/usr/bin/python3";

function runBridge<T>(action: BridgeAction, args: Record<string, unknown> = {}): T {
  const request = JSON.stringify({ action, ...args });
  const result = spawnSync(python, ["-m", "secondbrain.bridge"], { /*turbopackIgnore: true*/
    input: request,
    encoding: "utf8",
    timeout: 15000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`secondbrain bridge failed (${result.status}): ${result.stderr}`);
  }
  return JSON.parse(result.stdout) as T;
}

export function getMemories(options: { query?: string; project?: string; limit?: number } = {}): Memory[] {
  if (options.query) {
    return runBridge<Memory[]>("memories", {
      query: options.query,
      project: options.project ?? "",
      limit: options.limit ?? 100,
    });
  }
  return runBridge<Memory[]>("memories", {
    project: options.project ?? null,
    limit: options.limit ?? 100,
  });
}

export function getProjects(): Project[] {
  return runBridge<Project[]>("projects");
}

export function getStats() {
  const stats = runBridge<{ memories: number; projects: number; tags: Record<string, number> }>("stats");
  return {
    memories: stats.memories,
    projects: stats.projects,
    tags: Object.entries(stats.tags)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count })),
  };
}

export function getGraph(): { nodes: GraphNode[]; links: GraphLink[] } {
  return runBridge<{ nodes: GraphNode[]; links: GraphLink[] }>("graph");
}

export function getMemory(id: string): MemoryDetail | null {
  return runBridge<MemoryDetail | null>("memory", { id });
}

export function createMemory(input: CreateMemoryInput): { id: string; success: boolean } {
  return runBridge<{ id: string; success: boolean }>("create_memory", input);
}

export function updateMemory(input: UpdateMemoryInput): { memory: MemoryDetail; success: boolean } {
  return runBridge<{ memory: MemoryDetail; success: boolean }>("update_memory", input);
}

export function deleteMemory(id: string): { id: string; success: boolean } {
  return runBridge<{ id: string; success: boolean }>("delete_memory", { id });
}

export function getDatabasePath() {
  return process.env.SECONDBRAIN_HOME
    ? `${process.env.SECONDBRAIN_HOME}/brain.db`
    : "~/.secondbrain/brain.db";
}
