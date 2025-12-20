"use client";

import { useEffect, useMemo, useState } from "react";
import { Room, RoomEvent, RpcError, RpcInvocationData } from "livekit-client";
import {
  RoomAudioRenderer,
  RoomContext,
} from "@livekit/components-react";
import { SessionView } from "@/components/voice/session-view";
import { MCPUIHandler } from "@/components/voice/mcp-ui-handler";
import useConnectionDetails from "@/hooks/useConnectionDetails";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { AssistantChat } from "./assistant-chat";
import { Button } from "@/components/ui/button";
import { Keyboard, Mic } from "lucide-react";
import useAgentToken from "@/hooks/useAgentToken";
import { Header } from "../homepage/header";
import { Footer } from "./footer";

interface VoiceAppProps {
  userId?: string;
  mode?: "local" | "sandbox"; // local = CLI agent, sandbox = e2b desktop
}

export function VoiceApp({ userId, mode = "local" }: VoiceAppProps) {
  const room = useMemo(() => new Room(), []);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [vncUrl, setVncUrl] = useState<string | null>(null);
  const [logUrl, setLogUrl] = useState<string | null>(null);
  const [isChatMode, setIsChatMode] = useState(false);
  const { token: agentToken } = useAgentToken();

  const {
    error: connectionError,
    refreshConnectionDetails,
    existingOrRefreshConnectionDetails,
  } = useConnectionDetails();

  const handleStartSession = () => {
    setSessionStarted(true);
  };

  const handleToggleChat = () => {
    setIsChatMode((prev) => !prev);
  };

  // Debug log
  useEffect(() => {
    console.log("VoiceApp mounted, sessionStarted:", sessionStarted);
  }, [sessionStarted]);

  // Show connection errors
  useEffect(() => {
    if (connectionError) {
      toast.error("Connection Error", {
        description: connectionError.message,
      });
    }
  }, [connectionError]);

  useEffect(() => {
    const onDisconnected = () => {
      console.log("🔴 Room disconnected");
      setSessionStarted(false);
      setVncUrl(null);
      setLogUrl(null);
      refreshConnectionDetails();
    };

    const onMediaDevicesError = (error: Error) => {
      console.error("🎤 Media device error:", error);
      toast.error("Encountered an error with your media devices", {
        description: `${error.name}: ${error.message}`,
      });
    };

    const onConnected = () => {
      console.log("🟢 Room connected");

      // Register RPC method when connected
      room.localParticipant.registerRpcMethod(
        'displayVncStream',
        async (data: RpcInvocationData) => {
          try {
            const params = JSON.parse(data.payload);
            const vncUrl = params.vncUrl;
            const logUrl = params.logUrl ?? null;

            if (vncUrl) {
              console.log("🖥️ Display VNC stream:", vncUrl);
              setVncUrl(vncUrl);
              setLogUrl(logUrl);

              return JSON.stringify({
                success: true,
                message: "VNC stream displayed successfully"
              });
            } else {
              throw new RpcError(1, "No VNC URL provided");
            }
          } catch (error) {
            console.error("❌ VNC display error:", error);
            throw new RpcError(1, "Could not display VNC stream");
          }
        }
      );
    };

    room.on(RoomEvent.Connected, onConnected);
    room.on(RoomEvent.MediaDevicesError, onMediaDevicesError);
    room.on(RoomEvent.Disconnected, onDisconnected);

    return () => {
      room.off(RoomEvent.Connected, onConnected);
      room.off(RoomEvent.Disconnected, onDisconnected);
      room.off(RoomEvent.MediaDevicesError, onMediaDevicesError);
    };
  }, [room, refreshConnectionDetails]);

  useEffect(() => {
    let aborted = false;

    if (!sessionStarted) {
      return;
    }

    if (room.state === "disconnected") {
      console.log("🔌 Connecting to LiveKit room...");

      Promise.all([
        room.localParticipant.setMicrophoneEnabled(true, undefined, {
          preConnectBuffer: true,
        }),
        existingOrRefreshConnectionDetails().then((connectionDetails) => {
          console.log("🎫 Got connection token, connecting...");
          return room.connect(
            connectionDetails.serverUrl,
            connectionDetails.participantToken
          );
        }),
      ])
        .then(() => {
          console.log("✅ Connected to room successfully");
        })
        .catch((error) => {
          if (aborted) {
            return;
          }
          console.error("❌ Connection error:", error);
          toast.error("There was an error connecting to the agent", {
            description: `${error.name}: ${error.message}`,
          });
        });
    }

    return () => {
      aborted = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStarted]); // Removed room and callback from dependencies to prevent reconnection loop

  return (
    <RoomContext.Provider value={room}>
      <MCPUIHandler />
      <main className="h-screen bg-background flex flex-col overflow-hidden">
        <Header />
        <div className="flex-1 overflow-hidden flex flex-col m-2">
          <AnimatePresence mode="wait">
            {!isChatMode || mode === "sandbox" ? (
              <motion.div
                key="voice"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="flex-1 flex flex-col"
              >
                <RoomAudioRenderer />
                <SessionView
                  onStartSession={handleStartSession}
                  sessionStarted={sessionStarted}
                  vncUrl={vncUrl ?? undefined}
                  logUrl={logUrl ?? undefined}
                  userId={userId}
                  mode={mode}
                  onToggleChat={handleToggleChat}
                  isChatMode={isChatMode}
                  agentToken={agentToken}
                />
              </motion.div>
            ) : (
              <motion.div
                key="chat"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="flex-1 h-full flex flex-col"
              >
                {agentToken ? (
                  <div className="flex-1 relative flex flex-col h-full">
                    <AssistantChat userId={userId || "user"} token={agentToken} onToggleMode={handleToggleChat} />
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <Footer />
      </main>
    </RoomContext.Provider>
  );
}
