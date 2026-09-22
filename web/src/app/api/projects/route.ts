import { NextResponse } from "next/server";
import { getProjects } from "@/lib/db";

export function GET() {
  return NextResponse.json(getProjects());
}
