import { useMemo } from "react";
import { useAgent } from "agents/react";
import {
  useLocalRuntime,
  type ChatModelAdapter,
  type ChatModelRunResult,
} from "@assistant-ui/react";
import env from "@/env";

export function useAtlasRuntime(userId: string, token: string, agentUrl?: string) {
  const agent = useAgent({
    agent: "atlas-agent",
    name: userId,
    options: {
      host: agentUrl || env.NEXT_PUBLIC_ATLAS_AGENT_URL,
      query: { token },
    },
  });

  const adapter = useMemo<ChatModelAdapter>(() => {
    return {
      async *run({ messages, abortSignal }) {
        if (!agent) return;

        const lastMessage = messages[messages.length - 1];
        if (lastMessage.role !== "user") return;

        const content = lastMessage.content
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join("\n");

        const messageId = crypto.randomUUID();

        // Send message to agent
        agent.send(
          JSON.stringify({
            type: "stream",
            content,
            messageId,
          })
        );

        let accumulatedText = "";

        // Create a queue to handle incoming chunks
        const queue: (string | null)[] = [];
        let resolveQueue: (() => void) | null = null;

        const onMessage = (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            if (data.messageId !== messageId) return;

            if (data.type === "stream:chunk") {
              queue.push(data.content);
              if (resolveQueue) {
                resolveQueue();
                resolveQueue = null;
              }
            } else if (data.type === "stream:end") {
              queue.push(null); // Signal end
              if (resolveQueue) {
                resolveQueue();
                resolveQueue = null;
              }
            }
          } catch (e) {
            console.error("Failed to parse message", e);
          }
        };

        agent.addEventListener("message", onMessage);

        try {
          while (true) {
            if (queue.length === 0) {
              await new Promise<void>((resolve) => {
                resolveQueue = resolve;
              });
            }

            const chunk = queue.shift();
            if (chunk === null) break;
            if (chunk === undefined) continue;

            accumulatedText += chunk;

            yield {
              content: [
                {
                  type: "text",
                  text: accumulatedText,
                },
              ],
            };
          }
        } finally {
          agent.removeEventListener("message", onMessage);
        }
      },
    };
  }, [agent]);

  return useLocalRuntime(adapter);
}
