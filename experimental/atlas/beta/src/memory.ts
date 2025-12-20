/**
 * Mem0 Memory Client for Atlas Agent
 * 
 * Uses Mem0 Platform SDK for memory storage and retrieval.
 * Caches persona in Durable Object state.
 * 
 * @see https://docs.mem0.ai/platform/quickstart
 */

import { MemoryClient } from "mem0ai";

// Re-export MemoryClient for use in agent
export { MemoryClient };

// Types for memory operations
export interface MemoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface MemorySearchResult {
  id: string;
  memory: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Create a Mem0 client instance
 */
export function createMemoryClient(apiKey: string): MemoryClient {
  return new MemoryClient({ apiKey });
}

/**
 * Add memories from messages
 */
export async function addMemory(
  client: MemoryClient,
  messages: MemoryMessage[],
  userId: string
): Promise<void> {
  await client.add(messages, { user_id: userId });
}

/**
 * Search memories for a user
 */
export async function searchMemories(
  client: MemoryClient,
  query: string,
  userId: string,
  limit: number = 5
): Promise<MemorySearchResult[]> {
  const results = await client.search(query, { user_id: userId, limit });
  return results as MemorySearchResult[];
}

/**
 * Get all memories for a user
 */
export async function getAllMemories(
  client: MemoryClient,
  userId: string
): Promise<MemorySearchResult[]> {
  const results = await client.getAll({ user_id: userId });
  return results as MemorySearchResult[];
}

/**
 * Generate user persona from memories
 */
export async function generatePersona(
  client: MemoryClient,
  userId: string
): Promise<string> {
  try {
    const memories = await getAllMemories(client, userId);
    
    if (!memories || memories.length === 0) {
      return "";
    }

    const personaPoints = memories
      .slice(0, 10)
      .map(m => `- ${m.memory}`)
      .join("\n");

    return `<userMemories>\n${personaPoints}\n</userMemories>`;
  } catch (error) {
    console.error("[Mem0] Error generating persona:", error);
    return "";
  }
}

// Persona cache configuration
export const PERSONA_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export interface PersonaCache {
  persona: string;
  updatedAt: number;
}

/**
 * Check if cached persona is still valid
 */
export function isPersonaCacheValid(cache: PersonaCache | null): boolean {
  if (!cache) return false;
  return Date.now() - cache.updatedAt < PERSONA_CACHE_TTL;
}

/**
 * Create a new persona cache entry
 */
export function createPersonaCache(persona: string): PersonaCache {
  return {
    persona,
    updatedAt: Date.now(),
  };
}
