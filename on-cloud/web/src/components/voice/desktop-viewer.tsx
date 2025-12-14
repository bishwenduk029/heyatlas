"use client";

import { Monitor } from "lucide-react";
import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { MatrixLogs } from "./matrix-logs";
import { AgentTerminal } from "./agent-terminal";
import { toast } from "sonner";

declare global {
  interface Window {
    __TAURI__?: {
      invoke: <T>(cmd: string, args?: unknown) => Promise<T>;
      core?: {
        invoke: <T>(cmd: string, args?: unknown) => Promise<T>;
      };
    };
  }
}

interface DesktopViewerProps {
  vncUrl?: string;
  logUrl?: string;
  mobileChatContent?: React.ReactNode;
  userId?: string;
  // MCP UI forms now integrated into chat - no longer need separate tab
}

function SelectionScreen({
  onSelect,
}: {
  onSelect: (mode: "launch_new" | "connect_local") => void;
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 bg-muted/10 p-6">
      <h2 className="text-xl font-semibold text-foreground">
        Choose Computer Mode
      </h2>
      <div className="flex flex-col gap-4">
        <Button
          variant="outline"
          className="h-auto w-72 justify-start gap-4 border-2 px-4 py-4 hover:border-primary/50"
          onClick={() => onSelect("launch_new")}
        >
          <Monitor className="h-8 w-8 shrink-0" />
          <div className="flex flex-col items-start text-left">
            <span className="font-medium">Launch New Computer</span>
            <span className="text-xs text-muted-foreground font-normal">
              Start a cloud sandbox computer
            </span>
          </div>
        </Button>
        <Button
          variant="outline"
          className="h-auto w-72 justify-start gap-4 border-2 px-4 py-4 hover:border-primary/50"
          onClick={() => onSelect("connect_local")}
        >
          <Monitor className="h-8 w-8 shrink-0 text-blue-500" />
          <div className="flex flex-col items-start text-left">
            <span className="font-medium">Connect to Local Agent</span>
            <span className="text-xs text-muted-foreground font-normal">
              Use an agent on your local computer
            </span>
          </div>
        </Button>
      </div>
    </div>
  );
}

export function DesktopViewer({
  vncUrl,
  logUrl,
  mobileChatContent,
  userId,
}: DesktopViewerProps) {
  const isTauri = typeof window !== "undefined" && !!window.__TAURI__;
  const [mode, setMode] = useState<"selection" | "launch_new" | "connect_local">(
    isTauri ? "selection" : "launch_new"
  );
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window !== "undefined") {
      return window.innerWidth < 768;
    }
    return false;
  });

  const [availableAgents, setAvailableAgents] = useState<string[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | undefined>(undefined);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);



  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768); // md breakpoint
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (mode === "connect_local") {
        if (typeof window !== "undefined" && window.__TAURI__) {
        const invoke = window.__TAURI__.core?.invoke || window.__TAURI__.invoke;

        if (invoke) {
            invoke<string[]>("get_available_agents")
            .then((agents) => {
                setAvailableAgents(agents);
                // Don't auto-select the first agent
            })
            .catch((e: unknown) => console.error("Failed to fetch agents:", e));
        }
        }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);



  const handleConnect = async () => {
    if (!selectedAgent || !userId) return;

    setIsConnecting(true);
    try {
      if (typeof window !== "undefined" && window.__TAURI__) {
        const invoke = window.__TAURI__.core?.invoke || window.__TAURI__.invoke;

        if (invoke) {
          await invoke("connect_agent_bridge", { roomId: userId, agent: selectedAgent });
          setIsConnected(true);
          toast.success(`Connected with ${selectedAgent}`);
        }
      }
    } catch (error) {
      console.error("Failed to start agent bridge:", error);
      toast.error("Failed to start agent bridge");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      if (typeof window !== "undefined" && window.__TAURI__) {
        const invoke = window.__TAURI__.core?.invoke || window.__TAURI__.invoke;

        if (invoke) {
          await invoke("disconnect_agent_bridge");
          setIsConnected(false);
          toast.success("Agent disconnected");
        }
      }
    } catch (error) {
      console.error("Failed to disconnect agent bridge:", error);
      toast.error("Failed to disconnect agent bridge");
    }
  };

  const defaultTab = mobileChatContent && isMobile ? "chat" : "computer";
  const [activeTab, setActiveTab] = useState<string>(defaultTab);

  const renderDesktopPane = () => {
    if (!vncUrl) {
      return (
        <div className="bg-muted/30 flex h-full w-full flex-col items-center justify-center">
          <Monitor className="text-muted-foreground mb-4 h-12 w-12" />
          <p className="text-muted-foreground text-sm">Desktop Viewer</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Agent workspace will appear here
          </p>
        </div>
      );
    }

    return (
      <div className="relative h-full w-full overflow-hidden rounded-lg bg-black">
        <iframe
          src={vncUrl}
          className="h-full w-full border-0"
          title="Agent Desktop"
          allowFullScreen
          sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock"
        />
      </div>
    );
  };

  const renderTabs = () => {
    const getGridColsClass = () => {
      // Tabs shown:
      // - Mobile: Computer + (Chat?) + Under Hood
      // - Desktop: Computer + Under Hood (Chat hidden via md:hidden)
      if (isMobile) return mobileChatContent ? "grid-cols-3" : "grid-cols-2";
      return "grid-cols-2";
    };

    const renderLogsPane = () => {
      // Web: keep Logdy websocket behavior
      if (!isTauri || mode !== "connect_local") {
        return <MatrixLogs logsUrl={logUrl} />;
      }

      // Desktop (Tauri): embed ghostty-web terminal directly
      return <AgentTerminal />;
    };

    return (
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex h-full w-full flex-col"
      >
        <TabsList className={`grid w-full ${getGridColsClass()}`}>
          <TabsTrigger value="computer">Computer</TabsTrigger>
          {mobileChatContent && (
            <TabsTrigger value="chat" className="md:hidden">
              Chat
            </TabsTrigger>
          )}
          <TabsTrigger value="logs">Under Hood</TabsTrigger>
        </TabsList>

        <TabsContent value="computer" className="h-full flex-1 overflow-hidden">
          {renderDesktopPane()}
        </TabsContent>

        {mobileChatContent && (
          <TabsContent value="chat" className="h-full flex-1 overflow-hidden md:hidden">
            {mobileChatContent}
          </TabsContent>
        )}

        <TabsContent value="logs" className="h-full flex-1 overflow-hidden">
          {renderLogsPane()}
        </TabsContent>
      </Tabs>
    );
  };

  if (mode === "selection") {
    return <SelectionScreen onSelect={setMode} />;
  }

  if (mode === "connect_local") {
    return (
        <div className="flex h-full w-full flex-col">
            <div className="flex items-center justify-between px-2 py-2 border-b">
                <Button variant="ghost" size="sm" onClick={() => setMode("selection")}>
                    ← Back
                </Button>
                {availableAgents.length > 0 && (
                    <div className="flex items-center gap-2">
                        <Select
                            value={selectedAgent}
                            onValueChange={setSelectedAgent}
                            disabled={isConnected}
                        >
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Select Agent" />
                            </SelectTrigger>
                            <SelectContent>
                                {availableAgents.map((agent) => (
                                    <SelectItem key={agent} value={agent}>
                                        {agent === "heycomputer" ? "Default Agent" : agent}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {isConnected ? (
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={handleDisconnect}
                            >
                                Disconnect
                            </Button>
                        ) : (
                            <Button
                                variant="default"
                                size="sm"
                                disabled={!selectedAgent || isConnecting}
                                onClick={handleConnect}
                            >
                                {isConnecting ? "Connecting..." : "Connect"}
                            </Button>
                        )}
                    </div>
                )}
            </div>
            {renderTabs()}
        </div>
    );
  }

  // launch_new mode (default view)
  return (
    <div className="flex h-full w-full flex-col">
        {isTauri && (
          <div className="flex items-center justify-start px-2 py-2 border-b">
              <Button variant="ghost" size="sm" onClick={() => setMode("selection")}>
                  ← Back to Selection
              </Button>
          </div>
        )}
        {renderTabs()}
    </div>
  );
}
