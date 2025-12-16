import { NextResponse } from "next/server";
import { db } from "@/database";
import * as tables from "@/database/tables";
import { and, eq } from "drizzle-orm";
import { generateGooseConfig, generateOpenCodeConfig, UnifiedMcpConfig } from "@/lib/mcp-adapters";

export async function GET(request: Request) {
  try {
    // 1. Security Check
    const authHeader = request.headers.get("Authorization");
    // Expecting "Bearer <NIRMANUS_API_KEY>"
    const expectedKey = process.env.NIRMANUS_API_KEY;

    if (!authHeader || !authHeader.startsWith("Bearer ") || authHeader.split(" ")[1] !== expectedKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Get User ID and Agent Type from Query Params
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const agentType = searchParams.get("agentType");

    if (!userId || !agentType) {
      return NextResponse.json({ error: "Missing userId or agentType parameter" }, { status: 400 });
    }

    // 3. Fetch "Universal" Configuration
    // We store the source of truth under agentType="universal"
    const configRecord = await db.query.mcpConfigs.findFirst({
      where: and(
        eq(tables.mcpConfigs.userId, userId),
        eq(tables.mcpConfigs.agentType, "universal")
      ),
      columns: { config: true },
    });

    if (!configRecord) {
      // If no config found, return null so provider can handle fallback or error
      return NextResponse.json({ config: null });
    }

    let resultConfig = "";
    try {
        const unifiedConfig = JSON.parse(configRecord.config) as UnifiedMcpConfig;

        if (agentType === "goose") {
            resultConfig = generateGooseConfig(unifiedConfig);
        } else if (agentType === "opencode") {
            resultConfig = generateOpenCodeConfig(unifiedConfig);
        } else {
            // If requesting raw universal or unknown type, just return raw JSON
            resultConfig = configRecord.config;
        }
    } catch (e) {
        console.error("Error parsing/transforming config:", e);
        return NextResponse.json({ error: "Invalid Configuration Format" }, { status: 500 });
    }

    return NextResponse.json({ config: resultConfig });
  } catch (error) {
    console.error("Error fetching agent config:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
