"use client";

import useAgentToken from "@/hooks/useAgentToken";
import { InterfaceWithAgent } from "./interface-with-agent";

interface InterfaceProps {
  userId?: string;
  mode?: "local" | "sandbox";
}

export function Interface({ userId, mode = "local" }: InterfaceProps) {
  const { token: agentToken, userId: tokenUserId } = useAgentToken();

  // Show loading while fetching token
  if (!agentToken) {
    return (
      <main className="h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </main>
    );
  }

  // Once token is available, render the full interface with agent connection
  return (
    <InterfaceWithAgent
      userId={userId || tokenUserId || "user"}
      token={agentToken}
      mode={mode}
    />
  );
}
