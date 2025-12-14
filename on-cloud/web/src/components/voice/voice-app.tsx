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

interface VoiceAppProps {
  userId?: string;
}

export function VoiceApp({ userId }: VoiceAppProps) {
  const room = useMemo(() => new Room(), []);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [vncUrl, setVncUrl] = useState<string | null>(null);
  const [logUrl, setLogUrl] = useState<string | null>(null);
  const {
    error: connectionError,
    refreshConnectionDetails,
    existingOrRefreshConnectionDetails,
  } = useConnectionDetails();

  const handleStartSession = () => {
    setSessionStarted(true);
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
      <main className="relative min-h-screen bg-background">
        <RoomAudioRenderer />

        <SessionView
          onStartSession={handleStartSession}
          sessionStarted={sessionStarted}
          vncUrl={vncUrl ?? undefined}
          logUrl={logUrl ?? undefined}
          userId={userId}
        />
      </main>
    </RoomContext.Provider>
  );
}
