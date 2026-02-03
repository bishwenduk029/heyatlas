/**
 * Web Search Tool using Parallel Web API
 * 
 * Creates a search tool with the provided API key, avoiding re-initialization.
 */
import { tool } from "ai";
import { z } from "zod";
import { Parallel } from "parallel-web";

/**
 * Creates a web search tool with the provided API key.
 * Initialize the Parallel client once and reuse it.
 */
export function createWebSearchTool(apiKey: string) {
  const parallel = new Parallel({ apiKey });

  return tool({
    description:
      "Search the web for current information. Use for factual questions, recent events, or when you need up-to-date data.",
    inputSchema: z.object({
      objective: z
        .string()
        .describe("What you want to find out from the web"),
    }),
    execute: async ({ objective }) => {
      const results = await parallel.beta.search({
        objective,
        max_results: 10,
        search_queries: undefined,
        // "base" works best for apps where speed is important, while "pro" is better when freshness and content-quality is critical
        processor: "base",
        source_policy: {
          exclude_domains: undefined,
          include_domains: undefined,
        },
        max_chars_per_result: 5000,
      });
      return results;
    },
  });
}
