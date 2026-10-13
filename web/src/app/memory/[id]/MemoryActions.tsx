"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { MemoryDetail } from "@/lib/db";
import CopyButton from "./CopyButton";

interface MemoryActionsProps {
  memory: MemoryDetail;
  existingProjects: { id: number; name: string }[];
  suggestedTags: { name: string; count: number }[];
}

export default function MemoryActions({
  memory,
  existingProjects,
  suggestedTags,
}: MemoryActionsProps) {
  const router = useRouter();

  // Modal State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  // Edit Form State
  const [title, setTitle] = useState(memory.title);
  const [project, setProject] = useState(memory.project);
  const [type, setType] = useState(memory.type);
  const [content, setContent] = useState(memory.content);
  const [tags, setTags] = useState<string[]>(memory.tags || []);
  const [tagInput, setTagInput] = useState("");
  const [filesInput, setFilesInput] = useState((memory.files || []).join("\n"));
  const [activeTab, setActiveTab] = useState<"edit" | "preview">("edit");

  // Status State
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Tag Operations
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

  // Save / Update Handler
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!title.trim() || !project.trim() || !content.trim()) {
      setErrorMsg("Title, project, and content are required.");
      return;
    }

    setIsSaving(true);

    try {
      const files = filesInput
        .split("\n")
        .map((f) => f.trim())
        .filter(Boolean);

      const res = await fetch(`/api/memories/${memory.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          project: project.trim(),
          type,
          content: content.trim(),
          tags,
          files,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update memory");
      }

      setIsEditOpen(false);
      router.refresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Error updating memory");
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Handler
  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/memories/${memory.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete memory");
      }

      // Navigate back to project page or dashboard
      router.push(`/project/${encodeURIComponent(memory.project)}`);
      router.refresh();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error deleting memory");
      setIsDeleting(false);
      setIsDeleteOpen(false);
    }
  };

  return (
    <>
      <div className="memory-toolbar">
        <CopyButton
          text={memory.content}
          label="Copy Solution"
          className="button button-primary"
        />

        <button
          type="button"
          className="button"
          onClick={() => {
            setErrorMsg(null);
            setIsEditOpen(true);
          }}
          title="Edit memory title, content, or tags"
        >
          ✏️ Edit
        </button>

        <Link
          href={`/project/${encodeURIComponent(memory.project)}`}
          className="button"
        >
          📂 View Project
        </Link>

        <Link href="/graph" className="button">
          🌐 View in 3D Graph ↗
        </Link>

        <button
          type="button"
          className="button button-danger"
          onClick={() => setIsDeleteOpen(true)}
          title="Delete this memory"
          style={{ marginLeft: "auto" }}
        >
          🗑️ Delete
        </button>
      </div>

      {/* Edit Modal */}
      {isEditOpen && (
        <div className="modal-backdrop" onClick={() => setIsEditOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Memory #{memory.id}</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setIsEditOpen(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdate} className="modal-body">
              {errorMsg && (
                <div className="form-alert form-alert-error">
                  <span>⚠️</span>
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Title */}
              <div className="form-group">
                <label className="form-label">Title</label>
                <input
                  type="text"
                  className="form-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              {/* Project & Type Row */}
              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label">Project</label>
                  <input
                    type="text"
                    list="edit-project-suggestions"
                    className="form-input"
                    value={project}
                    onChange={(e) => setProject(e.target.value)}
                    required
                  />
                  <datalist id="edit-project-suggestions">
                    {existingProjects.map((p) => (
                      <option key={p.id} value={p.name} />
                    ))}
                  </datalist>
                </div>

                <div className="form-group">
                  <label className="form-label">Type</label>
                  <select
                    className="form-input"
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                  >
                    <option value="bug_fix">Bug Fix</option>
                    <option value="feature">Feature</option>
                    <option value="arch">Architecture</option>
                    <option value="note">Note</option>
                    <option value="work_session">Session</option>
                  </select>
                </div>
              </div>

              {/* Tags */}
              <div className="form-group">
                <label className="form-label">Tags</label>
                <div className="tag-input-wrapper">
                  <input
                    type="text"
                    className="form-input"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleTagKeyDown}
                    placeholder="Ketik tag lalu Enter..."
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
                {tags.length > 0 && (
                  <div className="tag-chips-container" style={{ marginTop: 8 }}>
                    {tags.map((t) => (
                      <span key={t} className="tag-chip-removable">
                        #{t}
                        <button
                          type="button"
                          className="tag-chip-remove-btn"
                          onClick={() => removeTag(t)}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {suggestedTags.length > 0 && (
                  <div className="suggested-tags-box" style={{ marginTop: 6 }}>
                    <div className="tag-list">
                      {suggestedTags.slice(0, 6).map((st) => (
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

              {/* Content & Markdown Preview */}
              <div className="form-group">
                <div className="form-label-row">
                  <label className="form-label">Content</label>
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

                {activeTab === "edit" ? (
                  <textarea
                    className="form-textarea"
                    rows={10}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    required
                  />
                ) : (
                  <div className="form-preview-box" style={{ minHeight: 200 }}>
                    <pre className="preview-content">{content}</pre>
                  </div>
                )}
              </div>

              {/* Files */}
              <div className="form-group">
                <label className="form-label">
                  Files Changed <span className="optional">(1 file per baris)</span>
                </label>
                <textarea
                  className="form-textarea"
                  rows={2}
                  value={filesInput}
                  onChange={(e) => setFilesInput(e.target.value)}
                />
              </div>

              {/* Modal Actions */}
              <div className="modal-actions">
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={isSaving}
                >
                  {isSaving ? "Saving..." : "💾 Save Changes"}
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={() => setIsEditOpen(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteOpen && (
        <div className="modal-backdrop" onClick={() => setIsDeleteOpen(false)}>
          <div
            className="modal-card"
            style={{ maxWidth: 460 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 style={{ color: "#ff8787" }}>🗑️ Delete Memory?</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setIsDeleteOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <p style={{ margin: "0 0 14px", color: "#c4d1de", lineHeight: 1.6 }}>
                Apakah Anda yakin ingin menghapus memori{" "}
                <strong>&quot;{memory.title}&quot;</strong>?
              </p>
              <div className="form-alert form-alert-error" style={{ marginBottom: 16 }}>
                <span>⚠️</span>
                <span>
                  Tindakan ini permanen. Seluruh keterhubungan di tabel relasi juga akan dibersihkan.
                </span>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="button button-danger"
                  onClick={handleDelete}
                  disabled={isDeleting}
                >
                  {isDeleting ? "Deleting..." : "Ya, Hapus Memori"}
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={() => setIsDeleteOpen(false)}
                  disabled={isDeleting}
                >
                  Batal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
