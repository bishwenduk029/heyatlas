"use client";

import { Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface TaskUpdate {
  content: string;
  agent: string;
}

interface ChatInterfaceProps {
  messages: Message[];
  onSendMessage: (text: string) => void;
  onStop?: () => void;
  isLoading?: boolean;
  isConnected?: boolean;
  taskUpdate?: TaskUpdate | null;
  onDismissTaskUpdate?: () => void;
  onToggleVoice?: () => void;
  showVoiceToggle?: boolean;
}

export function ChatInterface({
  messages,
  onSendMessage,
  onStop,
  isLoading = false,
  isConnected = false,
  taskUpdate,
  onDismissTaskUpdate,
  onToggleVoice,
  showVoiceToggle = false,
}: ChatInterfaceProps) {
  const { data: session } = authClient.useSession();
  const user = session?.user;

  const handleSend = async (text: string) => {
    onSendMessage(text);
  };

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Task Update Banner */}
      {taskUpdate && (
        <div className="mx-4 mt-2 p-3 rounded-lg bg-muted/50 border border-border flex items-start gap-3 shrink-0">
          <Terminal className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground mb-1">
              Update from {taskUpdate.agent}
            </p>
            <p className="text-sm text-foreground line-clamp-2">{taskUpdate.content}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={onDismissTaskUpdate}
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Messages */}
      <MessageList
        messages={messages}
        userImage={user?.image || undefined}
        onQuickAction={isConnected ? handleSend : undefined}
      />

      {/* Input */}
      <div className="sticky bottom-0 z-10 mx-auto w-full max-w-3xl px-4 pb-3 pt-2 bg-background">
        <ChatInput
          onSend={handleSend}
          onStop={onStop}
          onToggleVoice={onToggleVoice}
          isLoading={isLoading}
          disabled={!isConnected}
          showVoiceToggle={showVoiceToggle}
        />
      </div>
    </div>
  );
}
