"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Mic, MicOff, ArrowUp, LayoutList, MessageSquare, Square } from "lucide-react";
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
  isVoiceMode?: boolean;
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
  isVoiceMode = false,
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
                variant="outline"
                size="lg"
                onClick={onToggleTasks}
                className={cn(
                  "h-12 w-12 rounded-full cursor-pointer icon-action hover:bg-muted",
                  isTasksView && "active"
                )}
                title={isTasksView ? "Show Chat" : "Show Tasks"}
              >
                {isTasksView ? (
                  <MessageSquare className="h-8 w-8" />
                ) : (
                  <LayoutList className="h-8 w-8" />
                )}
              </Button>
            )}

            {showVoiceToggle && onToggleVoice && (
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={onToggleVoice}
                className={cn(
                  "h-12 w-12 rounded-full cursor-pointer icon-action transition-all duration-300 ease-in-out",
                  isVoiceMode 
                    ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" 
                    : "hover:bg-muted"
                )}
                title={isVoiceMode ? "End Voice Session" : "Start Voice Session"}
              >
                <div className="relative w-6 h-6 flex items-center justify-center">
                  <div className={cn(
                    "absolute transition-all duration-300 ease-in-out",
                    isVoiceMode ? "opacity-0 scale-50 rotate-90" : "opacity-100 scale-100 rotate-0"
                  )}>
                    <Mic className="h-8 w-8" />
                  </div>
                  <div className={cn(
                    "absolute transition-all duration-300 ease-in-out flex items-center justify-center",
                    isVoiceMode ? "opacity-100 scale-100 rotate-0" : "opacity-0 scale-50 -rotate-90"
                  )}>
                    <Square className="h-4 w-4 fill-current" />
                  </div>
                </div>
              </Button>
            )}
          </div>

          {isLoading ? (
            <Button
              type="button"
              size="lg"
              onClick={onStop}
              className="h-12 w-12 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
            >
              <Loader2 className="h-8 w-8 animate-spin" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="lg"
              disabled={disabled || !input.trim()}
              className={cn(
                "h-12 w-12 rounded-full transition-all cursor-pointer",
                input.trim()
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              <ArrowUp className="h-6 w-6" />
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
