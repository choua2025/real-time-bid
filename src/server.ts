import http from "node:http";
import { Server } from "socket.io";
import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { registerSocketAuth } from "./socket/auth.js";
import { registerAuctionHandlers } from "./socket/auctionHandlers.js";
import { startAuctionCloser } from "./jobs/auctionCloser.js";
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from "./socket/events.js";

const app = createApp();
const server = http.createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
  server,
  { cors: { origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(",") } },
);

// JWT handshake guard — runs before any event is processed.
registerSocketAuth(io);
// auction-join / auction-leave / bid-place handlers.
registerAuctionHandlers(io);

// Background job (every 30s): broadcast auction-ended to the auction's room.
const closer = startAuctionCloser({
  onAuctionEnded: (event) => {
    io.to(`auction:${event.auctionId}`).emit("auction-ended", event);
  },
});

server.listen(env.PORT, () => {
  console.log(`API + WebSocket listening on :${env.PORT}`);
});

function shutdown(): void {
  closer.stop();
  io.close();
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
