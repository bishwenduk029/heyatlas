"use client";

import { useState, useEffect, useRef } from "react";
import { useAgent } from "agents/react";
import { Send, User, Bot, Loader2, Plus, Mic, Paperclip, Sparkles, ArrowUp } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { ChatWelcome } from "./chat-welcome";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import env from "@/env";
import TextareaAutosize from "react-textarea-autosize";

interface AssistantChatProps {
  userId: string;
  token: string;
  agentUrl?: string;
  onToggleMode?: () => void;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export function AssistantChat({ userId, token, agentUrl, onToggleMode }: AssistantChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { data: session } = authClient.useSession();
  const user = session?.user;

  const agent = useAgent({
    agent: "atlas-agent",
    name: userId,
    host: agentUrl || env.NEXT_PUBLIC_ATLAS_AGENT_URL,
    query: { token }
  });

  useEffect(() => {
    if (!agent) return;

    // If agent is already open, set connected immediately
    if (agent.readyState === WebSocket.OPEN) {
      setIsConnected(true);
    }

    const onOpen = () => setIsConnected(true);
    const onClose = () => setIsConnected(false);
    const onMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "chat:response" || data.type === "stream:chunk") {
          setMessages(prev => {
            const lastMsg = prev[prev.length - 1];
            const messageId = data.messageId || crypto.randomUUID();
            if (lastMsg && lastMsg.role === "assistant" && lastMsg.id === messageId) {
              return [...prev.slice(0, -1), { ...lastMsg, content: lastMsg.content + (data.content || "") }];
            }
            return [...prev, {
              id: messageId + "-" + Date.now(), // Ensure uniqueness
              role: "assistant",
              content: data.content || "",
              timestamp: Date.now()
            }];
          });
        }
      } catch (e) { console.error(e); }
    };

    agent.addEventListener("open", onOpen);
    agent.addEventListener("close", onClose);
    agent.addEventListener("message", onMessage);
    return () => {
      agent.removeEventListener("open", onOpen);
      agent.removeEventListener("close", onClose);
      agent.removeEventListener("message", onMessage);
    };
  }, [agent]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = (text?: string) => {
    const content = text || inputValue.trim();
    if (!content || !agent) return;

    const messageId = crypto.randomUUID();
    setMessages(prev => [...prev, { id: messageId, role: "user", content, timestamp: Date.now() }]);
    agent.send(JSON.stringify({ type: "chat", content, messageId }));
    setInputValue("");
  };

  return (
    <div className="h-full flex flex-col bg-background relative">
      {/* Messages Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-6 pb-32">
        {messages.length === 0 ? (
          <ChatWelcome 
            onAction={sendMessage} 
          />
        ) : (
          <div className="max-w-3xl mx-auto w-full space-y-6">
            {messages.map(msg => (
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
                    "px-4 py-3 rounded-2xl text-sm shadow-sm border",
                    msg.role === "user" 
                      ? "bg-primary text-primary-foreground rounded-tr-none border-primary" 
                      : "bg-muted/50 text-foreground rounded-tl-none"
                  )}>
                    {msg.content}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Fixed Bottom Input */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background to-transparent pt-10">
        <div className="max-w-3xl mx-auto w-full px-0">
          <div className="relative rounded-3xl border-2 border-border bg-muted/20 focus-within:bg-muted/30 focus-within:ring-1 focus-within:ring-primary transition-all overflow-hidden">
            <TextareaAutosize
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              minRows={1}
              maxRows={8}
              className="w-full bg-transparent px-6 py-4 outline-none text-base placeholder:text-muted-foreground/50 resize-none"
              placeholder="Send a message..."
              disabled={!isConnected}
            />
            
            <div className="flex items-center justify-between px-4 pb-3 pt-1">
              <div className="flex items-center gap-2">
                {onToggleMode ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onToggleMode}
                    className="h-8 w-8 rounded-full text-muted-foreground hover:text-white hover:bg-white/10"
                    title="Switch to Voice"
                  >
                    <Mic className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground hover:text-white hover:bg-white/10">
                    <Paperclip className="h-4 w-4" />
                  </Button>
                )}
              </div>
              
              <Button 
                onClick={() => sendMessage()} 
                size="icon" 
                disabled={!isConnected || !inputValue.trim()}
                className={cn(
                  "h-8 w-8 rounded-full transition-all",
                  inputValue.trim() 
                    ? "bg-white text-black hover:bg-white/90" 
                    : "bg-white/10 text-muted-foreground hover:bg-white/20"
                )}
              >
                {isConnected ? <ArrowUp className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
              </Button>
            </div>
          </div>
          
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
