"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Mic,
  MicOff,
  ArrowUp,
  LayoutList,
  MessageSquare,
  Square,
} from "lucide-react";
import { cn } from "@/lib/utils";
import TextareaAutosize from "react-textarea-autosize";
import { RevealButton } from "@/components/ui/reveal-button";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { BarVisualizer } from "@/components/ui/bar-visualizer";
import { VoiceIcon } from "@/components/ui/voice-icon";
import { AgentSelector } from "./agent-selector";
import { getAgentDisplayName } from "@/lib/cloudflare-sandbox";
import type { AgentState } from "@/components/ui/bar-visualizer";

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop?: () => void;
  onToggleVoice?: () => void;
  onToggleTasks?: () => void;
  onToggleMute?: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  showVoiceToggle?: boolean;
  isTasksView?: boolean;
  isVoiceMode?: boolean;
  isMicEnabled?: boolean;
  agentState?: string;
  mediaStream?: MediaStream | null;
  onRequireAuth?: () => void;
  activeAgent?: string | null;
  compressing?: boolean;
  selectedAgent?: { type: "cloud"; agentId: string } | null;
  onDisconnectAgent?: () => Promise<{ success: boolean; error?: string }>;
  onConnectCloudAgent?: (
    agentId: string,
    apiKey?: string,
  ) => Promise<{ success: boolean; error?: string }>;
}

export function ChatInput({
  onSend,
  onStop,
  onToggleVoice,
  onToggleTasks,
  onToggleMute,
  isLoading = false,
  disabled = false,
  showVoiceToggle = false,
  isTasksView = false,
  isVoiceMode = false,
  isMicEnabled = true,
  agentState,
  mediaStream,
  onRequireAuth,
  activeAgent,
  compressing = false,
  selectedAgent = null,
  onDisconnectAgent,
  onConnectCloudAgent,
}: ChatInputProps) {
  const [input, setInput] = useState("");
  const submitInProgress = useRef(false);

  // Handle pending message from localStorage
  useEffect(() => {
    const pendingMessage = localStorage.getItem("heyatlas_pending_message");
    console.log("Pending message:", pendingMessage);
    if (pendingMessage) {
      // Small delay to ensure UI is ready
      setInput(pendingMessage);
      localStorage.removeItem("heyatlas_pending_message");
    }
  }, []);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || disabled) return;
    if (submitInProgress.current) return;
    submitInProgress.current = true;
    onSend(input.trim());
    setInput("");
    // Reset after a short delay to prevent duplicate submissions
    setTimeout(() => {
      submitInProgress.current = false;
    }, 100);
  };

  // Map agent state to visualizer state
  const visualizerState: AgentState | undefined = useMemo(() => {
    if (!agentState) return undefined;
    const stateMap: Record<string, AgentState> = {
      connecting: "connecting",
      listening: "listening",
      thinking: "thinking",
      speaking: "speaking",
    };
    return stateMap[agentState] as AgentState;
  }, [agentState]);

  // Get state text for display
  const stateText = useMemo(() => {
    if (!agentState) return "Connecting...";
    const textMap: Record<string, string> = {
      connecting: "Connecting...",
      listening: "Listening",
      thinking: "Thinking",
      speaking: "Speaking",
    };
    return textMap[agentState] || "Ready";
  }, [agentState]);

  return (
    <div className="relative w-full">
      {/* Status Banner - Only show when compressing memory */}
      <div
        className={cn(
          "absolute right-0 bottom-full left-0 z-10 mx-auto w-[95%] overflow-hidden transition-all duration-300 ease-in-out",
          compressing
            ? "max-h-16 translate-y-0 opacity-100"
            : "max-h-0 translate-y-2 opacity-0",
        )}
      >
        <div className="flex h-8 items-center justify-between rounded-t-sm border-2 border-b-0 border-amber-500/30 bg-amber-500/20 px-3">
          <div className="flex items-center gap-2">
            <span className="text-foreground text-[10px] font-medium tracking-widest">
              Compressing Memory...
            </span>
          </div>

          <Shimmer className="text-foreground text-[10px] tracking-widest">
            In Progress
          </Shimmer>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-muted/30 focus-within:border-primary/30 relative overflow-hidden rounded-xl border-2 shadow-md transition-all"
      >
        <TextareaAutosize
          value={input}
          onChange={(e) => setInput(e.target.value)}
          minRows={2}
          maxRows={8}
          className="placeholder:text-muted-foreground/50 w-full resize-none bg-transparent px-6 py-4 text-base outline-none"
          placeholder="Send a message..."
          disabled={disabled || isLoading}
          onKeyDown={(e) => {
            // Prevent Enter from creating new lines - submit is handled by form onSubmit
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              // Trigger form submission
              (e.currentTarget.form as HTMLFormElement)?.requestSubmit();
            }
          }}
        />

        <div className="flex items-center justify-between px-4 pt-1 pb-3">
          <div className="flex items-center gap-2">
            {/* Agent Selector */}
            {onConnectCloudAgent && (
              <AgentSelector
                selectedAgent={selectedAgent}
                activeAgent={activeAgent}
                onDisconnectAgent={onDisconnectAgent}
                onConnectCloudAgent={onConnectCloudAgent}
                disabled={disabled || isLoading}
              />
            )}

            {onToggleTasks && (
              <RevealButton
                icon={
                  isTasksView ? (
                    <MessageSquare className="h-5 w-5" />
                  ) : (
                    <LayoutList className="h-5 w-5" />
                  )
                }
                label={isTasksView ? "Text Chat" : "Tasks"}
                onClick={() => {
                  if (onRequireAuth) {
                    onRequireAuth();
                  } else {
                    onToggleTasks();
                  }
                }}
                className={cn(
                  isTasksView
                    ? "bg-primary/20 text-primary"
                    : "bg-secondary/50 text-secondary-foreground hover:bg-primary/10 hover:text-primary",
                )}
              />
            )}

            {/* Voice Button / Voice Control Panel */}
            {showVoiceToggle && onToggleVoice && (
              <>
                {isVoiceMode ? (
                  // Voice Mode: Expanded controls - use fixed height to prevent layout shift
                  <div className="flex h-12 items-center gap-1.5 sm:gap-2">
                    {/* Mute Button */}
                    <Button
                      variant={isMicEnabled ? "default" : "secondary"}
                      size="icon"
                      onClick={onToggleMute}
                      className={cn(
                        "h-9 w-9 shrink-0 cursor-pointer rounded-full sm:h-10 sm:w-10",
                        isMicEnabled && visualizerState === "listening"
                          ? "bg-green-600 text-white hover:bg-green-700"
                          : "",
                      )}
                      title={isMicEnabled ? "Mute" : "Unmute"}
                    >
                      {isMicEnabled ? (
                        <Mic className="h-4 w-4 sm:h-5 sm:w-5" />
                      ) : (
                        <MicOff className="h-4 w-4 sm:h-5 sm:w-5" />
                      )}
                    </Button>

                    {/* Bar Visualizer with State Text */}
                    <div className="flex shrink-0 flex-col items-center gap-0.5">
                      <div className="w-20 sm:w-36">
                        <BarVisualizer
                          state={visualizerState}
                          barCount={8}
                          mediaStream={mediaStream}
                          minHeight={15}
                          maxHeight={100}
                          demo={
                            visualizerState === "speaking" ||
                            visualizerState === "thinking"
                          }
                          className="bg-secondary/30 h-10 w-full rounded-md px-1.5 sm:h-12 sm:px-2"
                        />
                      </div>
                      <span className="text-muted-foreground text-[9px] font-medium sm:text-[10px]">
                        {stateText}
                      </span>
                    </div>

                    {/* Stop Button with Reveal */}
                    <RevealButton
                      icon={
                        <div className="flex h-5 w-5 items-center justify-center">
                          <Square className="h-3.5 w-3.5 fill-current" />
                        </div>
                      }
                      label="End Voice"
                      onClick={onToggleVoice}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90 shrink-0"
                    />
                  </div>
                ) : (
                  // Normal Mode: Single voice button
                  <RevealButton
                    icon={<VoiceIcon />}
                    label="Voice"
                    onClick={() => {
                      if (onRequireAuth) {
                        onRequireAuth();
                      } else {
                        onToggleVoice();
                      }
                    }}
                    className="bg-secondary/50 text-secondary-foreground hover:bg-primary/10 hover:text-primary"
                  />
                )}
              </>
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
      
      {/* Minimal footer - like ChatGPT/Claude */}
      <div className="text-muted-foreground mt-2 flex items-center justify-center gap-3 text-[10px]">
        <span>© 2025 HeyAtlas</span>
        <span>·</span>
        <a href="/privacy" className="hover:text-foreground transition-colors">
          Privacy
        </a>
        <span>·</span>
        <a href="/terms" className="hover:text-foreground transition-colors">
          Terms
        </a>
      </div>
    </div>
  );
}
