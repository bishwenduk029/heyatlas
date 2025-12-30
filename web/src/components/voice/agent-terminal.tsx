"use client";

import { useEffect, useRef, useState } from "react";
import type { Terminal } from "ghostty-web";

interface AgentTerminalProps {
  wsUrl?: string;
}

// Check if running in Tauri
const isTauri =
  typeof window !== "undefined" &&
  !!(window as unknown as Record<string, unknown>).__TAURI__;

export function AgentTerminal({
  wsUrl = "ws://localhost:3001/terminal/ws",
}: AgentTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wsRef = useRef<any>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected">("disconnected");
  const reconnectTimerRef = useRef<number | null>(null);
  const listenerCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let mounted = true;
    let term: Terminal | null = null;

    async function initTerminal() {
      if (!containerRef.current || !mounted) return;

      try {
        const ghostty = await import("ghostty-web");
        await ghostty.init();

        if (!mounted || !containerRef.current) return;

        term = new ghostty.Terminal({
          cursorBlink: true,
          fontSize: 13,
          fontFamily: '"SF Mono", Monaco, Menlo, "Courier New", monospace',
          theme: {
            background: "#000000",
            foreground: "#00ff41",
            cursor: "#00ff41",
            cursorAccent: "#000000",
            selectionBackground: "#00ff4140",
          },
          scrollback: 50000,
        });

        terminalRef.current = term;
        term.open(containerRef.current);
        term.focus();

        // Handle terminal input - send to WebSocket (which forwards to bun-pty)
        term.onData((data: string) => {
          if (wsRef.current) {
            if (isTauri && wsRef.current.send) {
              wsRef.current.send(data);
            } else if (wsRef.current.readyState === WebSocket.OPEN) {
              wsRef.current.send(data);
            }
          }
        });

        // Connect WebSocket to agent-bridge
        connectWebSocket();
      } catch (err) {
        console.error("Failed to initialize terminal:", err);
      }
    }

    function handleMessage(rawData: string | { data: string | object }) {
      if (!terminalRef.current) return;
      const term = terminalRef.current;

      // Normalize data
      let dataStr: string;
      if (typeof rawData === "string") {
        dataStr = rawData;
      } else if (rawData && typeof rawData === "object" && "data" in rawData) {
        const inner = rawData.data;
        dataStr = typeof inner === "string" ? inner : JSON.stringify(inner);
      } else {
        dataStr = JSON.stringify(rawData);
      }

      try {
        const data = JSON.parse(dataStr);

        switch (data.type) {
          case "task":
            term.write("\r\n\x1b[1;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\r\n");
            term.write(`\x1b[1;33m[TASK]\x1b[0m ${new Date().toLocaleTimeString()}\r\n`);
            term.write(`\x1b[1;37mAgent:\x1b[0m ${data.agent || "unknown"}\r\n`);
            term.write(`\x1b[1;37mTask:\x1b[0m ${data.content}\r\n`);
            term.write("\x1b[1;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\r\n\r\n");
            break;

          case "status": {
            const statusColor: Record<string, string> = { running: "33", completed: "32", error: "31" };
            const color = statusColor[data.status] || "37";
            term.write(`\x1b[${color}m[${data.status.toUpperCase()}]\x1b[0m ${data.message}\r\n`);
            if (data.progress !== undefined) {
              const filled = Math.floor(data.progress / 5);
              const bar = "█".repeat(filled) + "░".repeat(20 - filled);
              term.write(`\x1b[90mProgress: [${bar}] ${data.progress}%\x1b[0m\r\n`);
            }
            break;
          }

          case "output":
            // Raw PTY output - write directly
            term.write(data.content);
            break;

          case "log":
            term.write(`\x1b[90m${data.content}\x1b[0m\r\n`);
            break;

          case "clear":
            term.clear();
            term.write("\x1b[33mTerminal cleared\x1b[0m\r\n\r\n");
            break;

          default:
            term.write(dataStr + "\r\n");
        }
      } catch {
        // Not JSON, treat as raw output
        terminalRef.current.write(dataStr);
      }
    }

    async function connectWebSocketTauri() {
      if (!mounted) return;
      setStatus("connecting");

      try {
        const TauriWebSocket = await import("@tauri-apps/plugin-websocket");
        const ws = await TauriWebSocket.default.connect(wsUrl);
        wsRef.current = ws;

        setStatus("connected");

        const removeListener = ws.addListener((msg) => {
          if (msg && typeof msg === "object" && "type" in msg) {
            if (msg.type === "Text" && "data" in msg && typeof msg.data === "string") {
              handleMessage(msg.data);
            }
          }
        });
        listenerCleanupRef.current = removeListener;
      } catch (err) {
        console.error("[Terminal] Tauri WebSocket error:", err);
        setStatus("disconnected");
        if (terminalRef.current) {
          terminalRef.current.write(`\r\n\x1b[31m[ERROR]\x1b[0m Failed to connect: ${err}\r\n`);
        }
        reconnectTimerRef.current = window.setTimeout(connectWebSocketTauri, 2000);
      }
    }

    function connectWebSocketNative() {
      if (!mounted) return;
      setStatus("connecting");

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mounted) return;
        setStatus("connected");
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }
      };

      ws.onmessage = (event) => handleMessage(event.data);

      ws.onerror = (error) => console.error("[Terminal] WebSocket error:", error);

      ws.onclose = () => {
        if (!mounted) return;
        setStatus("disconnected");
        if (terminalRef.current) {
          terminalRef.current.write("\r\n\x1b[31m[DISCONNECTED]\x1b[0m Reconnecting...\r\n");
        }
        reconnectTimerRef.current = window.setTimeout(connectWebSocketNative, 2000);
      };
    }

    function connectWebSocket() {
      if (isTauri) {
        connectWebSocketTauri();
      } else {
        connectWebSocketNative();
      }
    }

    initTerminal();

    return () => {
      mounted = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (listenerCleanupRef.current) {
        listenerCleanupRef.current();
        listenerCleanupRef.current = null;
      }
      if (wsRef.current) {
        if (isTauri && wsRef.current.disconnect) {
          wsRef.current.disconnect();
        } else if (wsRef.current.close) {
          wsRef.current.close();
        }
        wsRef.current = null;
      }
      if (terminalRef.current) {
        terminalRef.current.dispose?.();
        terminalRef.current = null;
      }
    };
  }, [wsUrl]);

  return (
    <div className="relative h-full w-full" style={{ backgroundColor: "#000000" }}>
      <div
        className="absolute right-2 top-2 z-10 flex items-center gap-2 rounded px-2 py-1 font-mono text-xs"
        style={{
          backgroundColor: "rgba(0,0,0,0.7)",
          color: status === "connected" ? "#00ff41" : status === "connecting" ? "#ffaa00" : "#ff4444",
          border: `1px solid ${status === "connected" ? "#00ff4140" : status === "connecting" ? "#ffaa0040" : "#ff444440"}`,
        }}
      >
        <div
          className={`h-1.5 w-1.5 rounded-full ${status === "connected" ? "animate-pulse" : ""}`}
          style={{
            backgroundColor: status === "connected" ? "#00ff41" : status === "connecting" ? "#ffaa00" : "#ff0000",
            boxShadow: status === "connected" ? "0 0 8px #00ff41" : status === "connecting" ? "0 0 8px #ffaa00" : "0 0 8px #ff0000",
          }}
        />
        <span>{status.toUpperCase()}</span>
      </div>
      <div ref={containerRef} className="h-full w-full" tabIndex={0} />
    </div>
  );
}
