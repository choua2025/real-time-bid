// End-to-end Socket.IO auction-layer verification against the real DB.
// Run: npx tsx scripts/verify-socket-auction.ts
import http from "node:http";
import { AddressInfo } from "node:net";
import { Server } from "socket.io";
import { io as ioc, Socket as ClientSocket } from "socket.io-client";
import { AuctionStatus, PhoneType, Role } from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";
import { registerSocketAuth } from "../src/socket/auth.js";
import { registerAuctionHandlers } from "../src/socket/auctionHandlers.js";
import { signAccessToken } from "../src/lib/jwt.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function connect(url: string, token: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const s = ioc(url, { auth: { token }, reconnection: false, transports: ["websocket"] });
    s.on("connect", () => resolve(s));
    s.on("connect_error", (e) => reject(e));
  });
}

function waitFor<T = any>(socket: ClientSocket, event: string, timeout = 1500): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeout);
    socket.once(event, (data: T) => {
      clearTimeout(t);
      resolve(data);
    });
  });
}

const join = (s: ClientSocket, auctionId: string): Promise<any> =>
  new Promise((resolve) => s.emit("auction-join", { auctionId }, resolve));
const leave = (s: ClientSocket, auctionId: string): Promise<any> =>
  new Promise((resolve) => s.emit("auction-leave", { auctionId }, resolve));

async function main() {
  const tag = `sock-${Date.now()}`;
  const checks: Array<[string, boolean]> = [];
  const check = (name: string, ok: boolean) => checks.push([name, ok]);

  // --- seed ---------------------------------------------------------------
  const phone = await prisma.phoneNumber.create({
    data: { msisdn: tag, type: PhoneType.PREPAID, category: "TEST" },
  });
  const auction = await prisma.auction.create({
    data: {
      phoneNumberId: phone.id,
      floorPrice: "100.00",
      currentPrice: "100.00",
      startsAt: new Date(Date.now() - 60_000),
      endsAt: new Date(Date.now() + 300_000),
      status: AuctionStatus.ACTIVE,
    },
  });
  const alice = await prisma.user.create({ data: { email: `${tag}-a@t.local`, password: "x", name: "Alice", role: Role.MEMBER } });
  const bob = await prisma.user.create({ data: { email: `${tag}-b@t.local`, password: "x", name: "Bob", role: Role.MEMBER } });
  const admin = await prisma.user.create({ data: { email: `${tag}-admin@t.local`, password: "x", name: "Admin", role: Role.ADMIN } });
  const tokenA = signAccessToken({ sub: alice.id, role: Role.MEMBER });
  const tokenB = signAccessToken({ sub: bob.id, role: Role.MEMBER });
  const tokenAdmin = signAccessToken({ sub: admin.id, role: Role.ADMIN });

  const countWatch = () => prisma.auctionWatch.count({ where: { auctionId: auction.id } });

  // --- server -------------------------------------------------------------
  const server = http.createServer();
  const io = new Server(server);
  registerSocketAuth(io);
  registerAuctionHandlers(io);
  await new Promise<void>((r) => server.listen(0, r));
  const url = `http://localhost:${(server.address() as AddressInfo).port}`;

  // --- join + initial state ----------------------------------------------
  const a = await connect(url, tokenA);
  const ackA = await join(a, auction.id);
  check("A join ack ok", ackA?.ok === true);
  check("A initial currentPrice 100.00", ackA?.state?.currentPrice === "100.00");
  check("A initial bidCount 0", ackA?.state?.bidCount === 0);
  check("A initial topBidder null", ackA?.state?.topBidder === null);
  check("watch rows == 1 after A joins", (await countWatch()) === 1);

  const b = await connect(url, tokenB);
  await join(b, auction.id);
  check("watch rows == 2 after B joins", (await countWatch()) === 2);

  // --- bid-update broadcast ----------------------------------------------
  const bUpdate = waitFor(b, "bid-update");
  a.emit("bid-place", { auctionId: auction.id, amount: 150 });
  const update: any = await bUpdate;
  check("B receives bid-update", !!update);
  check("bid-update currentPrice 150.00", update?.currentPrice === "150.00");
  check("bid-update topBidder is Alice", update?.topBidder?.id === alice.id && update?.topBidder?.name === "Alice");
  check("bid-update bidCount 1", update?.bidCount === 1);

  // --- bid-rejected: not higher ------------------------------------------
  const aRejected = waitFor<{ reason: string }>(a, "bid-rejected");
  a.emit("bid-place", { auctionId: auction.id, amount: 150 });
  const rej = await aRejected;
  check("too-low bid -> bid-rejected", /higher/i.test(rej.reason));

  // --- role gate: admin cannot bid ---------------------------------------
  const adminSock = await connect(url, tokenAdmin);
  const adminAck = await join(adminSock, auction.id);
  check("admin CAN watch (join ok)", adminAck?.ok === true);
  check("watch rows == 3 after admin joins", (await countWatch()) === 3);
  const adminRejected = waitFor<{ reason: string }>(adminSock, "bid-rejected");
  adminSock.emit("bid-place", { auctionId: auction.id, amount: 999 });
  const adminRej = await adminRejected;
  check("admin bid -> rejected (members only)", /member/i.test(adminRej.reason));

  // --- explicit leave -----------------------------------------------------
  await leave(a, auction.id);
  check("watch rows == 2 after A leaves", (await countWatch()) === 2);

  // --- multi-tab reference counting --------------------------------------
  const b2 = await connect(url, tokenB); // Bob's second tab
  await join(b2, auction.id);
  check("watch rows still 2 (Bob's 2nd tab dedupes)", (await countWatch()) === 2);

  adminSock.disconnect();
  await sleep(200);
  check("watch rows == 1 after admin disconnects", (await countWatch()) === 1);

  b.disconnect(); // one of Bob's two sockets
  await sleep(200);
  check("Bob's watch survives while 2nd tab open", (await countWatch()) === 1);

  b2.disconnect(); // Bob's last socket
  await sleep(200);
  check("watch rows == 0 after Bob fully disconnects", (await countWatch()) === 0);

  a.disconnect();

  // --- report -------------------------------------------------------------
  console.log();
  let pass = true;
  for (const [name, ok] of checks) {
    console.log(`  ${ok ? "✓" : "✗"} ${name}`);
    if (!ok) pass = false;
  }
  console.log(`\nRESULT: ${pass ? "PASS ✅" : "FAIL ❌"}`);

  // --- cleanup ------------------------------------------------------------
  io.close();
  server.close();
  await prisma.auction.update({ where: { id: auction.id }, data: { winnerBidId: null } });
  await prisma.bid.deleteMany({ where: { auctionId: auction.id } });
  await prisma.auctionWatch.deleteMany({ where: { auctionId: auction.id } });
  await prisma.auction.delete({ where: { id: auction.id } });
  await prisma.phoneNumber.delete({ where: { id: phone.id } });
  await prisma.user.deleteMany({ where: { id: { in: [alice.id, bob.id, admin.id] } } });

  process.exitCode = pass ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
