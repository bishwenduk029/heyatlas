"use client";

import React, { useState, useEffect } from "react";

interface UIActionResult {
  type: "tool" | "prompt" | "link" | "intent" | "notify";
  payload: Record<string, unknown>;
  messageId?: string;
}

interface UIResource {
  uri: string;
  mimeType: string;
  text?: string;
  blob?: string; // base64-encoded
}

interface MCPResourceRendererProps {
  resource: UIResource | null;
  onUIAction?: (action: UIActionResult) => Promise<unknown>;
  onClose?: () => void;
}

/**
 * Renders MCP-UI resources (HTML forms, remote DOM components, etc.)
 * Handles communication between the iframe and host application via postMessage
 */
export function MCPResourceRenderer({
  resource,
  onUIAction,
  onClose,
}: MCPResourceRendererProps) {
  const [pendingRequests, setPendingRequests] = useState<Map<string, unknown>>(
    new Map()
  );

  useEffect(() => {
    if (!resource) return;

    const handleMessage = async (event: MessageEvent) => {
      const { type, messageId, payload } = event.data;

      // Handle UI actions from iframe
      if (type === "tool" || type === "prompt" || type === "link" || type === "intent" || type === "notify") {
        const actionResult: UIActionResult = {
          type: type as UIActionResult["type"],
          payload,
          ...(messageId && { messageId }),
        };

        try {
          if (onUIAction) {
            const response = await onUIAction(actionResult);
            if (messageId) {
              event.source?.postMessage(
                {
                  type: "ui-message-response",
                  messageId,
                  payload: { response },
                },
                { targetOrigin: "*" }
              );
            }
          }
        } catch (error) {
          if (messageId) {
            event.source?.postMessage(
              {
                type: "ui-message-response",
                messageId,
                payload: { error },
              },
              { targetOrigin: "*" }
            );
          }
        }
      }

      // Handle render data requests
      if (type === "ui-request-render-data" && messageId) {
        event.source?.postMessage(
          {
            type: "ui-lifecycle-iframe-render-data",
            messageId,
            payload: {
              renderData: {
                // Pass any custom theme/render data here
                theme: "light",
              },
            },
          },
          { targetOrigin: "*" }
        );
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [resource, onUIAction]);

  if (!resource) {
    return null;
  }

  const isExternalUrl = resource.mimeType === "text/uri-list";
  const isRemoteDom = resource.mimeType?.includes(
    "application/vnd.mcp-ui.remote-dom"
  );

  // For external URLs, navigate directly
  if (isExternalUrl && resource.text) {
    return (
      <iframe
        src={resource.text}
        className="w-full h-full border-0 rounded-lg"
        title="External MCP Resource"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
    );
  }

  // For HTML resources, render in sandboxed iframe
  const htmlContent = resource.blob
    ? atob(resource.blob)
    : resource.text || "";

  const dataUrl = `data:text/html;base64,${btoa(htmlContent)}`;

  return (
    <iframe
      src={dataUrl}
      className="w-full h-full border-0 rounded-lg"
      title="MCP Resource"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      style={{ background: "transparent" }}
    />
  );
}
