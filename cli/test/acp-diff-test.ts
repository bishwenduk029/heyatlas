/**
 * Unit test for ACP provider diff event handling
 *
 * KEY FINDINGS:
 * - ACP provider emits `tool-output-available` events with tool outputs
 * - The tool outputs may contain unified diff format (diff --git, @@ -, +++, ---)
 * - The web frontend's ToolOutput component does NOT render diffs specially
 * - It just shows the output as text/JSON without diff visualization
 *
 * TO SHOW DIFFS PROPERLY, YOU NEED TO:
 * 1. Detect diff content in tool outputs (look for diff --git, @@ -, etc.)
 * 2. Parse the diff using a library like `diff` package or custom parser
 * 3. Render with a diff viewer like @git-diff-view/react (used by vibe-kanban)
 */

import { createACPProvider } from "@mcpc-tech/acp-ai-provider";
import { streamText } from "ai";
import { writeFile, unlink, readFile } from "fs/promises";
import { join } from "path";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { execSync } from "child_process";

// Create a temporary directory for testing
const testDir = mkdtempSync(join(tmpdir(), "acp-diff-test-"));

/**
 * Check if a string contains unified diff format
 */
function containsDiffFormat(content: string): boolean {
  return (
    content.includes("diff --git") ||
    content.includes("Index:") ||  // OpenCode uses this format
    content.includes("@@ -") ||
    content.includes("+++ ") ||
    content.includes("--- ") ||
    (content.includes("--- a/") && content.includes("+++ b/"))
  );
}

/**
 * Parse unified diff content into structured format
 */
export interface DiffFile {
  path: string;
  hunks: DiffHunk[];
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface DiffLine {
  type: "context" | "added" | "removed";
  content: string;
}

function parseUnifiedDiff(diffText: string): DiffFile[] {
  const files: DiffFile[] = [];
  const lines = diffText.split("\n");
  let currentFile: DiffFile | null = null;
  let currentHunk: DiffHunk | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // New file header
    if (line.startsWith("diff --git ")) {
      if (currentFile) files.push(currentFile);
      currentFile = { path: "", hunks: [] };
      currentHunk = null;
    }
    // File path (after "a/" or "b/")
    else if (line.startsWith("--- ") || line.startsWith("+++ ")) {
      if (currentFile && !currentFile.path) {
        const match = line.match(/^... (?:a\/)?(.+)$/);
        if (match) currentFile.path = match[1];
      }
    }
    // Hunk header
    else if (line.startsWith("@@ -")) {
      if (currentFile) {
        const match = line.match(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
        if (match) {
          currentHunk = {
            oldStart: parseInt(match[1]) || 1,
            oldLines: parseInt(match[2]) || 1,
            newStart: parseInt(match[3]) || 1,
            newLines: parseInt(match[4]) || 1,
            lines: [],
          };
          currentFile.hunks.push(currentHunk);
        }
      }
    }
    // Hunk content
    else if (currentHunk && line.length > 0) {
      if (line.startsWith("+")) {
        currentHunk.lines.push({ type: "added", content: line.slice(1) });
      } else if (line.startsWith("-")) {
        currentHunk.lines.push({ type: "removed", content: line.slice(1) });
      } else if (line.startsWith(" ")) {
        currentHunk.lines.push({ type: "context", content: line.slice(1) });
      }
    }
  }

  if (currentFile) files.push(currentFile);
  return files;
}

async function runDiffTest() {
  console.log("=== ACP Provider Diff Event Test ===\n");
  console.log(`Test directory: ${testDir}\n`);

  // Create a test HTML file
  const testFile = join(testDir, "test.html");
  const originalContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Test Page</title>
</head>
<body>
    <h1>Hello World</h1>
    <p>This is a test file for diff detection.</p>
</body>
</html>`;

  await writeFile(testFile, originalContent);
  console.log("Created test.html with original content\n");

  // Find available ACP agent (in order of preference)
  const agents = [
    { name: "goose", command: "goose", args: ["acp"] },  // Test goose first
    { name: "opencode", command: "opencode", args: ["acp"] },
    { name: "claude-code-acp", command: "claude-code-acp", args: [] },
  ];
  
  let selectedAgent = agents[0];
  
  for (const agent of agents) {
    try {
      execSync(`which ${agent.command}`, { stdio: "ignore" });
      selectedAgent = agent;
      break;
    } catch {
      // Try next agent
    }
  }

  try {
    execSync(`which ${selectedAgent.command}`, { stdio: "ignore" });
  } catch {
    console.log(`No ACP agent available (tried: ${agents.map(a => a.name).join(", ")})`);
    console.log("This test requires an ACP-compatible agent to be installed.\n");
    return { diffEvents: [], testPassed: false, reason: "No ACP agent available" };
  }

  console.log(`Using agent: ${selectedAgent.name} (${selectedAgent.command} ${selectedAgent.args.join(" ")})\n`);

  const provider = createACPProvider({
    command: selectedAgent.command,
    args: selectedAgent.args,
    session: {
      cwd: testDir,
      mcpServers: [],
    },
    persistSession: false,
  });

  await provider.initSession();
  console.log("ACP provider initialized\n");

  const events: Array<{
    type: string;
    hasDiff: boolean;
    diffContent?: string;
  }> = [];

  // Prompt the agent - simple task
  const prompt = `Please modify ${testFile}:
1. Change the title to "Modified Test Page"
2. Add a new paragraph: <p>This is a new paragraph added for testing.</p>
Just make the changes directly without explaining.`;

  console.log(`Prompting ${selectedAgent.name} to modify the file...`);
  console.log(`Prompt: ${prompt}\n`);

  try {
    const result = streamText({
      model: provider.languageModel(),
      prompt,
      tools: provider.tools as Parameters<typeof streamText>[0]["tools"],
      includeRawChunks: true,
    });

    let chunkCount = 0;
    for await (const chunk of result.toUIMessageStream()) {
      chunkCount++;
      
      const event = { type: chunk.type, hasDiff: false };
      
      // Log ALL events for debugging
      console.log(`\n${"=".repeat(60)}`);
      console.log(`EVENT #${chunkCount}: ${chunk.type}`);
      console.log(`${"=".repeat(60)}`);
      
      // Safely stringify any object
      const safeStringify = (obj: unknown): string => {
        try {
          return JSON.stringify(obj, (key, value) => {
            if (typeof value === 'function' || typeof value === 'undefined') {
              return '[Function/Undefined]';
            }
            return value;
          }, 2);
        } catch {
          return String(obj);
        }
      };
      
      console.log(safeStringify(chunk));
      
      if (chunk.type === "tool-output-available") {
        const output = (chunk as { output?: unknown }).output;
        let foundDiff = false;
        let diffContent = "";
        
        // Check if output is a string that contains diff format
        if (typeof output === "string" && containsDiffFormat(output)) {
          event.hasDiff = true;
          diffContent = output.slice(0, 200);
        }
        // Check if output is an object with content field
        else if (output && typeof output === "object") {
          const objOutput = output as Record<string, unknown>;
          const contentFields = ["output", "content", "text", "result", "message", "data"];
          
          // First check direct content fields
          for (const field of contentFields) {
            const fieldValue = objOutput[field];
            if (typeof fieldValue === "string" && containsDiffFormat(fieldValue)) {
              event.hasDiff = true;
              diffContent = fieldValue.slice(0, 200);
              foundDiff = true;
              break;
            }
          }
          
          // Then check nested metadata.diff field (OpenCode format)
          if (!foundDiff && objOutput.metadata && typeof objOutput.metadata === "object") {
            const metadata = objOutput.metadata as Record<string, unknown>;
            if (metadata.diff && typeof metadata.diff === "string" && containsDiffFormat(metadata.diff)) {
              event.hasDiff = true;
              diffContent = metadata.diff.slice(0, 200);
              foundDiff = true;
            }
          }
        }
        
        if (event.hasDiff) {
          console.log(`\n>>> FOUND DIFF: ${diffContent.slice(0, 200)}...`);
        }
      }
      
      events.push(event);
    }

    console.log(`\nTotal chunks: ${chunkCount}`);
    console.log(`Events with diff content: ${events.filter(e => e.hasDiff).length}`);

    const diffEvents = events.filter(e => e.hasDiff);
    
    console.log("\n=== Summary ===");
    if (diffEvents.length > 0) {
      console.log("SUCCESS: Diff content detected in events!");
      return { diffEvents, testPassed: true, reason: "Diff events found" };
    } else {
      console.log("No diff format detected in tool outputs.");
      console.log("The agent may use different output formats.");
      return { diffEvents, testPassed: false, reason: "No diff events" };
    }

  } finally {
    provider.cleanup();
    try { await unlink(testFile).catch(() => {}); } catch {}
  }
}

// Export for use in test runners
export { runDiffTest, containsDiffFormat, parseUnifiedDiff };

// Run if executed directly
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  runDiffTest()
    .then(({ diffEvents, testPassed, reason }) => {
      console.log(`\n=== Final Result ===`);
      console.log(`Test passed: ${testPassed}`);
      console.log(`Reason: ${reason}`);
      console.log(`Diff events found: ${diffEvents.length}`);
      process.exit(testPassed ? 0 : 1);
    })
    .catch(err => {
      console.error("Test failed:", err);
      process.exit(1);
    });
}
