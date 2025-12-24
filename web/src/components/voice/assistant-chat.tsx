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
    <div className="flex h-full min-w-0 flex-col bg-background touch-pan-y">
      {/* Task Update Banner */}
      {lastTaskUpdate && (
        <div className="mx-auto w-full max-w-4xl px-4 pt-2">
          <div className="p-3 rounded-lg bg-muted/50 border border-border flex items-start gap-3 shrink-0">
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
        </div>
      )}

      
      <div className="flex-1 overflow-y-auto">
        <div
          ref={containerRef}
          className="h-full"
        >
          <div className="flex min-w-0 max-w-4xl flex-col gap-4 px-2 py-4 pb-32 md:gap-6 md:px-4">
            {allMessages.length === 0 ? (
              <ChatWelcome onAction={handleAction} />
            ) : (
              <>
                {allMessages.map(msg => (
                  <div key={msg.id} className={cn(
                    "group fade-in w-full animate-in duration-200",
                    msg.role === "user" ? "flex justify-end" : "flex justify-start"
                  )}>
                    <div className={cn(
                      "flex items-start gap-3 max-w-[80%]",
                      msg.role === "user" && "flex-row-reverse"
                    )}>
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
                        "px-4 py-3 rounded-lg text-sm shadow-sm border whitespace-pre-wrap",
                        msg.role === "user" 
                          ? "bg-primary text-primary-foreground" 
                          : "bg-muted/50 text-foreground"
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
        <div className="sticky bottom-4 flex justify-center pointer-events-none">
          <button
            aria-label="Scroll to bottom"
            className={cn(
              "pointer-events-auto z-10 rounded-full border bg-background p-2 shadow-lg transition-all hover:bg-muted",
              isAtBottom
                ? "scale-0 opacity-0"
                : "scale-100 opacity-100"
            )}
            onClick={() => scrollToBottom("smooth")}
            type="button"
          >
            <ArrowDown className="size-4" />
          </button>
        </div>
      </div>

      {/* Bottom Input - sticky positioning */}
      <div className="sticky bottom-0 z-10 mx-auto flex w-full max-w-4xl gap-2 border-t-0 bg-background px-2 pb-3 pt-2 md:px-4 md:pb-4">
        <div className="w-full">
          <form onSubmit={handleSubmit} className="relative overflow-hidden rounded-xl border-2 bg-background shadow-lg transition-all duration-300 border-primary/20 hover:border-primary/40 focus-within:border-primary focus-within:shadow-[0_0_20px_rgba(var(--primary),0.3)] hover:shadow-[0_0_15px_rgba(var(--primary),0.2)] animate-pulse-border">
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
              className="w-full resize-none border-0 bg-transparent p-4 text-base outline-none ring-0 placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
              placeholder="Send a message..."
              disabled={!isConnected || isLoading}
            />

            <div className="flex items-center justify-between p-3 border-t border-border/50">
              <div className="flex items-center gap-1">
                {onToggleMode && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={onToggleMode}
                    className="h-9 w-9 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
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
                  className="h-9 w-9 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-lg"
                >
                  <Loader2 className="h-4 w-4 animate-spin" />
                </Button>
              ) : (
                <Button 
                  type="submit"
                  size="icon" 
                  disabled={!isConnected || !input.trim()}
                  className={cn(
                    "h-9 w-9 rounded-lg transition-all duration-200 shadow-lg",
                    input.trim() 
                      ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_10px_rgba(var(--primary),0.5)] hover:shadow-[0_0_15px_rgba(var(--primary),0.7)]" 
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
              )}
            </div>
          </form>

          <div className="text-center mt-2">
             <p className="text-xs text-muted-foreground/60">
               AI can make mistakes. Check important info.
             </p>
          </div>
        </div>
      </div>
    </div>
  );
}
