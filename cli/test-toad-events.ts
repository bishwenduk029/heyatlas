#!/usr/bin/env npx tsx
/**
 * Test script to verify toad event parsing in isolation.
 * Run: npx tsx test-toad-events.ts
 * Run with real toad: npx tsx test-toad-events.ts --real
 * 
 * Tests the ToadStreamHandler without Atlas WebSocket connection.
 */

import { spawn } from "child_process";
import { isStoredEvent } from "./agents/types";

const USE_REAL_TOAD = process.argv.includes("--real");

// Inline stream handler (same logic as toad.ts)
class ToadStreamHandler {
  private buffer = "";
  private messageBuffer = "";

  parse(chunk: string): Array<{ type: string; timestamp: number; data: Record<string, unknown> }> {
    this.buffer += chunk;
    const events: Array<{ type: string; timestamp: number; data: Record<string, unknown> }> = [];
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      
      try {
        const msg = JSON.parse(line);
        const event = this.convertACPMessage(msg);
        if (event) {
          events.push(event);
        }
      } catch {
        events.push({
          type: "raw",
          timestamp: Date.now(),
          data: { text: line },
        });
      }
    }

    return events;
  }

  flush() {
    const events: Array<{ type: string; timestamp: number; data: Record<string, unknown> }> = [];
    
    if (this.messageBuffer.trim()) {
      events.push({
        type: "message",
        timestamp: Date.now(),
        data: { role: "assistant", content: this.messageBuffer.trim() },
      });
      this.messageBuffer = "";
    }
    
    return events;
  }

  private convertACPMessage(msg: any) {
    if (msg.method === "session/update") {
      return this.convertSessionUpdate(msg.params?.update);
    }
    
    if (msg.error) {
      return {
        type: "status",
        timestamp: Date.now(),
        data: { text: `Error: ${msg.error.message}`, code: msg.error.code },
      };
    }
    
    // Log other message types for debugging
    if (msg.method || msg.result !== undefined) {
      return {
        type: "rpc",
        timestamp: Date.now(),
        data: { method: msg.method, id: msg.id, hasResult: msg.result !== undefined },
      };
    }
    
    return null;
  }

  private convertSessionUpdate(update: any) {
    if (!update) return null;
    
    const timestamp = Date.now();
    
    switch (update.sessionUpdate) {
      case "user_message_chunk": {
        const text = update.content?.text;
        if (text) {
          return { type: "message", timestamp, data: { role: "user", content: text } };
        }
        return null;
      }
      
      case "agent_message_chunk": {
        const text = update.content?.text;
        if (text) {
          this.messageBuffer += text;
          return { type: "status", timestamp, data: { text: this.messageBuffer, streaming: true } };
        }
        return null;
      }
      
      case "agent_thought_chunk": {
        const text = update.content?.text;
        if (text) {
          return { type: "thinking", timestamp, data: { text } };
        }
        return null;
      }
      
      case "tool_call": {
        return {
          type: "tool_call",
          timestamp,
          data: {
            toolCallId: update.toolCallId,
            toolName: update.title,
            kind: update.kind,
            status: update.status,
          },
        };
      }
      
      case "tool_call_update": {
        return {
          type: "tool_update",
          timestamp,
          data: {
            toolCallId: update.toolCallId,
            status: update.status,
            title: update.title,
          },
        };
      }
      
      case "plan": {
        return {
          type: "plan",
          timestamp,
          data: { entries: update.entries || [] },
        };
      }
      
      default:
        return null;
    }
  }
}

// Stats tracking
const stats = {
  stored: 0,
  broadcast: 0,
  byType: {} as Record<string, number>,
};

function logEvent(event: { type: string; timestamp: number; data: Record<string, unknown> }) {
  const isStored = isStoredEvent(event);
  const channel = isStored ? "📦 STORED" : "📡 BROADCAST";
  
  stats.byType[event.type] = (stats.byType[event.type] || 0) + 1;
  if (isStored) stats.stored++;
  else stats.broadcast++;
  
  // Truncate data for display
  const dataStr = JSON.stringify(event.data).slice(0, 100);
  console.log(`${channel} [${event.type}] ${dataStr}${dataStr.length >= 100 ? '...' : ''}`);
}

// Mock ACP messages that simulate toad's output
const MOCK_ACP_MESSAGES = [
  // Initialize response
  { jsonrpc: "2.0", id: "init-1", result: { protocolVersion: 1, agentCapabilities: {} } },
  // Session created
  { jsonrpc: "2.0", id: "session-1", result: { sessionId: "test-session-123" } },
  // User message echoed
  { jsonrpc: "2.0", method: "session/update", params: { update: { sessionUpdate: "user_message_chunk", content: { type: "text", text: "What is 2 + 2?" } } } },
  // Agent thinking
  { jsonrpc: "2.0", method: "session/update", params: { update: { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "Let me calculate this simple math problem..." } } } },
  // Tool call - calculator
  { jsonrpc: "2.0", method: "session/update", params: { update: { sessionUpdate: "tool_call", toolCallId: "tc-001", title: "calculator", kind: "execute", status: "pending" } } },
  // Tool call update - in progress
  { jsonrpc: "2.0", method: "session/update", params: { update: { sessionUpdate: "tool_call_update", toolCallId: "tc-001", status: "in_progress" } } },
  // Tool call update - completed
  { jsonrpc: "2.0", method: "session/update", params: { update: { sessionUpdate: "tool_call_update", toolCallId: "tc-001", status: "completed" } } },
  // Agent message chunk 1
  { jsonrpc: "2.0", method: "session/update", params: { update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "The answer is " } } } },
  // Agent message chunk 2
  { jsonrpc: "2.0", method: "session/update", params: { update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "4." } } } },
  // Plan update
  { jsonrpc: "2.0", method: "session/update", params: { update: { sessionUpdate: "plan", entries: [{ content: "Calculate 2+2", status: "completed", priority: "high" }] } } },
];

async function testWithMockData() {
  console.log("🧪 Testing toad event parsing with MOCK data\n");
  console.log("(Run with --real flag to test with actual toad)\n");
  
  const handler = new ToadStreamHandler();
  
  console.log("─".repeat(60));
  console.log("Simulated ACP Messages → StreamEvents:");
  console.log("─".repeat(60));
  
  for (const msg of MOCK_ACP_MESSAGES) {
    const line = JSON.stringify(msg) + "\n";
    const events = handler.parse(line);
    
    for (const event of events) {
      logEvent(event);
    }
  }
  
  // Flush remaining
  const remaining = handler.flush();
  for (const event of remaining) {
    logEvent(event);
  }
  
  printStats();
}

async function testWithRealToad() {
  console.log("🧪 Testing toad event parsing with REAL toad\n");
  
  // Check if toad is available
  const which = spawn("which", ["toad"]);
  const toadPath = await new Promise<string>((resolve) => {
    let out = "";
    which.stdout.on("data", (d) => out += d);
    which.on("close", (code) => resolve(code === 0 ? out.trim() : ""));
  });
  
  if (!toadPath) {
    console.error("❌ toad not found in PATH.");
    console.error("   Install toad or run without --real flag for mock test.");
    process.exit(1);
  }
  console.log(`✅ Found toad at: ${toadPath}\n`);
  
  const handler = new ToadStreamHandler();
  const task = "What is 2 + 2? Reply with just the number.";
  
  console.log(`📝 Task: "${task}"\n`);
  console.log("─".repeat(60));
  console.log("Events:");
  console.log("─".repeat(60));
  
  const proc = spawn("toad", ["--headless", "--prompt", task], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  
  proc.stdout.on("data", (chunk) => {
    const events = handler.parse(chunk.toString());
    for (const event of events) {
      logEvent(event);
    }
  });
  
  proc.stderr.on("data", (chunk) => {
    console.log(`⚠️ stderr: ${chunk.toString().trim()}`);
  });
  
  await new Promise<void>((resolve) => {
    proc.on("close", (code) => {
      const remaining = handler.flush();
      for (const event of remaining) {
        logEvent(event);
      }
      
      console.log("─".repeat(60));
      console.log(`\n✅ toad exited with code ${code}`);
      printStats();
      resolve();
    });
  });
}

function printStats() {
  console.log("\n📊 Event Statistics:");
  console.log(`   Stored events (→ task.context): ${stats.stored}`);
  console.log(`   Broadcast events (→ UI only):   ${stats.broadcast}`);
  console.log(`   By type:`, stats.byType);
  
  console.log("\n📋 Event Routing Summary:");
  console.log("   STORED (persistent): message, completion");
  console.log("   BROADCAST (ephemeral): tool_call, tool_update, thinking, plan, status, rpc");
}

if (USE_REAL_TOAD) {
  testWithRealToad().catch(console.error);
} else {
  testWithMockData().catch(console.error);
}
