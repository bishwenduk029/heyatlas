"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Mic, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import TextareaAutosize from "react-textarea-autosize";

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop?: () => void;
  onToggleVoice?: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  showVoiceToggle?: boolean;
}

export function ChatInput({
  onSend,
  onStop,
  onToggleVoice,
  isLoading = false,
  disabled = false,
  showVoiceToggle = false,
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
        className="relative rounded-3xl border-2 border-border bg-muted/20 focus-within:bg-muted/30 focus-within:ring-1 focus-within:ring-primary transition-all overflow-hidden"
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
            {showVoiceToggle && onToggleVoice && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onToggleVoice}
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
              onClick={onStop}
              className="h-8 w-8 rounded-full bg-white text-black hover:bg-white/90"
            >
              <Loader2 className="h-4 w-4 animate-spin" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              disabled={disabled || !input.trim()}
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

      <p className="text-center mt-2 text-[10px] text-muted-foreground/40">
        AI can make mistakes. Check important info.
      </p>
    </div>
  );
}
