import type * as Party from "partykit/server";

export default class Server implements Party.Server {
  constructor(readonly room: Party.Room) {}

  onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    console.log(`Connected: ${conn.id} from ${ctx.request.url}`);
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
}
