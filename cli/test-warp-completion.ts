#!/usr/bin/env bun
/**
 * Test warp completion flow - simulates what warp.ts does after prompt completes
 */

import { ACPAgent, type ACPAgentType } from "./agents/acp";
import type { StreamEvent } from "./agents/types";

const agentType = (process.argv[2] || "opencode") as ACPAgentType;
const prompt = "what is 2+2";

let messageBuffer = "";

function handleEvent(event: StreamEvent) {
  console.log(`[EVENT] ${event.type}:`, JSON.stringify(event.data).slice(0, 100));
  
  // Simulate warp.ts message handling
  if (event.type === "message") {
    const content = String(event.data.content || "");
    if (event.data.delta) {
      messageBuffer += content;
      console.log(`  → Buffer (delta): "${messageBuffer.slice(0, 50)}..."`);
    } else {
      messageBuffer = content;
      console.log(`  → Buffer (complete): "${messageBuffer.slice(0, 50)}..."`);
    }
  }
}

async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Testing warp completion flow`);
  console.log(`${"=".repeat(60)}\n`);

  const agent = new ACPAgent(agentType);

  // Start agent
  await agent.start({
    cwd: process.cwd(),
    onEvent: handleEvent,
    onError: (error) => console.error(`Error: ${error.message}`),
  });
  console.log(`✅ Agent started`);

  // Create session
  const sessionId = await agent.createSession();
  console.log(`✅ Session created: ${sessionId}`);

  // Send prompt
  console.log(`\n📤 Sending prompt: "${prompt}"`);
  console.log(`${"─".repeat(40)}`);
  
  try {
    const stopReason = await agent.prompt(prompt);
    
    // This is what happens AFTER prompt returns in warp.ts
    console.log(`${"─".repeat(40)}`);
    console.log(`\n✅ Prompt returned!`);
    console.log(`   stopReason: ${stopReason}`);
    console.log(`   messageBuffer: "${messageBuffer}"`);
    console.log(`   messageBuffer.length: ${messageBuffer.length}`);
    
    // Simulate tunnel.updateTask
    console.log(`\n🔄 Simulating tunnel.updateTask({ state: "completed" })`);
    console.log(`   This is where warp.ts would call tunnel.updateTask()`);
    
    // Check if we have content to store
    if (messageBuffer.trim().length > 0) {
      console.log(`   Would store message: "${messageBuffer.trim().slice(0, 100)}..."`);
    } else {
      console.log(`   ⚠️  No message content to store!`);
    }
    
  } catch (error) {
    console.error(`\n❌ Prompt failed:`, error);
  }

  await agent.stop();
  console.log(`\n👋 Done\n`);
}

main().catch(console.error);
