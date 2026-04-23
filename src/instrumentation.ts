export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { loadAllSchedules } = await import("./lib/scheduler");
    loadAllSchedules();
    console.log("[HealthForge] Scheduler started via instrumentation hook.");
  }
}
