"use server";

import { db } from "@/database";
import { mcpConfigs } from "@/database/schema";
import { auth } from "@/lib/auth/server";
import { headers } from "next/headers";
import { eq, and } from "drizzle-orm";

export async function saveAgentConfig(agentType: string, config: string) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  const userId = session.user.id;

  // Check if config exists
  const existing = await db.query.mcpConfigs.findFirst({
    where: and(
      eq(mcpConfigs.userId, userId),
      eq(mcpConfigs.agentType, agentType)
    ),
  });

  if (existing) {
    await db
      .update(mcpConfigs)
      .set({ config, updatedAt: new Date() })
      .where(eq(mcpConfigs.id, existing.id));
  } else {
    await db.insert(mcpConfigs).values({
      userId,
      agentType,
      config,
    });
  }

  return { success: true };
}

export async function getAgentConfig(agentType: string) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return null;
  }

  const userId = session.user.id;

  const config = await db.query.mcpConfigs.findFirst({
    where: and(
      eq(mcpConfigs.userId, userId),
      eq(mcpConfigs.agentType, agentType)
    ),
  });

  return config?.config || null;
}
