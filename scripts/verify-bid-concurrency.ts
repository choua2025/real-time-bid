// Ad-hoc verification: fire many simultaneous bids at one auction and confirm
// the concurrency guard holds. Run with: npx tsx scripts/verify-bid-concurrency.ts
// Hits the real DATABASE_URL, then cleans up everything it created.

import { AuctionStatus, PhoneType } from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";
import { bidService } from "../src/services/bid.service.js";
import { isBidError } from "../src/lib/errors.js";

async function main() {
  const tag = `verify-${Date.now()}`;

  // --- seed ---------------------------------------------------------------
  const phone = await prisma.phoneNumber.create({
    data: { msisdn: `${tag}`, type: PhoneType.PREPAID, category: "TEST" },
  });
  const auction = await prisma.auction.create({
    data: {
      phoneNumberId: phone.id,
      floorPrice: "100.00",
      currentPrice: "100.00",
      startsAt: new Date(Date.now() - 1000),
      endsAt: new Date(Date.now() + 60_000),
      status: AuctionStatus.ACTIVE,
    },
  });
  const N = 20;
  const users = await Promise.all(
    Array.from({ length: N }, (_, i) =>
      prisma.user.create({
        data: { email: `${tag}-${i}@test.local`, password: "x", name: `U${i}` },
      }),
    ),
  );

  // --- Scenario A: N identical bids of 150, all at once -------------------
  const sameAmount = await Promise.allSettled(
    users.map((u) => bidService.place({ auctionId: auction.id, userId: u.id, amount: "150.00" })),
  );
  const acceptedA = sameAmount.filter((r) => r.status === "fulfilled").length;
  const outbidA = sameAmount.filter(
    (r) => r.status === "rejected" && isBidError(r.reason) && r.reason.code === "OUTBID",
  ).length;
  // Diagnostic: tally why the non-accepted bids were rejected.
  const reasonsA: Record<string, number> = {};
  for (const r of sameAmount) {
    if (r.status === "rejected") {
      const key = isBidError(r.reason)
        ? `BidError:${r.reason.code}`
        : `${(r.reason as { code?: string })?.code ?? r.reason?.constructor?.name ?? "Unknown"}`;
      reasonsA[key] = (reasonsA[key] ?? 0) + 1;
    }
  }
  console.log("  rejection breakdown A:", reasonsA);

  // --- Scenario B: N distinct ascending bids, all at once -----------------
  const distinct = await Promise.allSettled(
    users.map((u, i) =>
      bidService.place({ auctionId: auction.id, userId: u.id, amount: `${200 + i}.00` }),
    ),
  );
  const acceptedB = distinct.filter((r) => r.status === "fulfilled").length;

  const finalAuction = await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } });
  const totalBids = await prisma.bid.count({ where: { auctionId: auction.id } });

  // --- report -------------------------------------------------------------
  console.log("\n=== Scenario A: 20 simultaneous identical bids of 150.00 ===");
  console.log(`  accepted: ${acceptedA} (expect exactly 1)`);
  console.log(`  rejected OUTBID: ${outbidA} (expect 19)`);

  console.log("\n=== Scenario B: 20 simultaneous distinct bids 200..219 ===");
  console.log(`  accepted: ${acceptedB} (expect 1..20, all valid increases)`);

  console.log("\n=== Final state ===");
  console.log(`  currentPrice: ${finalAuction.currentPrice.toFixed(2)} (expect 219.00)`);
  console.log(`  total Bid rows: ${totalBids} (== accepted A + accepted B = ${acceptedA + acceptedB})`);

  const pass =
    acceptedA === 1 &&
    outbidA === N - 1 &&
    finalAuction.currentPrice.toFixed(2) === "219.00" &&
    totalBids === acceptedA + acceptedB;
  console.log(`\nRESULT: ${pass ? "PASS ✅" : "FAIL ❌"}`);

  // --- cleanup ------------------------------------------------------------
  await prisma.auction.update({ where: { id: auction.id }, data: { winnerBidId: null } });
  await prisma.bid.deleteMany({ where: { auctionId: auction.id } });
  await prisma.auction.delete({ where: { id: auction.id } });
  await prisma.phoneNumber.delete({ where: { id: phone.id } });
  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });

  process.exitCode = pass ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
