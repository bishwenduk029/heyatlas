import type * as Party from "partykit/server";

const AUTH_API_BASE = process.env.AUTH_API_BASE || "https://www.heyatlas.app";

export default class Server implements Party.Server {
  constructor(readonly room: Party.Room) {}

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
        const serverApiKey =
          (lobby.env.NIRMANUS_API_KEY as string) ||
          process.env.NIRMANUS_API_KEY;
        if (apiKey === serverApiKey) {
          request.headers.set("X-User-ID", "voice-agent");
          request.headers.set("X-Role", "voice");
          return request;
        }
        return new Response("Unauthorized: Invalid API key", { status: 401 });
      }

      // Client auth via bearer token (for CLI)
      if (!token) {
        return new Response("Unauthorized: Missing token", { status: 401 });
      }

      // Verify token against auth API
      const apiBase = (lobby.env.AUTH_API_BASE as string) || AUTH_API_BASE;
      const response = await fetch(`${apiBase}/api/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        return new Response("Unauthorized: Invalid token", { status: 401 });
      }

      const user = await response.json();

      // Verify user is connecting to their own room
      const roomId = lobby.id;
      if (user.id !== roomId && user.roomId !== roomId) {
        return new Response("Forbidden: Room access denied", { status: 403 });
      }

      // Pass user info to onConnect via headers
      request.headers.set("X-User-ID", user.id);
      request.headers.set("X-User-Email", user.email || "");

      return request;
    } catch (error) {
      console.error("Auth error:", error);
      return new Response("Unauthorized: Auth verification failed", {
        status: 401,
      });
    }
  }

  onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    const userId = ctx.request.headers.get("X-User-ID");
    console.log(
      `Connected: ${conn.id} (user: ${userId}) from ${ctx.request.url}`,
    );
  }

  onMessage(message: string | ArrayBuffer, sender: Party.Connection) {
    // Simple relay: broadcast everything to everyone else
    // Clients will filter based on event type ("tasks" vs "task-update")
    this.room.broadcast(message, [sender.id]);

    // Optional: Log specific message types for debugging
    if (typeof message === "string") {
      try {
        const data = JSON.parse(message);
        console.log(`Relaying ${data.type} from ${sender.id}`);
      } catch (e) {
        // Ignore parsing errors for logging
      }
    }
  }

  async onRequest(request: Party.Request): Promise<Response> {
    // Handle HTTP POST from E2B sandbox (agent-smith)
    if (request.method === "POST") {
      try {
        // Validate sandbox callback token
        const authHeader = request.headers.get("Authorization");
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
          return new Response("Unauthorized: Missing token", { status: 401 });
        }

        const sandboxToken = authHeader.slice(7);

        // Validate token against web API
        const apiBase =
          (this.room.env.AUTH_API_BASE as string) || AUTH_API_BASE;
        const response = await fetch(
          `${apiBase}/api/user/virtual-key/validate`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sandboxToken, roomId: this.room.id }),
          },
        );

        if (!response.ok) {
          return new Response("Unauthorized: Invalid sandbox token", {
            status: 401,
          });
        }

        // Parse and broadcast the message
        const body = await request.json();
        this.room.broadcast(JSON.stringify(body));
        console.log(`HTTP broadcast: ${body.type} from sandbox`);

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("HTTP request error:", error);
        return new Response("Internal server error", { status: 500 });
      }
    }

    return new Response("Method not allowed", { status: 405 });
  }
}
