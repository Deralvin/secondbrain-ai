import Link from "next/link";
import { notFound } from "next/navigation";
import GraphCanvas from "@/app/graph/GraphCanvas";
import { getMemories, getProjects, getGraph } from "@/lib/db";

export const dynamic = "force-dynamic";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

type Props = { params: Promise<{ name: string }> };

export default async function ProjectPage({ params }: Props) {
  const { name } = await params;
  const decoded = decodeURIComponent(name);
  const projects = getProjects();
  const project = projects.find((p) => p.name === decoded);
  if (!project) notFound();

  const memories = getMemories({ project: decoded, limit: 500 });

  const tags: Record<string, number> = {};
  const types: Record<string, number> = {};
  for (const m of memories) {
    types[m.type] = (types[m.type] ?? 0) + 1;
    for (const t of m.tags) {
      tags[t] = (tags[t] ?? 0) + 1;
    }
  }
  const sortedTags = Object.entries(tags)
    .sort((a, b) => b[1] - a[1]);
  const sortedTypes = Object.entries(types)
    .sort((a, b) => b[1] - a[1]);

  const graph = getGraph();
  const relatedMemories = graph.nodes
    .filter(
      (n) =>
        n.type === "memory" &&
        n.project !== decoded &&
        n.memory?.tags?.some((t) => tags[t] > 0)
    )
    .slice(0, 5);

  return (
    <main className="main">
      <div className="page-heading">
        <div className="eyebrow">Project detail</div>
        <h1>{project.name}</h1>
        {project.git_remote && (
          <div className="project-remote">{project.git_remote}</div>
        )}
        <div className="project-created">
          Dibuat {formatDate(project.created_at)}
        </div>
      </div>

      <section className="project-stats">
        <div className="stat">
          <div className="stat-label">Memories</div>
          <div className="stat-value">{memories.length}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Unique tags</div>
          <div className="stat-value">{sortedTags.length}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Memory types</div>
          <div className="stat-value">{sortedTypes.length}</div>
        </div>
      </section>

      <section className="project-graph">
        <GraphCanvas nodes={graph.nodes} links={graph.links} project={decoded} />
      </section>

      <section className="project-content">
        <div className="card">
          <div className="card-title">
            <h2>Memories</h2>
            <span>{memories.length} total</span>
          </div>
          {memories.length === 0 ? (
            <p className="empty">
              Belum ada memory untuk project ini.
            </p>
          ) : (
            memories.map((memory) => (
              <article className="memory" key={memory.id}>
                <div className="memory-title">{memory.title}</div>
                <div className="memory-meta">
                  <span className="pill">{memory.type}</span>
                  {memory.agent && <span>{memory.agent}</span>}
                  <span>{formatDate(memory.created_at)}</span>
                </div>
                {memory.tags.length > 0 && (
                  <div className="memory-tags">
                    {memory.tags.map((t) => (
                      <span className="tag" key={t}>
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </article>
            ))
          )}
        </div>

        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">
              <h2>Types</h2>
            </div>
            {sortedTypes.map(([type, count]) => (
              <div className="project-detail-row" key={type}>
                <span className="pill">{type}</span>
                <span className="project-detail-count">{count}</span>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-title">
              <h2>Tags</h2>
            </div>
            {sortedTags.length === 0 ? (
              <p className="empty">Belum ada tag.</p>
            ) : (
              <div className="tag-list">
                {sortedTags.map(([name, count]) => (
                  <span className="tag" key={name}>
                    #{name} · {count}
                  </span>
                ))}
              </div>
            )}
          </div>

          {relatedMemories.length > 0 && (
            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-title">
                <h2>Cross-project</h2>
                <span>Related memories</span>
              </div>
              {relatedMemories.map((node) => (
                <div className="project-detail-row" key={node.id}>
                  <div>
                    <div className="memory-title">{node.label}</div>
                    <div className="memory-meta">
                      <Link href={`/project/${encodeURIComponent(node.project ?? "")}`}><span className="pill">{node.project}</span></Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
