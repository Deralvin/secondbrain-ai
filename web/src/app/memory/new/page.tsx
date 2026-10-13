import Link from "next/link";
import { getProjects, getStats } from "@/lib/db";
import NewMemoryForm from "./NewMemoryForm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Capture New Memory — Second Brain",
  description: "Capture solutions, bug fixes, and engineering decisions directly into your second brain.",
};

interface PageProps {
  searchParams: Promise<{ project?: string }>;
}

export default async function NewMemoryPage({ searchParams }: PageProps) {
  const { project } = await searchParams;
  const projects = getProjects();
  const stats = getStats();

  return (
    <main className="main">
      <nav className="memory-breadcrumb" aria-label="Breadcrumb">
        <Link href="/" className="breadcrumb-link">
          ← Dashboard
        </Link>
        <span className="breadcrumb-separator">/</span>
        <span className="breadcrumb-current">New Memory</span>
      </nav>

      <div className="page-heading">
        <div className="eyebrow">Knowledge Capture</div>
        <h1>Record New Memory</h1>
        <p className="lead">
          Catat solusi masalah, pola arsitektur, atau keputusan teknis ke dalam Second Brain
          agar bisa diakses kembali oleh seluruh AI agent dan project lain.
        </p>
      </div>

      <NewMemoryForm
        existingProjects={projects}
        suggestedTags={stats.tags}
        initialProject={project || ""}
      />
    </main>
  );
}
