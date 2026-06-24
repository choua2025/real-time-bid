// Verifies the Socket.IO JWT handshake guard. No DB needed — token validation
// is stateless. Run: npx tsx scripts/verify-socket-auth.ts
import http from "node:http";
import { AddressInfo } from "node:net";
import { Server } from "socket.io";
import { io as ioc, Socket as ClientSocket } from "socket.io-client";
import { Role } from "@prisma/client";
import { registerSocketAuth } from "../src/socket/auth.js";
import { signAccessToken } from "../src/lib/jwt.js";

function connect(url: string, token?: string): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const socket: ClientSocket = ioc(url, {
      auth: token ? { token } : {},
      reconnection: false,
      transports: ["websocket"],
    });
    socket.on("connect", () => {
      socket.disconnect();
      resolve({ ok: true });
    });
    socket.on("connect_error", (err) => {
      socket.close();
      resolve({ ok: false, error: err.message });
    });
  });
}

async function main() {
  const server = http.createServer();
  const io = new Server(server);
  registerSocketAuth(io);

  let connectedUserId: string | undefined;
  io.on("connection", (socket) => {
    connectedUserId = socket.user?.id;
  });

  await new Promise<void>((r) => server.listen(0, r));
  const url = `http://localhost:${(server.address() as AddressInfo).port}`;

  const checks: Array<[string, boolean]> = [];

  const noToken = await connect(url);
  checks.push(["no token -> rejected", !noToken.ok && noToken.error === "UNAUTHORIZED"]);

  const badToken = await connect(url, "garbage.token.value");
  checks.push(["invalid token -> rejected", !badToken.ok && badToken.error === "UNAUTHORIZED"]);

  const goodToken = signAccessToken({ sub: "user-123", role: Role.MEMBER });
  const valid = await connect(url, goodToken);
  checks.push(["valid token -> connected", valid.ok]);
  // Give the server a tick to run its connection handler.
  await new Promise((r) => setTimeout(r, 50));
  checks.push(["server attached socket.user", connectedUserId === "user-123"]);

  console.log();
  let pass = true;
  for (const [name, ok] of checks) {
    console.log(`  ${ok ? "✓" : "✗"} ${name}`);
    if (!ok) pass = false;
  }
  console.log(`\nRESULT: ${pass ? "PASS ✅" : "FAIL ❌"}`);

  io.close();
  server.close();
  process.exitCode = pass ? 0 : 1;
}

main();
