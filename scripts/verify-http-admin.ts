// End-to-end HTTP CRUD verification (phone numbers + auctions + bid history).
// Run: npx tsx scripts/verify-http-admin.ts
import request from "supertest";
import { PhoneType, Role } from "@prisma/client";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { signAccessToken } from "../src/lib/jwt.js";
import { bidService } from "../src/services/bid.service.js";

async function main() {
  const app = createApp();
  const tag = `http-${Date.now()}`;
  const checks: Array<[string, boolean]> = [];
  const check = (name: string, ok: boolean) => checks.push([name, ok]);

  const admin = await prisma.user.create({ data: { email: `${tag}-admin@t.local`, password: "x", name: "Admin", role: Role.ADMIN } });
  const member = await prisma.user.create({ data: { email: `${tag}-m@t.local`, password: "x", name: "Member", role: Role.MEMBER } });
  const adminAuth = `Bearer ${signAccessToken({ sub: admin.id, role: Role.ADMIN })}`;
  const memberAuth = `Bearer ${signAccessToken({ sub: member.id, role: Role.MEMBER })}`;

  const createdAuctionIds: string[] = [];
  const createdPhoneIds: string[] = [];

  // --- phone numbers: RBAC + CRUD ----------------------------------------
  const anon = await request(app).post("/api/phone-numbers").send({ msisdn: `${Date.now()}`, type: "PREPAID", category: "GOLD" });
  check("create phone unauthenticated -> 401", anon.status === 401);

  const msisdn = `6012${Date.now()}`.slice(0, 12);
  const memberCreate = await request(app).post("/api/phone-numbers").set("Authorization", memberAuth).send({ msisdn, type: "PREPAID", category: "GOLD" });
  check("create phone as member -> 403", memberCreate.status === 403);

  const phoneRes = await request(app).post("/api/phone-numbers").set("Authorization", adminAuth).send({ msisdn, type: "PREPAID", category: "GOLD" });
  check("create phone as admin -> 201", phoneRes.status === 201);
  const phoneId = phoneRes.body.id;
  createdPhoneIds.push(phoneId);

  const dupPhone = await request(app).post("/api/phone-numbers").set("Authorization", adminAuth).send({ msisdn, type: "PREPAID", category: "GOLD" });
  check("duplicate msisdn -> 409", dupPhone.status === 409);

  const badPhone = await request(app).post("/api/phone-numbers").set("Authorization", adminAuth).send({ msisdn: "abc", type: "PREPAID", category: "GOLD" });
  check("invalid msisdn -> 400", badPhone.status === 400);

  const phoneList = await request(app).get("/api/phone-numbers").set("Authorization", adminAuth);
  check("admin list phones includes new one", phoneList.body.some((p: any) => p.id === phoneId));

  // --- auctions: create + browse -----------------------------------------
  const auctionBody = {
    phoneNumberId: phoneId,
    floorPrice: 100,
    startsAt: new Date(Date.now() - 1000).toISOString(),
    endsAt: new Date(Date.now() + 300_000).toISOString(),
  };
  const auctionRes = await request(app).post("/api/auctions").set("Authorization", adminAuth).send(auctionBody);
  check("create auction as admin -> 201", auctionRes.status === 201);
  check("new auction is ACTIVE (start in past)", auctionRes.body.status === "ACTIVE");
  check("auction currentPrice 100.00", auctionRes.body.currentPrice === "100.00");
  check("auction bidCount 0", auctionRes.body.bidCount === 0);
  const auctionId = auctionRes.body.id;
  createdAuctionIds.push(auctionId);

  const memberAuction = await request(app).post("/api/auctions").set("Authorization", memberAuth).send(auctionBody);
  check("create auction as member -> 403", memberAuction.status === 403);

  const dupAuction = await request(app).post("/api/auctions").set("Authorization", adminAuth).send(auctionBody);
  check("duplicate open auction for phone -> 409", dupAuction.status === 409);

  const badAuction = await request(app).post("/api/auctions").set("Authorization", adminAuth).send({ ...auctionBody, endsAt: new Date(Date.now() - 5000).toISOString() });
  check("auction endsAt in past -> 400", badAuction.status === 400);

  const memberList = await request(app).get("/api/auctions?status=ACTIVE").set("Authorization", memberAuth);
  check("member lists ACTIVE auctions includes it", memberList.body.some((a: any) => a.id === auctionId));

  const detail = await request(app).get(`/api/auctions/${auctionId}`).set("Authorization", memberAuth);
  check("member gets auction detail -> 200", detail.status === 200);
  check("detail topBidder null (no bids)", detail.body.topBidder === null);
  check("detail winner null", detail.body.winner === null);

  const notFound = await request(app).get(`/api/auctions/does-not-exist`).set("Authorization", memberAuth);
  check("unknown auction -> 404", notFound.status === 404);

  // --- bid history --------------------------------------------------------
  await bidService.place({ auctionId, userId: member.id, amount: "150" });
  const history = await request(app).get(`/api/auctions/${auctionId}/bids`).set("Authorization", memberAuth);
  check("auction bid history has 1 entry", Array.isArray(history.body) && history.body.length === 1);
  check("bid history shows bidder name", history.body[0]?.userName === "Member");
  check("bid history amount 150.00", history.body[0]?.amount === "150.00");

  const mine = await request(app).get(`/api/me/bids`).set("Authorization", memberAuth);
  check("/me/bids returns the member's bid", mine.body.length === 1 && mine.body[0].auctionId === auctionId);

  const detailAfter = await request(app).get(`/api/auctions/${auctionId}`).set("Authorization", memberAuth);
  check("detail topBidder is Member after bid", detailAfter.body.topBidder?.id === member.id);
  check("detail currentPrice 150.00 after bid", detailAfter.body.currentPrice === "150.00");

  // --- cancel -------------------------------------------------------------
  const cancel = await request(app).post(`/api/auctions/${auctionId}/cancel`).set("Authorization", adminAuth);
  check("admin cancel -> CANCELLED", cancel.body.status === "CANCELLED");
  const cancelAgain = await request(app).post(`/api/auctions/${auctionId}/cancel`).set("Authorization", adminAuth);
  check("cancel is idempotent", cancelAgain.body.status === "CANCELLED");

  // --- delete protections -------------------------------------------------
  const delUsed = await request(app).delete(`/api/phone-numbers/${phoneId}`).set("Authorization", adminAuth);
  check("delete phone with auctions -> 409", delUsed.status === 409);

  const freePhone = await request(app).post("/api/phone-numbers").set("Authorization", adminAuth).send({ msisdn: `6013${Date.now()}`.slice(0, 12), type: "POSTPAID", category: "SILVER" });
  createdPhoneIds.push(freePhone.body.id);
  const delFree = await request(app).delete(`/api/phone-numbers/${freePhone.body.id}`).set("Authorization", adminAuth);
  check("delete unused phone -> 204", delFree.status === 204);

  // --- report -------------------------------------------------------------
  console.log();
  let pass = true;
  for (const [name, ok] of checks) {
    console.log(`  ${ok ? "✓" : "✗"} ${name}`);
    if (!ok) pass = false;
  }
  console.log(`\nRESULT: ${pass ? "PASS ✅" : "FAIL ❌"}`);

  // --- cleanup ------------------------------------------------------------
  await prisma.auction.updateMany({ where: { id: { in: createdAuctionIds } }, data: { winnerBidId: null } });
  await prisma.bid.deleteMany({ where: { auctionId: { in: createdAuctionIds } } });
  await prisma.auction.deleteMany({ where: { id: { in: createdAuctionIds } } });
  await prisma.phoneNumber.deleteMany({ where: { id: { in: createdPhoneIds } } });
  await prisma.user.deleteMany({ where: { id: { in: [admin.id, member.id] } } });
  process.exitCode = pass ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
