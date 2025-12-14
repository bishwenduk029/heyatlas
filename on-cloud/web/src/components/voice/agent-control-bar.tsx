"use client";

import { Track } from "livekit-client";
import { useLocalParticipant } from "@livekit/components-react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Play } from "lucide-react";
import { cn } from "@/lib/utils";

interface AgentControlBarProps {
  onStartSession?: () => void;
  onDisconnect?: () => void;
  sessionStarted?: boolean;
  agentState?: string;
}

export function AgentControlBar({
  onStartSession,
  onDisconnect,
  sessionStarted,
  agentState,
}: AgentControlBarProps) {
  const { localParticipant } = useLocalParticipant();

  const isMicEnabled =
    localParticipant.getTrackPublication(Track.Source.Microphone)?.isMuted === false;

  const toggleMicrophone = async () => {
    await localParticipant.setMicrophoneEnabled(!isMicEnabled);
  };

  return (
    <div className="flex items-center justify-between">
      {/* Left: Status and Mic Control */}
      <div className="flex items-center gap-4">
        {/* Microphone Button */}
        <Button
          variant={isMicEnabled ? "default" : "secondary"}
          size="icon"
          onClick={toggleMicrophone}
          className="h-12 w-12"
        >
          {isMicEnabled ? (
            <Mic className="h-5 w-5" />
          ) : (
            <MicOff className="h-5 w-5" />
          )}
        </Button>

        {/* Status Indicator */}
        {agentState && agentState !== "disconnected" && (
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "h-2.5 w-2.5 rounded-full",
                agentState === "listening"
                  ? "bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]"
                  : agentState === "thinking"
                    ? "bg-yellow-500 animate-pulse"
                    : agentState === "speaking"
                      ? "bg-blue-500 animate-pulse"
                      : agentState === "connecting"
                        ? "bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]"
                        : "bg-muted-foreground"
              )}
            />
            <span className="text-sm text-muted-foreground">
              {agentState === "listening"
                ? "Listening..."
                : agentState === "thinking"
                  ? "Thinking..."
                  : agentState === "speaking"
                    ? "Speaking..."
                    : agentState === "connecting"
                      ? "Connecting..."
                      : "Ready"}
            </span>
          </div>
        )}
      </div>

      {/* Right: Start/End Button */}
      {!sessionStarted ? (
        <Button
          variant="default"
          onClick={onStartSession}
        >
          <Play className="mr-2 h-4 w-4" />
          Start Voice Interaction
        </Button>
      ) : (
        <Button
          variant="destructive"
          onClick={onDisconnect}
        >
          End Session
        </Button>
      )}
    </div>
  );
}
