"use client";

import { useState, useEffect, useRef } from "react";
import { useAgent } from "agents/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Loader2 } from "lucide-react";
import { ChatMessageView } from "./chat-message-view";
import { cn } from "@/lib/utils";
import env from "@/env";

interface ChatInterfaceProps {
  userId: string;
  token: string;
  className?: string;
  agentUrl?: string; // Optional URL override
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export function ChatInterface({ userId, token, className, agentUrl }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  
  // Connect to the Atlas Agent
  const agent = useAgent({
    agent: "atlas-agent",
    name: userId,
    options: {
      host: agentUrl || env.NEXT_PUBLIC_ATLAS_AGENT_URL,
      query: {
        token: token, // Pass token in query params for WebSocket auth
      }
    }
  });

  // Handle incoming messages
  useEffect(() => {
    if (!agent) return;

    const onOpen = () => {
      console.log("Chat connected");
      setIsConnected(true);
    };

    const onClose = () => {
      console.log("Chat disconnected");
      setIsConnected(false);
    };

    const onMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === "chat:response") {
           setMessages(prev => [...prev, {
             id: data.messageId || crypto.randomUUID(),
             role: "assistant",
             content: data.content,
             timestamp: Date.now()
           }]);
        } else if (data.type === "stream:chunk") {
           // Handle streaming if needed, for now just append to last message if matching id
           setMessages(prev => {
             const lastMsg = prev[prev.length - 1];
             if (lastMsg && lastMsg.role === "assistant" && lastMsg.id === data.messageId) {
               return [
                 ...prev.slice(0, -1),
                 { ...lastMsg, content: lastMsg.content + data.content }
               ];
             } else {
                // Start new message
                return [...prev, {
                  id: data.messageId,
                  role: "assistant",
                  content: data.content,
                  timestamp: Date.now()
                }];
             }
           });
        }
      } catch (e) {
        console.error("Failed to parse message", e);
      }
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

  const sendMessage = () => {
    if (!inputValue.trim() || !agent) return;
    
    const messageId = crypto.randomUUID();
    const content = inputValue.trim();
    
    // Optimistic update
    setMessages(prev => [...prev, {
      id: messageId,
      role: "user",
      content,
      timestamp: Date.now()
    }]);

    agent.send(JSON.stringify({
      type: "chat",
      content,
      messageId
    }));
    
    setInputValue("");
  };

  return (
    <div className={cn("flex flex-col h-full bg-background", className)}>
       <ChatMessageView className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground opacity-50">
               <p>Start a conversation...</p>
            </div>
          )}
          {messages.map(msg => (
            <div key={msg.id} className={cn("flex flex-col gap-1", msg.role === "user" ? "items-end" : "items-start")}>
               <span className="text-xs text-muted-foreground px-1">
                 {msg.role === "user" ? "You" : "Atlas"}
               </span>
               <div className={cn("max-w-[85%] px-4 py-2 rounded-lg text-sm", 
                  msg.role === "user" 
                    ? "bg-primary text-primary-foreground rounded-br-sm" 
                    : "bg-muted text-foreground rounded-bl-sm"
               )}>
                 {msg.content}
               </div>
            </div>
          ))}
       </ChatMessageView>
       
       <div className="p-4 border-t flex gap-2 items-center bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
         <Input 
           value={inputValue} 
           onChange={e => setInputValue(e.target.value)}
           onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
           placeholder="Message Atlas..."
           disabled={!isConnected}
           className="flex-1"
         />
         <Button onClick={sendMessage} size="icon" disabled={!isConnected || !inputValue.trim()}>
           {isConnected ? <Send className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
         </Button>
       </div>
    </div>
  );
}
