import Link from "next/link";
import { getMemories, getProjects, getStats, getDatabasePath } from "@/lib/db";

export const dynamic = "force-dynamic";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

export default function DashboardPage() {
  const memories = getMemories({ limit: 8 });
  const projects = getProjects();
  const stats = getStats();

  return (
    <main className="main">
      <div className="top-row">
        <div>
          <div className="eyebrow">Local knowledge system</div>
          <h1>Work, remembered.</h1>
          <p className="lead">Satu ruang untuk melihat keputusan, solusi, dan pola yang Anda temukan di HRM, CRM, Inventory, dan seluruh project lain.</p>
        </div>
        <Link className="button" href="/graph">Explore graph <span>↗</span></Link>
      </div>

      <section className="stats">
        <div className="stat"><div className="stat-label">Total memories</div><div className="stat-value">{stats.memories}</div></div>
        <div className="stat"><div className="stat-label">Projects connected</div><div className="stat-value">{stats.projects}</div></div>
        <div className="stat"><div className="stat-label">Knowledge tags</div><div className="stat-value">{stats.tags.length}</div></div>
      </section>

      <section className="content-grid">
        <div className="card">
          <div className="card-title"><h2>Recent memories</h2><span>Latest captured work</span></div>
          {memories.length === 0 ? <p className="empty">Belum ada memory. Jalankan <code>secondbrain auto-capture --agent hermes</code> dari project kerja.</p> : memories.map((memory) => (
            <article className="memory" key={memory.id}>
              <div className="memory-title">{memory.title}</div>
              <div className="memory-meta"><span className="pill">{memory.project}</span><span>{memory.type}</span><span>{memory.agent ?? "manual"}</span><span>{formatDate(memory.created_at)}</span></div>
            </article>
          ))}
        </div>

        <div className="card">
          <div className="card-title"><h2>Projects</h2><span>{getDatabasePath()}</span></div>
          {projects.length === 0 ? <p className="empty">Projects akan muncul setelah memory pertama disimpan.</p> : projects.map((project) => (
            <Link className="project" key={project.id} href={`/project/${encodeURIComponent(project.name)}`}><div className="project-name">{project.name}</div><div className="project-count">{project.memories} memories</div></Link>
          ))}
          <div className="card-title" style={{ marginTop: 30 }}><h2>Popular tags</h2></div>
          <div className="tag-list">{stats.tags.slice(0, 12).map((tag) => <span className="tag" key={tag.name}>#{tag.name} · {tag.count}</span>)}</div>
        </div>
      </section>
    </main>
  );
}
