import { NextResponse } from "next/server";
import { getGraph } from "@/lib/db";

export function GET() {
  return NextResponse.json(getGraph());
}
