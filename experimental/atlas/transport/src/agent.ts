import type * as Party from "partykit/server";

const AUTH_API_BASE = process.env.AUTH_API_BASE || "https://www.heyatlas.app";
const VOLTAGENT_URL = process.env.VOLTAGENT_URL || "http://localhost:8788";

interface UserCredentials {
  userId: string;
  email?: string;
  providerApiKey: string;
  providerApiUrl: string;
}

export default class Server implements Party.Server {
  private userCredentials: UserCredentials | null = null;

  constructor(readonly room: Party.Room) {}

  async onStart() {
    // Restore credentials from storage if available
    const stored = await this.room.storage.get<UserCredentials>("credentials");
    if (stored) {
      this.userCredentials = stored;
      console.log(`[Atlas] Restored credentials for room ${this.room.id}`);
    }
  }

  private async storeCredentials(credentials: UserCredentials) {
    this.userCredentials = credentials;
    await this.room.storage.put("credentials", credentials);
  }

  static async onBeforeConnect(
    request: Party.Request,
    lobby: Party.Lobby,
  ): Promise<Party.Request | Response> {
    try {
      const url = new URL(request.url);
      const token = url.searchParams.get("token");
      const apiKey = url.searchParams.get("apiKey");
      const role = url.searchParams.get("role");

      // Server-to-server auth via API key (for voice agent)
      if (apiKey && role === "voice") {
        const serverApiKey = (lobby.env.NIRMANUS_API_KEY as string) || process.env.NIRMANUS_API_KEY;
        if (apiKey === serverApiKey) {
          request.headers.set("X-User-ID", "voice-agent");
          request.headers.set("X-Role", "voice");
          // Voice agent uses system credentials
          request.headers.set("X-Provider-API-Key", (lobby.env.HEYATLAS_PROVIDER_API_KEY as string) || "");
          request.headers.set("X-Provider-API-URL", (lobby.env.HEYATLAS_PROVIDER_API_URL as string) || "");
          return request;
        }
        return new Response("Unauthorized: Invalid API key", { status: 401 });
      }

      // Client auth via bearer token
      if (!token) {
        return new Response("Unauthorized: Missing token", { status: 401 });
      }

      const apiBase = (lobby.env.AUTH_API_BASE as string) || AUTH_API_BASE;
      const response = await fetch(`${apiBase}/api/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        return new Response("Unauthorized: Invalid token", { status: 401 });
      }

      const user = (await response.json()) as {
        id: string;
        email?: string;
        roomId?: string;
        virtualKey?: { apiKey: string; apiUrl: string };
      };

      // Verify user is connecting to their own room
      const roomId = lobby.id;
      if (user.id !== roomId && user.roomId !== roomId) {
        return new Response("Forbidden: Room access denied", { status: 403 });
      }

      request.headers.set("X-User-ID", user.id);
      request.headers.set("X-User-Email", user.email || "");
      
      // Pass user's virtual key credentials (or fallback to system credentials)
      if (user.virtualKey) {
        request.headers.set("X-Provider-API-Key", user.virtualKey.apiKey);
        request.headers.set("X-Provider-API-URL", user.virtualKey.apiUrl);
      } else {
        // Fallback to system credentials if user doesn't have virtual key
        request.headers.set("X-Provider-API-Key", (lobby.env.HEYATLAS_PROVIDER_API_KEY as string) || "");
        request.headers.set("X-Provider-API-URL", (lobby.env.HEYATLAS_PROVIDER_API_URL as string) || "");
      }

      return request;
    } catch (error) {
      console.error("Auth error:", error);
      return new Response("Unauthorized: Auth verification failed", { status: 401 });
    }
  }

  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    const userId = ctx.request.headers.get("X-User-ID") || "";
    const email = ctx.request.headers.get("X-User-Email") || undefined;
    const providerApiKey = ctx.request.headers.get("X-Provider-API-Key") || "";
    const providerApiUrl = ctx.request.headers.get("X-Provider-API-URL") || "";

    // Store credentials in room state
    if (providerApiKey && providerApiUrl) {
      await this.storeCredentials({
        userId,
        email,
        providerApiKey,
        providerApiUrl,
      });
    }

    console.log(`[Atlas] Connected: ${conn.id} (user: ${userId})`);
    conn.send(JSON.stringify({ type: "connected", roomId: this.room.id, userId }));
  }

  onMessage(message: string | ArrayBuffer, sender: Party.Connection) {
    if (typeof message === "string") {
      try {
        const data = JSON.parse(message);
        
        if (data.type === "agent:stream") {
          this.handleAgentStream(data, sender);
          return;
        }

        if (data.type === "agent:text") {
          this.handleAgentText(data, sender);
          return;
        }

        console.log(`[Atlas] Relaying ${data.type} from ${sender.id}`);
      } catch (e) {
        // Ignore parsing errors
      }
    }
    
    this.room.broadcast(message, [sender.id]);
  }

  private getProviderHeaders(): Record<string, string> {
    if (!this.userCredentials) {
      // Fallback to env vars if no user credentials
      return {
        "X-Provider-API-Key": (this.room.env.HEYATLAS_PROVIDER_API_KEY as string) || "",
        "X-Provider-API-URL": (this.room.env.HEYATLAS_PROVIDER_API_URL as string) || "",
      };
    }
    return {
      "X-Provider-API-Key": this.userCredentials.providerApiKey,
      "X-Provider-API-URL": this.userCredentials.providerApiUrl,
      "X-User-ID": this.userCredentials.userId,
    };
  }

  private async handleAgentStream(data: { agentId: string; message: string; historyId?: string }, sender: Party.Connection) {
    const voltAgentUrl = (this.room.env.VOLTAGENT_URL as string) || VOLTAGENT_URL;
    const agentId = data.agentId || "atlas-assistant";
    
    try {
      const response = await fetch(`${voltAgentUrl}/agents/${agentId}/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.getProviderHeaders(),
        },
        body: JSON.stringify({
          input: data.message,
          historyId: data.historyId,
        }),
      });

      if (!response.ok || !response.body) {
        sender.send(JSON.stringify({ type: "agent:error", error: "Stream request failed" }));
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        sender.send(JSON.stringify({ type: "agent:stream:chunk", data: chunk }));
      }

      sender.send(JSON.stringify({ type: "agent:stream:end" }));
    } catch (error) {
      console.error("[Atlas] Stream error:", error);
      sender.send(JSON.stringify({ type: "agent:error", error: String(error) }));
    }
  }

  private async handleAgentText(data: { agentId: string; message: string; historyId?: string }, sender: Party.Connection) {
    const voltAgentUrl = (this.room.env.VOLTAGENT_URL as string) || VOLTAGENT_URL;
    const agentId = data.agentId || "atlas-assistant";
    
    try {
      const response = await fetch(`${voltAgentUrl}/agents/${agentId}/text`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.getProviderHeaders(),
        },
        body: JSON.stringify({
          input: data.message,
          historyId: data.historyId,
        }),
      });

      const result = await response.json();
      sender.send(JSON.stringify({ type: "agent:text:response", data: result }));
    } catch (error) {
      console.error("[Atlas] Text error:", error);
      sender.send(JSON.stringify({ type: "agent:error", error: String(error) }));
    }
  }

  async onRequest(request: Party.Request): Promise<Response> {
    const url = new URL(request.url);
    const voltAgentUrl = (this.room.env.VOLTAGENT_URL as string) || VOLTAGENT_URL;

    // Proxy VoltAgent API requests via ?proxy=/agents/... query param
    const proxyPath = url.searchParams.get("proxy");
    if (proxyPath) {
      const proxyUrl = new URL(proxyPath, voltAgentUrl);
      
      const headers: Record<string, string> = {
        ...this.getProviderHeaders(),
      };
      request.headers.forEach((value, key) => {
        if (key.toLowerCase() !== "host") {
          headers[key] = value;
        }
      });
      headers["X-Room-ID"] = this.room.id;
      
      const response = await fetch(proxyUrl.toString(), {
        method: request.method,
        headers,
        body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
      });

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    }

    // Internal broadcast endpoint for Atlas agent to publish tasks
    const broadcastAction = url.searchParams.get("broadcast");
    if (broadcastAction === "task" && request.method === "POST") {
      try {
        const body = (await request.json()) as { type: string; content: string; agent?: string; source?: string };
        const taskMessage = {
          type: "tasks",
          content: body.content,
          agent: body.agent || "opencode",
          source: body.source || "atlas-assistant",
        };
        this.room.broadcast(JSON.stringify(taskMessage));
        console.log(`[Atlas] Task broadcast: ${body.content.substring(0, 50)}...`);
        return new Response(JSON.stringify({ success: true, message: "Task broadcasted" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("[Atlas] Broadcast error:", error);
        return new Response(JSON.stringify({ success: false, error: String(error) }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Handle GET request for status
    if (request.method === "GET") {
      return new Response(JSON.stringify({
        roomId: this.room.id,
        voltAgentUrl,
        connections: [...this.room.getConnections()].length,
        hasCredentials: !!this.userCredentials,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Handle sandbox callback
    if (request.method === "POST") {
      try {
        const authHeader = request.headers.get("Authorization");
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
          return new Response("Unauthorized: Missing token", { status: 401 });
        }

        const sandboxToken = authHeader.slice(7);
        const apiBase = (this.room.env.AUTH_API_BASE as string) || AUTH_API_BASE;
        
        const validateResponse = await fetch(`${apiBase}/api/user/virtual-key/validate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sandboxToken, roomId: this.room.id }),
        });

        if (!validateResponse.ok) {
          return new Response("Unauthorized: Invalid sandbox token", { status: 401 });
        }

        const body = (await request.json()) as { type: string };
        this.room.broadcast(JSON.stringify(body));
        console.log(`[Atlas] HTTP broadcast: ${body.type} from sandbox`);

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("[Atlas] HTTP request error:", error);
        return new Response("Internal server error", { status: 500 });
      }
    }

    return new Response("Method not allowed", { status: 405 });
  }
}
