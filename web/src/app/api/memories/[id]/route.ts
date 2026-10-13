import { NextResponse } from "next/server";
import { getMemory, updateMemory, deleteMemory } from "@/lib/db";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const memory = getMemory(id);
  if (!memory) {
    return NextResponse.json({ error: "Memory not found" }, { status: 404 });
  }
  return NextResponse.json(memory);
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();

    const result = updateMemory({
      id,
      title: body.title !== undefined ? String(body.title).trim() : undefined,
      content: body.content !== undefined ? String(body.content).trim() : undefined,
      project: body.project !== undefined ? String(body.project).trim() : undefined,
      type: body.type !== undefined ? String(body.type).trim() : undefined,
      tags: Array.isArray(body.tags) ? body.tags : undefined,
      files: Array.isArray(body.files) ? body.files : undefined,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update memory";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const result = deleteMemory(id);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to delete memory";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
