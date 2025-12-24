"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Mic, ArrowUp, LayoutList, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import TextareaAutosize from "react-textarea-autosize";

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop?: () => void;
  onToggleVoice?: () => void;
  onToggleTasks?: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  showVoiceToggle?: boolean;
  isTasksView?: boolean;
}

export function ChatInput({
  onSend,
  onStop,
  onToggleVoice,
  onToggleTasks,
  isLoading = false,
  disabled = false,
  showVoiceToggle = false,
  isTasksView = false,
}: ChatInputProps) {
  const [input, setInput] = useState("");

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || disabled) return;
    onSend(input.trim());
    setInput("");
  };

  return (
    <div className="w-full">
      <form
        onSubmit={handleSubmit}
        className="relative rounded-3xl border border-border/40 bg-background shadow-[0_0_15px_-3px_rgba(34,197,94,0.15)] focus-within:shadow-[0_0_25px_-5px_rgba(34,197,94,0.3)] focus-within:border-primary/30 transition-all overflow-hidden"
      >
        <TextareaAutosize
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          minRows={1}
          maxRows={8}
          className="w-full bg-transparent px-6 py-4 outline-none text-base placeholder:text-muted-foreground/50 resize-none"
          placeholder="Send a message..."
          disabled={disabled || isLoading}
        />

        <div className="flex items-center justify-between px-4 pb-3 pt-1">
          <div className="flex items-center gap-2">
            {onToggleTasks && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onToggleTasks}
                className={cn(
                  "h-8 w-8 rounded-full cursor-pointer icon-action",
                  isTasksView && "active"
                )}
                title={isTasksView ? "Show Chat" : "Show Tasks"}
              >
                {isTasksView ? (
                  <MessageSquare className="h-4 w-4" />
                ) : (
                  <LayoutList className="h-4 w-4" />
                )}
              </Button>
            )}

            {showVoiceToggle && onToggleVoice && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onToggleVoice}
                className="h-8 w-8 rounded-full cursor-pointer icon-action"
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
              onClick={onStop}
              className="h-8 w-8 rounded-full bg-white text-black hover:bg-white/90 cursor-pointer"
            >
              <Loader2 className="h-4 w-4 animate-spin" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              disabled={disabled || !input.trim()}
              className={cn(
                "h-8 w-8 rounded-full transition-all cursor-pointer",
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

      <p className="text-center mt-2 text-[10px] text-muted-foreground/40">
        AI can make mistakes. Check important info.
      </p>
    </div>
  );
}
