"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { Room, RoomEvent } from "livekit-client";
import { RoomAudioRenderer, RoomContext } from "@livekit/components-react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import useConnectionDetails from "@/hooks/useConnectionDetails";
import { Header } from "../homepage/header";
import { Footer } from "./footer";
import { MCPUIHandler } from "./mcp-ui-handler";
import { useAtlasAgent } from "./hooks/use-atlas-agent";
import { SessionLayout } from "./session-layout";

interface InterfaceWithAgentProps {
  userId: string;
  token: string;
  mode: "local" | "sandbox";
}

export function InterfaceWithAgent({
  userId,
  token,
  mode,
}: InterfaceWithAgentProps) {
  const room = useMemo(() => new Room(), []);
  const [voiceSessionStarted, setVoiceSessionStarted] = useState(false);
  const [isChatMode, setIsChatMode] = useState(true); // Default to chat mode

  const {
    error: connectionError,
    refreshConnectionDetails,
    existingOrRefreshConnectionDetails,
  } = useConnectionDetails();

  // Atlas agent connection (always connected for state sync)
  const atlasAgent = useAtlasAgent({
    userId,
    token,
  });

  // VNC URL comes from agent state (sandbox creation)
  const vncUrl = atlasAgent.vncUrl;
  const logUrl = atlasAgent.logsUrl;

  const handleToggleMode = useCallback(() => {
    if (isChatMode) {
      // Switching from chat to voice: start voice session and switch mode
      setVoiceSessionStarted(true);
      setIsChatMode(false);
    } else {
      // Switching from voice to chat: disconnect voice and switch mode
      if (room.state !== "disconnected") {
        room.disconnect();
      }
      setVoiceSessionStarted(false);
      setIsChatMode(true);
    }
  }, [isChatMode, room]);

  const handleStartVoiceSession = useCallback(() => {
    setVoiceSessionStarted(true);
  }, []);

  // Show connection errors
  useEffect(() => {
    if (connectionError) {
      toast.error("Connection Error", { description: connectionError.message });
    }
  }, [connectionError]);

  // LiveKit room events
  useEffect(() => {
    const onDisconnected = () => {
      setVoiceSessionStarted(false);
      refreshConnectionDetails();
    };

    const onMediaDevicesError = (error: Error) => {
      toast.error("Media device error", {
        description: `${error.name}: ${error.message}`,
      });
    };

    room.on(RoomEvent.MediaDevicesError, onMediaDevicesError);
    room.on(RoomEvent.Disconnected, onDisconnected);

    return () => {
      room.off(RoomEvent.Disconnected, onDisconnected);
      room.off(RoomEvent.MediaDevicesError, onMediaDevicesError);
    };
  }, [room, refreshConnectionDetails]);

  // Connect to LiveKit when voice session starts
  useEffect(() => {
    if (!voiceSessionStarted || room.state !== "disconnected") return;

    let aborted = false;

    Promise.all([
      room.localParticipant.setMicrophoneEnabled(true, undefined, {
        preConnectBuffer: true,
      }),
      existingOrRefreshConnectionDetails().then((details) =>
        room.connect(details.serverUrl, details.participantToken),
      ),
    ]).catch((error) => {
      if (aborted) return;
      toast.error("Connection error", {
        description: `${error.name}: ${error.message}`,
      });
    });

    return () => {
      aborted = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceSessionStarted]);

  // Send chat message (wraps agent's sendMessage)
  const handleSendMessage = useCallback(
    async (text: string) => {
      if (!atlasAgent.isConnected) return;
      await atlasAgent.sendMessage({
        role: "user",
        parts: [{ type: "text", text }],
      });
    },
    [atlasAgent],
  );

  // Handle pending message from localStorage
  useEffect(() => {
    if (!atlasAgent.isConnected) return;

    const pendingMessage = localStorage.getItem("heyatlas_pending_message");
    if (pendingMessage) {
      // Small delay to ensure UI is ready
      setTimeout(() => {
        handleSendMessage(pendingMessage);
        localStorage.removeItem("heyatlas_pending_message");
      }, 500);
    }
  }, [atlasAgent.isConnected, handleSendMessage]);

  // Connect to LiveKit when voice session starts
  useEffect(() => {
    if (!voiceSessionStarted || room.state !== "disconnected") {
      return;
    }

    let aborted = false;

    Promise.all([
      room.localParticipant.setMicrophoneEnabled(true, undefined, {
        preConnectBuffer: true,
      }),
      existingOrRefreshConnectionDetails().then((details) =>
        room.connect(details.serverUrl, details.participantToken),
      ),
    ]).catch((error) => {
      if (aborted) return;
      toast.error("Connection error", {
        description: `${error.name}: ${error.message}`,
      });
    });

    return () => {
      aborted = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceSessionStarted]);

  return (
    <RoomContext.Provider value={room}>
      <MCPUIHandler />
      <main className="bg-background flex h-screen supports-[height:100dvh]:h-[100dvh] flex-col">
        <Header />
        <div className="my-2 flex min-h-0 flex-1 flex-col">
          <RoomAudioRenderer />
          <SessionLayout
            mode={mode}
            isChatMode={isChatMode}
            voiceSessionStarted={voiceSessionStarted}
            onStartVoiceSession={handleStartVoiceSession}
            onToggleMode={handleToggleMode}
            onDisconnectVoice={() => room.disconnect()}
            vncUrl={vncUrl || undefined}
            logUrl={logUrl || undefined}
            userId={userId}
            messages={atlasAgent.messages}
            onSendMessage={handleSendMessage}
            onStopChat={atlasAgent.stop}
            isChatLoading={atlasAgent.isLoading}
            isChatConnected={atlasAgent.isConnected}
            tasks={atlasAgent.tasks}
            getTaskEphemeralEvents={atlasAgent.getTaskEphemeralEvents}
            connectedAgentId={atlasAgent.connectedAgentId}
            compressing={atlasAgent.compressing}
          />
        </div>
        <Footer />
      </main>
    </RoomContext.Provider>
  );
}
