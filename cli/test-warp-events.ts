#!/usr/bin/env bun
/**
 * Test warp event flow without Atlas
 * 
 * Simulates what warp.ts does but without the Atlas tunnel,
 * to verify events flow correctly from ACP agent to handler.
 */

import { ACPAgent, type ACPAgentType } from "./agents/acp";
import type { StreamEvent } from "./agents/types";

const agentType = (process.argv[2] || "opencode") as ACPAgentType;
const prompt = process.argv.slice(3).join(" ") || "what is 2+2";

// Stats
let messageBuffer = "";
const eventCounts: Record<string, number> = {};

// Event handler - simulates what warp.ts does
const handleEvent = async (event: StreamEvent) => {
  eventCounts[event.type] = (eventCounts[event.type] || 0) + 1;
  
  console.log(`📡 Event: ${event.type}`);
  
  // Buffer message chunks
  if (event.type === "message" && (event.data as any).delta) {
    const content = String((event.data as any).content || "");
    messageBuffer += content;
    console.log(`   → Buffered: "${content.slice(0, 30)}..." (total: ${messageBuffer.length} chars)`);
  }
  
  // Log other event types
  if (event.type === "tool_call") {
    console.log(`   → Tool: ${(event.data as any).name} [${(event.data as any).status}]`);
  }
  if (event.type === "thinking") {
    console.log(`   → Thinking...`);
  }
};

async function main() {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`🧪 Testing warp event flow (no Atlas)`);
  console.log(`🤖 Agent: ${agentType}`);
  console.log(`📝 Prompt: "${prompt}"`);
  console.log(`${"─".repeat(60)}\n`);

  const agent = new ACPAgent(agentType);

  // Start agent
  await agent.start({
    cwd: process.cwd(),
    onEvent: handleEvent,
    onError: (error) => console.error(`❌ Error: ${error.message}`),
  });
  console.log(`✅ Agent started`);

  // Create session
  const sessionId = await agent.createSession();
  console.log(`📝 Session: ${sessionId.slice(0, 12)}...\n`);

  // Send prompt
  console.log(`📤 Sending prompt...\n`);
  const stopReason = await agent.prompt(prompt);
  
  // Results
  console.log(`\n${"─".repeat(60)}`);
  console.log(`✅ Prompt completed: ${stopReason}`);
  console.log(`\n📊 Event counts:`, eventCounts);
  console.log(`📝 Buffered message (${messageBuffer.length} chars):`);
  console.log(`   "${messageBuffer.trim().slice(0, 200)}..."`);
  
  // Cleanup
  await agent.stop();
}

main().catch(console.error);
