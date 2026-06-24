// Verifies the auction-close flow: winner selection, no-bid auctions, and
// idempotency when closes overlap. Run: npx tsx scripts/verify-auction-close.ts
import { AuctionStatus, PhoneType } from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";
import { auctionService } from "../src/services/auction.service.js";

async function makeAuction(tag: string, endsAt: Date) {
  const phone = await prisma.phoneNumber.create({
    data: { msisdn: tag, type: PhoneType.PREPAID, category: "TEST" },
  });
  const auction = await prisma.auction.create({
    data: {
      phoneNumberId: phone.id,
      floorPrice: "100.00",
      currentPrice: "100.00",
      startsAt: new Date(Date.now() - 60_000),
      endsAt,
      status: AuctionStatus.ACTIVE,
    },
  });
  return { phoneId: phone.id, auctionId: auction.id };
}

async function main() {
  const tag = `close-${Date.now()}`;
  const checks: Array<[string, boolean]> = [];

  // --- A: expired auction WITH bids -> winner = highest bid ---------------
  const a = await makeAuction(`${tag}-A`, new Date(Date.now() - 1000));
  const u1 = await prisma.user.create({ data: { email: `${tag}-1@t.local`, password: "x", name: "Alice" } });
  const u2 = await prisma.user.create({ data: { email: `${tag}-2@t.local`, password: "x", name: "Bob" } });
  await prisma.bid.create({ data: { auctionId: a.auctionId, userId: u1.id, amount: "120.00" } });
  const winning = await prisma.bid.create({ data: { auctionId: a.auctionId, userId: u2.id, amount: "150.00" } });
  await prisma.auction.update({ where: { id: a.auctionId }, data: { currentPrice: "150.00" } });

  const eventA = await auctionService.close(a.auctionId);
  const dbA = await prisma.auction.findUniqueOrThrow({ where: { id: a.auctionId } });
  checks.push(["A winnerId is Bob", eventA?.winnerId === u2.id]);
  checks.push(["A winnerName is Bob", eventA?.winnerName === "Bob"]);
  checks.push(["A finalPrice 150.00", eventA?.finalPrice === "150.00"]);
  checks.push(["A status ENDED", dbA.status === AuctionStatus.ENDED]);
  checks.push(["A winnerBidId = winning bid", dbA.winnerBidId === winning.id]);

  // --- B: expired auction with NO bids -> no winner -----------------------
  const b = await makeAuction(`${tag}-B`, new Date(Date.now() - 1000));
  const eventB = await auctionService.close(b.auctionId);
  const dbB = await prisma.auction.findUniqueOrThrow({ where: { id: b.auctionId } });
  checks.push(["B winnerId null", eventB?.winnerId === null]);
  checks.push(["B finalPrice 100.00 (floor)", eventB?.finalPrice === "100.00"]);
  checks.push(["B status ENDED", dbB.status === AuctionStatus.ENDED]);
  checks.push(["B winnerBidId null", dbB.winnerBidId === null]);

  // --- C: idempotency -> 10 concurrent closes, exactly 1 event ------------
  const c = await makeAuction(`${tag}-C`, new Date(Date.now() - 1000));
  await prisma.bid.create({ data: { auctionId: c.auctionId, userId: u1.id, amount: "130.00" } });
  await prisma.auction.update({ where: { id: c.auctionId }, data: { currentPrice: "130.00" } });
  const closes = await Promise.all(Array.from({ length: 10 }, () => auctionService.close(c.auctionId)));
  const nonNull = closes.filter((e) => e !== null);
  checks.push(["C exactly 1 close event", nonNull.length === 1]);

  // --- D: closeExpired ignores not-yet-expired ACTIVE auctions ------------
  const future = await makeAuction(`${tag}-D`, new Date(Date.now() + 60_000));
  const expired = await makeAuction(`${tag}-E`, new Date(Date.now() - 1000));
  const events = await auctionService.closeExpired();
  const closedIds = new Set(events.map((e) => e.auctionId));
  const dbFuture = await prisma.auction.findUniqueOrThrow({ where: { id: future.auctionId } });
  checks.push(["D future auction still ACTIVE", dbFuture.status === AuctionStatus.ACTIVE]);
  checks.push(["D expired auction was closed", closedIds.has(expired.auctionId)]);

  // --- report -------------------------------------------------------------
  console.log();
  let pass = true;
  for (const [name, ok] of checks) {
    console.log(`  ${ok ? "✓" : "✗"} ${name}`);
    if (!ok) pass = false;
  }
  console.log(`\nRESULT: ${pass ? "PASS ✅" : "FAIL ❌"}`);

  // --- cleanup ------------------------------------------------------------
  const auctionIds = [a.auctionId, b.auctionId, c.auctionId, future.auctionId, expired.auctionId];
  const phoneIds = [a.phoneId, b.phoneId, c.phoneId, future.phoneId, expired.phoneId];
  await prisma.auction.updateMany({ where: { id: { in: auctionIds } }, data: { winnerBidId: null } });
  await prisma.bid.deleteMany({ where: { auctionId: { in: auctionIds } } });
  await prisma.auction.deleteMany({ where: { id: { in: auctionIds } } });
  await prisma.phoneNumber.deleteMany({ where: { id: { in: phoneIds } } });
  await prisma.user.deleteMany({ where: { id: { in: [u1.id, u2.id] } } });

  process.exitCode = pass ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
