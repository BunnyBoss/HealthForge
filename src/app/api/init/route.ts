import { NextResponse } from "next/server";
import { loadAllSchedules } from "@/lib/scheduler";

let initialized = false;

// This route bootstraps the scheduler the first time any API is called.
// Called from the Next.js instrumentation hook.
export async function GET() {
  if (!initialized) {
    initialized = true;
    loadAllSchedules();
    return NextResponse.json({ message: "Scheduler initialized." });
  }
  return NextResponse.json({ message: "Already running." });
}
