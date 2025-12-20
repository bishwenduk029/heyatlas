/**
 * OpenAI-compatible completion response builders
 */

interface CompletionResult {
  id: string;
  text: string;
}

export function buildCompletion(result: CompletionResult) {
  return {
    id: result.id,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: "atlas",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: result.text },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

export function createStreamResponse(
  requestId: string,
  textStream: AsyncIterable<string>,
  onComplete: (text: string) => void
): Response {
  const encoder = new TextEncoder();
  let fullText = "";

  const chunk = (content: string | null, done = false) =>
    JSON.stringify({
      id: requestId,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: "atlas",
      choices: [
        {
          index: 0,
          delta: done ? {} : { content },
          finish_reason: done ? "stop" : null,
        },
      ],
    });

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const text of textStream) {
          fullText += text;
          controller.enqueue(encoder.encode(`data: ${chunk(text)}\n\n`));
        }
        controller.enqueue(encoder.encode(`data: ${chunk(null, true)}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        onComplete(fullText);
        controller.close();
      } catch (e) {
        console.error("[Stream] Error:", e);
        controller.error(e);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
