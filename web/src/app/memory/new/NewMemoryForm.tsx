"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface NewMemoryFormProps {
  existingProjects: { id: number; name: string }[];
  suggestedTags: { name: string; count: number }[];
  initialProject?: string;
}

const TEMPLATE_BUGFIX = `Problem: 

Root cause: 

Solution: 

Verification: 

Reusable learning: `;

const TEMPLATE_FEATURE = `Problem / Goal: 

Approach: 

Verification: 

Changed files: `;

export default function NewMemoryForm({
  existingProjects,
  suggestedTags,
  initialProject = "",
}: NewMemoryFormProps) {
  const router = useRouter();

  // Form State
  const [title, setTitle] = useState("");
  const [project, setProject] = useState(initialProject);
  const [type, setType] = useState("bug_fix");
  const [agent, setAgent] = useState("web-ui");
  const [content, setContent] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [filesInput, setFilesInput] = useState("");
  const [activeTab, setActiveTab] = useState<"edit" | "preview">("edit");

  // UI State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Tag Management
  const addTag = (tagToAdd: string) => {
    const cleaned = tagToAdd.trim().replace(/^#/, "").toLowerCase();
    if (cleaned && !tags.includes(cleaned)) {
      setTags([...tags, cleaned]);
    }
    setTagInput("");
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagInput);
    }
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!title.trim()) {
      setErrorMsg("Title is required.");
      return;
    }
    if (!project.trim()) {
      setErrorMsg("Project is required.");
      return;
    }
    if (!content.trim()) {
      setErrorMsg("Content/solution is required.");
      return;
    }

    setIsSubmitting(true);

    try {
      // Parse files line by line
      const files = filesInput
        .split("\n")
        .map((f) => f.trim())
        .filter(Boolean);

      const res = await fetch("/api/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          project: project.trim(),
          type,
          agent: agent.trim() || "web-ui",
          content: content.trim(),
          tags,
          files,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create memory");
      }

      // Success: redirect to newly created memory
      router.push(`/memory/${data.id}`);
      router.refresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "An unexpected error occurred");
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="memory-form-container">
      {errorMsg && (
        <div className="form-alert form-alert-error" role="alert">
          <span>⚠️</span>
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Security Redaction Banner */}
      <div className="form-security-banner">
        <span>🔒</span>
        <span>
          <strong>Secret Redaction Active:</strong> API keys, private tokens, passwords, dan
          kredensial sensitif akan disensor otomatis menjadi <code>[REDACTED]</code> saat disimpan.
        </span>
      </div>

      <div className="form-grid">
        {/* Left Column: Core Fields */}
        <div className="form-main-col">
          {/* Title */}
          <div className="form-group">
            <label htmlFor="memory-title" className="form-label">
              Title <span className="required">*</span>
            </label>
            <input
              id="memory-title"
              type="text"
              className="form-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Fix Transporter error 90068 (MinimumOSVersion too low)"
              required
            />
          </div>

          {/* Content with Markdown Tabs & Templates */}
          <div className="form-group">
            <div className="form-label-row">
              <label htmlFor="memory-content" className="form-label">
                Content & Solution <span className="required">*</span>
              </label>

              <div className="form-tab-group">
                <button
                  type="button"
                  className={`form-tab-btn ${activeTab === "edit" ? "active" : ""}`}
                  onClick={() => setActiveTab("edit")}
                >
                  ✏️ Edit
                </button>
                <button
                  type="button"
                  className={`form-tab-btn ${activeTab === "preview" ? "active" : ""}`}
                  onClick={() => setActiveTab("preview")}
                >
                  👁️ Preview
                </button>
              </div>
            </div>

            {/* Template Buttons */}
            {activeTab === "edit" && (
              <div className="template-pills">
                <span className="template-label">Templates:</span>
                <button
                  type="button"
                  className="template-btn"
                  onClick={() => setContent(TEMPLATE_BUGFIX)}
                >
                  + Bugfix Format
                </button>
                <button
                  type="button"
                  className="template-btn"
                  onClick={() => setContent(TEMPLATE_FEATURE)}
                >
                  + Feature Format
                </button>
                <button
                  type="button"
                  className="template-btn"
                  onClick={() => setContent("")}
                >
                  Clear
                </button>
              </div>
            )}

            {activeTab === "edit" ? (
              <textarea
                id="memory-content"
                className="form-textarea"
                rows={14}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Problem: Jelaskan masalah apa yang dihadapi...&#10;&#10;Root cause: Apa penyebab utamanya...&#10;&#10;Solution: Bagaimana langkah mengatasinya...&#10;&#10;Verification: Bukti pengujian berhasil...&#10;&#10;Reusable learning: Pelajaran yang berguna untuk project lain..."
                required
              />
            ) : (
              <div className="form-preview-box">
                {content.trim() ? (
                  <pre className="preview-content">{content}</pre>
                ) : (
                  <p className="empty">Belum ada konten untuk dipratinjau.</p>
                )}
              </div>
            )}
          </div>

          {/* Files Changed */}
          <div className="form-group">
            <label htmlFor="memory-files" className="form-label">
              Associated / Changed Files <span className="optional">(opsional, 1 file per baris)</span>
            </label>
            <textarea
              id="memory-files"
              className="form-textarea"
              rows={3}
              value={filesInput}
              onChange={(e) => setFilesInput(e.target.value)}
              placeholder="ios/Runner/AppFrameworkInfo.plist&#10;ios/Podfile&#10;src/hooks/use-rpc.ts"
            />
          </div>
        </div>

        {/* Right Column: Metadata & Categorization */}
        <aside className="form-side-col">
          {/* Project Input with Datalist */}
          <div className="form-group">
            <label htmlFor="memory-project" className="form-label">
              Project <span className="required">*</span>
            </label>
            <input
              id="memory-project"
              type="text"
              list="project-suggestions"
              className="form-input"
              value={project}
              onChange={(e) => setProject(e.target.value)}
              placeholder="Pilih atau ketik nama project..."
              required
            />
            <datalist id="project-suggestions">
              {existingProjects.map((p) => (
                <option key={p.id} value={p.name} />
              ))}
            </datalist>
            <div className="form-help">Pilih project yang ada atau ketik project baru.</div>
          </div>

          {/* Memory Type */}
          <div className="form-group">
            <label className="form-label">Type</label>
            <div className="type-pill-selector">
              {[
                { id: "bug_fix", label: "Bug Fix" },
                { id: "feature", label: "Feature" },
                { id: "arch", label: "Architecture" },
                { id: "note", label: "Note" },
                { id: "work_session", label: "Session" },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`type-pill ${type === t.id ? "active" : ""}`}
                  onClick={() => setType(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Agent */}
          <div className="form-group">
            <label htmlFor="memory-agent" className="form-label">
              Agent / Author
            </label>
            <input
              id="memory-agent"
              type="text"
              className="form-input"
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
              placeholder="web-ui, hermes, claude, manual..."
            />
          </div>

          {/* Tags */}
          <div className="form-group">
            <label htmlFor="memory-tags" className="form-label">
              Knowledge Tags
            </label>
            <div className="tag-input-wrapper">
              <input
                id="memory-tags"
                type="text"
                className="form-input"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder="Ketik tag lalu tekan Enter..."
              />
              <button
                type="button"
                className="button"
                onClick={() => addTag(tagInput)}
                disabled={!tagInput.trim()}
              >
                + Add
              </button>
            </div>

            {/* Selected Tags */}
            {tags.length > 0 && (
              <div className="tag-chips-container">
                {tags.map((tag) => (
                  <span key={tag} className="tag-chip-removable">
                    #{tag}
                    <button
                      type="button"
                      className="tag-chip-remove-btn"
                      onClick={() => removeTag(tag)}
                      title={`Remove tag ${tag}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Popular Tag Suggestions */}
            {suggestedTags.length > 0 && (
              <div className="suggested-tags-box">
                <span className="suggested-tags-label">Popular tags:</span>
                <div className="tag-list">
                  {suggestedTags.slice(0, 8).map((st) => (
                    <button
                      key={st.name}
                      type="button"
                      className={`tag-suggestion-chip ${tags.includes(st.name) ? "selected" : ""}`}
                      onClick={() =>
                        tags.includes(st.name) ? removeTag(st.name) : addTag(st.name)
                      }
                    >
                      #{st.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="form-actions-card">
            <button
              type="submit"
              className="button button-primary"
              style={{ width: "100%", justifyContent: "center" }}
              disabled={isSubmitting}
            >
              {isSubmitting ? "💾 Saving Memory..." : "✦ Save Memory"}
            </button>
            <Link
              href="/"
              className="button"
              style={{ width: "100%", justifyContent: "center" }}
            >
              Cancel
            </Link>
          </div>
        </aside>
      </div>
    </form>
  );
}
