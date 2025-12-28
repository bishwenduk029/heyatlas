"use client";

import { useState, useMemo } from "react";
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
import type { AgentState } from "@/components/ui/bar-visualizer";
import { Track } from "livekit-client";
import { useLocalParticipant } from "@livekit/components-react";

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
  connectedAgentId?: string | null;
  compressing?: boolean;
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
  connectedAgentId,
  compressing = false,
}: ChatInputProps) {
  const [input, setInput] = useState("");
  
  // LiveKit local participant for mute control
  const { localParticipant } = useLocalParticipant();
  
  const isMicrophoneEnabled =
    localParticipant?.getTrackPublication(Track.Source.Microphone)?.isMuted === false;

  const toggleMicrophone = async () => {
    if (!localParticipant) return;
    await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || disabled) return;
    onSend(input.trim());
    setInput("");
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
                    ? "bg-primary/10 text-primary"
                    : "bg-secondary text-secondary-foreground hover:text-foreground",
                )}
              />
            )}

            {/* Voice Button / Voice Control Panel */}
            {showVoiceToggle && onToggleVoice && (
              <>
                {isVoiceMode ? (
                  // Voice Mode: Expanded controls replace the voice button
                  <div className="flex items-center gap-2">
                    {/* Mute Button */}
                    <Button
                      variant={isMicrophoneEnabled ? "default" : "secondary"}
                      size="icon"
                      onClick={toggleMicrophone}
                      className={cn(
                        "h-10 w-10 cursor-pointer rounded-full",
                        isMicrophoneEnabled && visualizerState === "listening"
                          ? "bg-green-600 hover:bg-green-700 text-white"
                          : ""
                      )}
                      title={isMicrophoneEnabled ? "Mute" : "Unmute"}
                    >
                      {isMicrophoneEnabled ? (
                        <Mic className="h-5 w-5" />
                      ) : (
                        <MicOff className="h-5 w-5" />
                      )}
                    </Button>

                    {/* Bar Visualizer with State Text */}
                    <div className="flex flex-col items-center gap-0.5">
                      <div className="w-36">
                        <BarVisualizer
                          state={visualizerState}
                          barCount={8}
                          mediaStream={mediaStream}
                          minHeight={15}
                          maxHeight={100}
                          demo={visualizerState === "speaking" || visualizerState === "thinking"}
                          className="bg-secondary/30 h-12 w-full rounded-md px-2"
                        />
                      </div>
                      <span className="text-muted-foreground text-[10px] font-medium">
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
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    />
                  </div>
                ) : (
                  // Normal Mode: Single voice button
                  <RevealButton
                    icon={<Mic className="h-5 w-5" />}
                    label="Voice"
                    onClick={() => {
                      if (onRequireAuth) {
                        onRequireAuth();
                      } else {
                        onToggleVoice();
                      }
                    }}
                    className="bg-secondary text-secondary-foreground hover:text-foreground"
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
    </div>
  );
}
