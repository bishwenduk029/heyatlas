"use client";

import { useEffect } from "react";
import { useRoomContext } from "@livekit/components-react";

interface MCPUIMessage {
  type: "mcp-ui-submit" | "mcp-ui-cancel";
  data?: {
    userInput: string;
    timestamp: string;
  };
}

/**
 * MCPUIHandler listens for text submissions from MCP UI Server forms
 * and sends them to the voice agent via LiveKit's lk.chat text stream.
 *
 * This component handles the communication bridge between:
 * 1. MCP UI Server iframe (displays text input form)
 * 2. Voice Agent (processes text input through TextInputEvent callback)
 */
export function MCPUIHandler() {
  const room = useRoomContext();

  useEffect(() => {
    if (!room) {
      console.warn("[MCPUIHandler] Room context not available");
      return;
    }

    const handleMessage = async (event: MessageEvent<MCPUIMessage>) => {
      // Security: Validate origin in production
      // const mcp_ui_origin = process.env.REACT_APP_MCP_UI_SERVER_ORIGIN;
      // if (event.origin !== mcp_ui_origin) {
      //   logger.warn(`[MCPUIHandler] Invalid origin: ${event.origin}`);
      //   return;
      // }

      if (event.data?.type === "mcp-ui-submit" && event.data?.data) {
        const { userInput, timestamp } = event.data.data;

        try {
          // Send user input to LiveKit room via lk.chat topic
          // This text is received by the voice agent's text_input_cb callback
          await room.localParticipant.sendText(userInput, {
            topic: "lk.chat",
          });

          console.info(
            `[MCPUIHandler] Sent text to lk.chat at ${timestamp}: "${userInput}"`
          );
        } catch (error) {
          console.error("[MCPUIHandler] Failed to send text to lk.chat:", error);
        }
      } else if (event.data?.type === "mcp-ui-cancel") {
        console.info("[MCPUIHandler] User cancelled text input");
        // Optional: Notify agent of cancellation
        // await room.localParticipant.sendText("User cancelled input", {
        //   topic: "lk.internal.mcp-ui",
        // });
      }
    };

    window.addEventListener("message", handleMessage);
    console.debug("[MCPUIHandler] Listener registered for postMessage events");

    return () => {
      window.removeEventListener("message", handleMessage);
      console.debug("[MCPUIHandler] Listener removed");
    };
  }, [room]);

  // This component doesn't render anything, it's purely a communication handler
  return null;
}
