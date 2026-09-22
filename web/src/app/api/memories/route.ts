import { NextResponse } from "next/server";
import { getMemories } from "@/lib/db";

export function GET(request: Request) {
  const url = new URL(request.url);
  return NextResponse.json(getMemories({
    query: url.searchParams.get("q") ?? undefined,
    project: url.searchParams.get("project") ?? undefined,
    limit: Number(url.searchParams.get("limit") ?? 100),
  }));
}
