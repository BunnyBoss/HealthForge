import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import getDb from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { api_url, api_key } = await req.json();

    if (!api_url) {
      return NextResponse.json({ error: "API URL is required" }, { status: 400 });
    }

    // Map localhost to host.docker.internal ONLY if running inside Docker
    let finalApiUrl = api_url;
    if (process.env.DOCKER_CONTAINER === "true" && finalApiUrl.includes("://localhost")) {
      finalApiUrl = finalApiUrl.replace("://localhost", "://host.docker.internal");
    }
    
    let testApiKey = api_key;

    // If no api_key was provided in the request, try to fetch the stored one
    if (!testApiKey || testApiKey.trim() === "") {
      const db = getDb();
      const existing = db
        .prepare("SELECT api_key FROM user_settings WHERE user_id = ?")
        .get(session.user.id) as { api_key?: string | null } | undefined;

      if (existing?.api_key) {
        testApiKey = existing.api_key;
      }
    }

    if (!testApiKey || testApiKey.trim() === "") {
      testApiKey = process.env.LITELLM_API_KEY || "";
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (testApiKey && testApiKey.trim() !== "") {
      headers["Authorization"] = `Bearer ${testApiKey.trim()}`;
    }

    const res = await fetch(`${finalApiUrl}/v1/models`, {
      method: "GET",
      headers,
    });

    if (res.ok) {
      const data = await res.json();
      const modelCount = data.data?.length || 0;
      const modelNames = data.data?.slice(0, 5).map((m: { id?: string }) => m.id).join(", ") || "none";
      return NextResponse.json({
        success: true,
        message: `✅ Connected! Found ${modelCount} models: ${modelNames}${modelCount > 5 ? "..." : ""}`
      });
    } else {
      return NextResponse.json({
        success: false,
        message: `❌ Connection failed: ${res.status} ${res.statusText}`
      });
    }
  } catch {
    return NextResponse.json({
      success: false,
      message: `❌ Cannot reach API. Make sure LiteLLM proxy or endpoint is running.`
    });
  }
}
