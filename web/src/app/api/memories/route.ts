import { NextResponse } from "next/server";
import { getMemories, createMemory } from "@/lib/db";

export function GET(request: Request) {
  const url = new URL(request.url);
  return NextResponse.json(getMemories({
    query: url.searchParams.get("q") ?? undefined,
    project: url.searchParams.get("project") ?? undefined,
    limit: Number(url.searchParams.get("limit") ?? 100),
  }));
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.title?.trim() || !body.content?.trim() || !body.project?.trim()) {
      return NextResponse.json(
        { error: "Title, content, and project are required fields" },
        { status: 400 }
      );
    }
    const result = createMemory({
      title: body.title.trim(),
      content: body.content.trim(),
      project: body.project.trim(),
      type: body.type?.trim() || "note",
      tags: Array.isArray(body.tags) ? body.tags : [],
      files: Array.isArray(body.files) ? body.files : [],
      agent: body.agent?.trim() || "web-ui",
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create memory";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
