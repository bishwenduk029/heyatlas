"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "agents/ai-react";
import type { UIMessage } from "@ai-sdk/react";
import { User, Bot, Loader2, Mic, ArrowUp, ArrowDown, Terminal } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { ChatWelcome } from "./chat-welcome";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import env from "@/env";
import TextareaAutosize from "react-textarea-autosize";

// Hook for scroll-to-bottom behavior (based on Vercel ai-chatbot pattern)
function useScrollToBottom() {
  const containerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const isAtBottomRef = useRef(true);
  const isUserScrollingRef = useRef(false);

  useEffect(() => {
    isAtBottomRef.current = isAtBottom;
  }, [isAtBottom]);

  const checkIfAtBottom = useCallback(() => {
    if (!containerRef.current) return true;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    return scrollTop + clientHeight >= scrollHeight - 100;
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    if (!containerRef.current) return;
    containerRef.current.scrollTo({
      top: containerRef.current.scrollHeight,
      behavior,
    });
  }, []);

  // Handle user scroll events
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let scrollTimeout: ReturnType<typeof setTimeout>;

    const handleScroll = () => {
      isUserScrollingRef.current = true;
      clearTimeout(scrollTimeout);
      const atBottom = checkIfAtBottom();
      setIsAtBottom(atBottom);
      isAtBottomRef.current = atBottom;
      scrollTimeout = setTimeout(() => {
        isUserScrollingRef.current = false;
      }, 150);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, [checkIfAtBottom]);

  // Auto-scroll when content changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scrollIfNeeded = () => {
      if (isAtBottomRef.current && !isUserScrollingRef.current) {
        requestAnimationFrame(() => {
          container.scrollTo({
            top: container.scrollHeight,
            behavior: "instant",
          });
          setIsAtBottom(true);
          isAtBottomRef.current = true;
        });
      }
    };

    const mutationObserver = new MutationObserver(scrollIfNeeded);
    mutationObserver.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    const resizeObserver = new ResizeObserver(scrollIfNeeded);
    resizeObserver.observe(container);
    for (const child of container.children) {
      resizeObserver.observe(child);
    }

    return () => {
      mutationObserver.disconnect();
      resizeObserver.disconnect();
    };
  }, []);

  return { containerRef, endRef, isAtBottom, scrollToBottom };
}

// Types matching atlas/src/types.ts
interface SyncedMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface TaskUpdate {
  content: string;
  source: string;
  agent: string;
  status: string;
  timestamp: number;
}

interface AgentSyncedState {
  recentMessages?: SyncedMessage[];
  lastTaskUpdate?: TaskUpdate | null;
}

interface AssistantChatProps {
  userId: string;
  token: string;
  agentUrl?: string;
  onToggleMode?: () => void;
}

export function AssistantChat({ userId, token, agentUrl, onToggleMode }: AssistantChatProps) {
  const [input, setInput] = useState("");
  const [lastTaskUpdate, setLastTaskUpdate] = useState<TaskUpdate | null>(null);

  const { containerRef, endRef, isAtBottom, scrollToBottom } = useScrollToBottom();

  const { data: session } = authClient.useSession();
  const user = session?.user;

  // Handle state updates from the agent (for task updates only)
  const handleStateUpdate = useCallback((state: AgentSyncedState) => {
    if (state.lastTaskUpdate) {
      setLastTaskUpdate(state.lastTaskUpdate);
    }
  }, []);

  // Connect to the Atlas agent (token via query for WebSocket handshake)
  const agentConnection = useAgent<AgentSyncedState>({
    agent: "atlas-agent",
    name: userId,
    host: agentUrl || env.NEXT_PUBLIC_ATLAS_AGENT_URL,
    query: { token },
    onStateUpdate: handleStateUpdate,
  });

  // Use the chat hook with initial messages from agent
  const {
    messages,
    sendMessage,
    clearHistory,
    status,
    stop,
  } = useAgentChat<unknown, UIMessage>({
    agent: agentConnection as ReturnType<typeof useAgent>
  });

  const isLoading = status === "submitted" || status === "streaming";
  const isConnected = agentConnection?.readyState === WebSocket.OPEN;

  // Extract text content from UIMessage parts
  const getMessageText = (msg: UIMessage): string => {
    if (!msg.parts) return "";
    return msg.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map(p => p.text)
      .join("");
  };

  // Messages are automatically synced by AIChatAgent
  const allMessages = (messages || [])
    .map(m => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: getMessageText(m),
    }))
    .filter(m => m.content);

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  // Handle form submit
  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || !isConnected) return;

    const message = input;
    setInput("");

    // Send message using the pattern from agents-starter
    await sendMessage({
      role: "user",
      parts: [{ type: "text", text: message }],
    });
  };

  // Handle quick action from welcome screen
  const handleAction = async (text: string) => {
    if (!isConnected) return;
    setInput("");
    await sendMessage({
      role: "user",
      parts: [{ type: "text", text }],
    });
  };

  return (
    <div className="flex h-full min-w-0 flex-col bg-background overscroll-contain touch-pan-y">
      {/* Task Update Banner */}
      {lastTaskUpdate && (
        <div className="mx-4 mt-2 p-3 rounded-lg bg-muted/50 border border-border flex items-start gap-3 shrink-0">
          <Terminal className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground mb-1">
              Update from {lastTaskUpdate.agent}
            </p>
            <p className="text-sm text-foreground line-clamp-2">{lastTaskUpdate.content}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setLastTaskUpdate(null)}
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Messages Area - Vercel ai-chatbot scroll pattern */}
      <div className="relative flex-1">
        <div
          ref={containerRef}
          className="absolute inset-0 touch-pan-y overflow-y-auto"
        >
          <div className="mx-auto flex min-w-0 max-w-3xl flex-col gap-6 px-4 py-4 pb-32">
            {allMessages.length === 0 ? (
              <ChatWelcome onAction={handleAction} />
            ) : (
              <>
                {allMessages.map(msg => (
                  <div key={msg.id} className={cn("flex flex-col gap-2", msg.role === "user" ? "items-end" : "items-start")}>
                    <div className={cn("flex items-start gap-3 max-w-[85%]", msg.role === "user" && "flex-row-reverse")}>
                      <Avatar className="h-8 w-8 shrink-0 mt-1 border shadow-sm">
                        {msg.role === "user" ? (
                          <>
                            <AvatarImage src={user?.image || undefined} />
                            <AvatarFallback className="bg-primary text-primary-foreground"><User className="h-4 w-4" /></AvatarFallback>
                          </>
                        ) : (
                          <AvatarFallback className="bg-muted text-primary"><Bot className="h-4 w-4" /></AvatarFallback>
                        )}
                      </Avatar>
                      <div className={cn(
                        "px-4 py-3 rounded-2xl text-sm shadow-sm border whitespace-pre-wrap",
                        msg.role === "user" 
                          ? "bg-primary text-primary-foreground rounded-tr-none border-primary" 
                          : "bg-muted/50 text-foreground rounded-tl-none"
                      )}>
                        {msg.content}
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
            <div ref={endRef} className="min-h-[24px] min-w-[24px] shrink-0" />
          </div>
        </div>

        {/* Scroll to bottom button */}
        <button
          aria-label="Scroll to bottom"
          className={cn(
            "absolute bottom-4 left-1/2 -translate-x-1/2 z-10 rounded-full border bg-background p-2 shadow-lg transition-all hover:bg-muted",
            isAtBottom
              ? "pointer-events-none scale-0 opacity-0"
              : "pointer-events-auto scale-100 opacity-100"
          )}
          onClick={() => scrollToBottom("smooth")}
          type="button"
        >
          <ArrowDown className="size-4" />
        </button>
      </div>

      {/* Bottom Input - sticky positioning */}
      <div className="sticky bottom-0 z-10 mx-auto flex w-full max-w-3xl gap-2 border-t-0 bg-background px-4 pb-3 pt-2">
        <div className="w-full">
          <form onSubmit={handleSubmit} className="relative rounded-3xl border-2 border-border bg-muted/20 focus-within:bg-muted/30 focus-within:ring-1 focus-within:ring-primary transition-all overflow-hidden">
            <TextareaAutosize
              value={input}
              onChange={handleInputChange}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              minRows={1}
              maxRows={8}
              className="w-full bg-transparent px-6 py-4 outline-none text-base placeholder:text-muted-foreground/50 resize-none"
              placeholder="Send a message..."
              disabled={!isConnected || isLoading}
            />
            
            <div className="flex items-center justify-between px-4 pb-3 pt-1">
              <div className="flex items-center gap-2">
                {onToggleMode && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={onToggleMode}
                    className="h-8 w-8 rounded-full text-muted-foreground hover:text-white hover:bg-white/10"
                    title="Switch to Voice"
                  >
                    <Mic className="h-4 w-4" />
                  </Button>
                )}
              </div>
              
              {isLoading ? (
                <Button 
                  type="button"
                  size="icon"
                  onClick={stop}
                  className="h-8 w-8 rounded-full bg-white text-black hover:bg-white/90"
                >
                  <Loader2 className="h-4 w-4 animate-spin" />
                </Button>
              ) : (
                <Button 
                  type="submit"
                  size="icon" 
                  disabled={!isConnected || !input.trim()}
                  className={cn(
                    "h-8 w-8 rounded-full transition-all",
                    input.trim() 
                      ? "bg-white text-black hover:bg-white/90" 
                      : "bg-white/10 text-muted-foreground hover:bg-white/20"
                  )}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
              )}
            </div>
          </form>
          
          <div className="text-center mt-2">
             <p className="text-[10px] text-muted-foreground/40">
               AI can make mistakes. Check important info.
             </p>
          </div>
        </div>
      </div>
    </div>
  );
}
