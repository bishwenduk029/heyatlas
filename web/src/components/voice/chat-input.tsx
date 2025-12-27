"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Mic,
  ArrowUp,
  LayoutList,
  MessageSquare,
  Square,
} from "lucide-react";
import { cn } from "@/lib/utils";
import TextareaAutosize from "react-textarea-autosize";
import { RevealButton } from "@/components/ui/reveal-button";
import { Shimmer } from "@/components/ai-elements/shimmer";

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
  onRequireAuth?: () => void;
  connectedAgentId?: string | null;
  compressing?: boolean;
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
  onRequireAuth,
  connectedAgentId,
  compressing = false,
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
      {(connectedAgentId || compressing) && (
        <div className="fade-in-up overflow-hidden">
          <div
            className={cn(
              "mx-auto my-auto -mb-1 flex h-8 w-[95%] items-center justify-between rounded-sm border-2 border-b-0 px-3 pb-1",

              compressing
                ? "bg-primary border-amber-500/30"
                : "bg-primary border-primary/30",
            )}
          >
            <div className="flex items-center gap-2">
              <span className="text-background text-[10px] tracking-widest">
                Agent Connected
              </span>
            </div>

            {compressing && (
              <Shimmer className="text-background text-[10px] tracking-widest">
                Compressing Memory...
              </Shimmer>
            )}
          </div>
        </div>
      )}
      <form
        onSubmit={handleSubmit}
        className="bg-background focus-within:border-primary/30 relative overflow-hidden rounded-xl border-2 shadow-md transition-all"
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
          className="placeholder:text-muted-foreground/50 w-full resize-none bg-transparent px-6 py-4 text-base outline-none"
          placeholder="Send a message..."
          disabled={disabled || isLoading}
        />

        <div className="flex items-center justify-between px-4 pt-1 pb-3">
          <div className="flex items-center gap-2">
            {onToggleTasks && (
              <RevealButton
                icon={
                  isTasksView ? (
                    <MessageSquare className="h-5 w-5" />
                  ) : (
                    <LayoutList className="h-5 w-5" />
                  )
                }
                label={isTasksView ? "Text Chat" : "Task List"}
                onClick={() => {
                  if (onRequireAuth) {
                    onRequireAuth();
                  } else {
                    onToggleTasks();
                  }
                }}
                className={cn(
                  isTasksView
                    ? "bg-primary/10 text-primary"
                    : "bg-secondary text-secondary-foreground hover:text-foreground",
                )}
              />
            )}

            {showVoiceToggle && onToggleVoice && (
              <RevealButton
                icon={
                  <div className="relative flex h-5 w-5 items-center justify-center">
                    <div
                      className={cn(
                        "absolute transition-all duration-300 ease-in-out",
                        isVoiceMode
                          ? "scale-50 rotate-90 opacity-0"
                          : "scale-100 rotate-0 opacity-100",
                      )}
                    >
                      <Mic className="h-5 w-5" />
                    </div>
                    <div
                      className={cn(
                        "absolute flex items-center justify-center transition-all duration-300 ease-in-out",
                        isVoiceMode
                          ? "scale-100 rotate-0 opacity-100"
                          : "scale-50 -rotate-90 opacity-0",
                      )}
                    >
                      <Square className="h-3.5 w-3.5 fill-current" />
                    </div>
                  </div>
                }
                label={isVoiceMode ? "End Session" : "Voice Chat"}
                onClick={() => {
                  if (onRequireAuth) {
                    onRequireAuth();
                  } else {
                    onToggleVoice();
                  }
                }}
                className={cn(
                  isVoiceMode
                    ? "bg-destructive text-destructive-foreground"
                    : "bg-secondary text-secondary-foreground hover:text-foreground",
                )}
              />
            )}
          </div>

          {isLoading ? (
            <Button
              type="button"
              size="lg"
              onClick={onStop}
              className="bg-primary text-primary-foreground hover:bg-primary/90 h-12 w-12 cursor-pointer rounded-full"
            >
              <Loader2 className="h-8 w-8 animate-spin" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="lg"
              disabled={disabled || !input.trim()}
              className={cn(
                "h-12 w-12 cursor-pointer rounded-full transition-all",
                input.trim()
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground hover:bg-muted/80",
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
