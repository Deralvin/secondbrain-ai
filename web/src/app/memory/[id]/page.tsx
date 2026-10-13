import Link from "next/link";
import { notFound } from "next/navigation";
import { getMemory, getProjects, getStats } from "@/lib/db";
import MemoryActions from "./MemoryActions";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const memory = getMemory(id);
  if (!memory) return { title: "Memory Not Found — Second Brain" };
  return {
    title: `${memory.title} — Second Brain`,
    description: memory.content.slice(0, 150),
  };
}

function formatDate(dateStr: string) {
  try {
    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

// Formats content by splitting sections and formatting code blocks/lists
function renderFormattedContent(content: string) {
  // Split into lines or paragraphs
  const paragraphs = content.split(/\n\n+/);

  return paragraphs.map((para, pIdx) => {
    const trimmed = para.trim();
    if (!trimmed) return null;

    // Check for special section headers like "Problem:", "Solution:", "Verification:", etc.
    const sectionMatch = trimmed.match(
      /^(Problem|Root cause|Approach|Solution|Verification|Reusable learnings?|Pitfalls hit|Changed files):\s*([\s\S]*)$/i
    );

    if (sectionMatch) {
      const header = sectionMatch[1];
      const body = sectionMatch[2];

      const isSolution = /^solution/i.test(header);
      const isProblem = /^problem|^root cause/i.test(header);
      const isVerification = /^verification/i.test(header);
      const isLearning = /^reusable/i.test(header);

      let badgeColor = "var(--border)";
      let badgeTextColor = "var(--text)";
      if (isSolution) {
        badgeColor = "rgba(114, 214, 189, 0.15)";
        badgeTextColor = "var(--accent)";
      } else if (isProblem) {
        badgeColor = "rgba(255, 107, 107, 0.15)";
        badgeTextColor = "#ff8787";
      } else if (isVerification) {
        badgeColor = "rgba(139, 184, 255, 0.15)";
        badgeTextColor = "var(--blue)";
      } else if (isLearning) {
        badgeColor = "rgba(197, 167, 255, 0.15)";
        badgeTextColor = "#c5a7ff";
      }

      return (
        <div key={pIdx} className="memory-section-block">
          <div
            className="memory-section-badge"
            style={{ background: badgeColor, color: badgeTextColor }}
          >
            {header}
          </div>
          <div className="memory-section-content">
            {renderTextWithInlineCode(body)}
          </div>
        </div>
      );
    }

    // Standard paragraph or bullet list
    return (
      <div key={pIdx} className="memory-paragraph">
        {renderTextWithInlineCode(trimmed)}
      </div>
    );
  });
}

function renderTextWithInlineCode(text: string) {
  const lines = text.split("\n");
  return lines.map((line, lIdx) => {
    const isBullet = line.trim().startsWith("- ") || line.trim().startsWith("* ");
    const lineContent = isBullet ? line.trim().slice(2) : line;

    // Simple parser for inline code `...` and bold **...**
    const parts = lineContent.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);

    const renderedLine = parts.map((part, pIdx) => {
      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code key={pIdx} className="inline-code">
            {part.slice(1, -1)}
          </code>
        );
      }
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={pIdx}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });

    if (isBullet) {
      return (
        <div key={lIdx} className="memory-bullet-item">
          <span className="memory-bullet-dot">•</span>
          <span>{renderedLine}</span>
        </div>
      );
    }

    return (
      <p key={lIdx} style={{ margin: "5px 0" }}>
        {renderedLine}
      </p>
    );
  });
}

export default async function MemoryDetailPage({ params }: PageProps) {
  const { id } = await params;
  const memory = getMemory(id);

  if (!memory) {
    notFound();
  }

  const projects = getProjects();
  const stats = getStats();

  return (
    <main className="main">
      {/* Breadcrumb Navigation */}
      <nav className="memory-breadcrumb" aria-label="Breadcrumb">
        <Link href="/" className="breadcrumb-link">
          ← Dashboard
        </Link>
        <span className="breadcrumb-separator">/</span>
        <Link
          href={`/project/${encodeURIComponent(memory.project)}`}
          className="breadcrumb-link"
        >
          {memory.project}
        </Link>
        <span className="breadcrumb-separator">/</span>
        <span className="breadcrumb-current">Memory #{memory.id}</span>
      </nav>

      {/* Memory Header Card */}
      <div className="card memory-header-card">
        <div className="memory-header-eyebrow">
          <Link
            href={`/project/${encodeURIComponent(memory.project)}`}
            className="pill"
            style={{ fontWeight: 600 }}
          >
            {memory.project}
          </Link>
          <span className="memory-type-badge">{memory.type}</span>
          {memory.agent && (
            <span className="memory-agent-badge">
              <span>🤖</span> {memory.agent}
            </span>
          )}
          <span className="memory-date-badge">{formatDate(memory.created_at)}</span>
        </div>

        <h1 className="memory-page-title">{memory.title}</h1>

        {/* Action Toolbar */}
        <MemoryActions
          memory={memory}
          existingProjects={projects}
          suggestedTags={stats.tags}
        />
      </div>

      {/* Main Content Layout */}
      <div className="memory-content-grid">
        {/* Left: Full Memory Body */}
        <div className="card memory-body-card">
          <div className="card-title">
            <h2>Detailed Solution & Notes</h2>
            <span className="memory-id-badge">ID: {memory.id}</span>
          </div>

          <div className="memory-formatted-body">
            {renderFormattedContent(memory.content)}
          </div>
        </div>

        {/* Right Sidebar: Files, Tags, Relations, Commit */}
        <aside className="memory-sidebar">
          {/* Changed Files Card */}
          {memory.files && memory.files.length > 0 && (
            <div className="card">
              <div className="card-title">
                <h2>Associated Files</h2>
                <span>{memory.files.length}</span>
              </div>
              <div className="memory-files-list">
                {memory.files.map((file, idx) => (
                  <div key={idx} className="memory-file-item">
                    <span className="memory-file-icon">📄</span>
                    <code className="memory-file-path">{file}</code>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tags Card */}
          {memory.tags && memory.tags.length > 0 && (
            <div className="card">
              <div className="card-title">
                <h2>Knowledge Tags</h2>
                <span>{memory.tags.length}</span>
              </div>
              <div className="tag-list">
                {memory.tags.map((tag) => (
                  <span key={tag} className="tag">
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Relations Card */}
          {memory.relations && memory.relations.length > 0 && (
            <div className="card">
              <div className="card-title">
                <h2>Connected Relations</h2>
                <span>{memory.relations.length}</span>
              </div>
              <div className="memory-relations-list">
                {memory.relations.map((rel, idx) => {
                  const targetId =
                    rel.from_id === memory.id ? rel.to_id : rel.from_id;
                  const isOutgoing = rel.from_id === memory.id;
                  return (
                    <Link
                      key={idx}
                      href={`/memory/${targetId}`}
                      className="memory-relation-item"
                    >
                      <span className="relation-kind">
                        {isOutgoing ? "→" : "←"} {rel.kind}
                      </span>
                      <span className="relation-target">Memory #{targetId}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* Technical Metadata Card */}
          <div className="card">
            <div className="card-title">
              <h2>Metadata</h2>
            </div>
            <div className="metadata-table">
              <div className="metadata-row">
                <span className="metadata-label">Memory ID</span>
                <code className="metadata-val">{memory.id}</code>
              </div>
              {memory.git_commit && (
                <div className="metadata-row">
                  <span className="metadata-label">Git Commit</span>
                  <code className="metadata-val">{memory.git_commit.slice(0, 8)}</code>
                </div>
              )}
              {memory.agent && (
                <div className="metadata-row">
                  <span className="metadata-label">Captured By</span>
                  <span className="metadata-val">{memory.agent}</span>
                </div>
              )}
              <div className="metadata-row">
                <span className="metadata-label">Created At</span>
                <span className="metadata-val">
                  {new Date(memory.created_at).toLocaleDateString("id-ID")}
                </span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
