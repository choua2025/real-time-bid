// Idempotent dev seed: one admin, a few members, sample phone numbers, and
// auctions in every state (active, active-with-bids, scheduled, ended).
// Run: npm run seed   (or: npx prisma db seed)
import { AuctionStatus, PhoneType, Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";
import { hashPassword } from "../src/lib/password.js";

const ADMIN_PASSWORD = "Admin123!";
const MEMBER_PASSWORD = "Member123!";

async function main() {
  const now = Date.now();
  const hour = 3_600_000;

  // --- users (upsert by unique email) ------------------------------------
  const adminHash = await hashPassword(ADMIN_PASSWORD);
  const memberHash = await hashPassword(MEMBER_PASSWORD);

  const admin = await prisma.user.upsert({
    where: { email: "admin@bid.local" },
    update: {},
    create: { email: "admin@bid.local", name: "Admin", password: adminHash, role: "ADMIN" },
  });
  const [alice, bob, carol] = await Promise.all(
    [
      ["alice@bid.local", "Alice"],
      ["bob@bid.local", "Bob"],
      ["carol@bid.local", "Carol"],
    ].map(([email, name]) =>
      prisma.user.upsert({
        where: { email },
        update: {},
        create: { email, name, password: memberHash, role: "MEMBER" },
      }),
    ),
  );

  // --- phone numbers (upsert by unique msisdn) ---------------------------
  const phoneSpecs: Array<{ msisdn: string; type: PhoneType; category: string }> = [
    { msisdn: "60121111111", type: "PREPAID", category: "GOLD" },
    { msisdn: "60122222222", type: "PREPAID", category: "PLATINUM" },
    { msisdn: "60123333333", type: "POSTPAID", category: "VIP" },
    { msisdn: "60124444444", type: "POSTPAID", category: "GOLD" },
    { msisdn: "60125555555", type: "PREPAID", category: "SILVER" },
  ];
  const phones = await Promise.all(
    phoneSpecs.map((p) =>
      prisma.phoneNumber.upsert({ where: { msisdn: p.msisdn }, update: { type: p.type, category: p.category }, create: p }),
    ),
  );

  // --- reset auctions for these phones so the seed is re-runnable --------
  const phoneIds = phones.map((p) => p.id);
  const existing = await prisma.auction.findMany({ where: { phoneNumberId: { in: phoneIds } }, select: { id: true } });
  const existingIds = existing.map((a) => a.id);
  await prisma.auction.updateMany({ where: { id: { in: existingIds } }, data: { winnerBidId: null } });
  await prisma.bid.deleteMany({ where: { auctionId: { in: existingIds } } });
  await prisma.auctionWatch.deleteMany({ where: { auctionId: { in: existingIds } } });
  await prisma.auction.deleteMany({ where: { id: { in: existingIds } } });

  const dec = (n: number) => new Prisma.Decimal(n.toFixed(2));

  // 1) ACTIVE, no bids yet.
  await prisma.auction.create({
    data: {
      phoneNumberId: phones[0].id,
      floorPrice: dec(100),
      currentPrice: dec(100),
      startsAt: new Date(now - hour),
      endsAt: new Date(now + 2 * hour),
      status: AuctionStatus.ACTIVE,
    },
  });

  // 2) ACTIVE, with bids — currentPrice + topBidder populated.
  const hot = await prisma.auction.create({
    data: {
      phoneNumberId: phones[1].id,
      floorPrice: dec(500),
      currentPrice: dec(600),
      startsAt: new Date(now - hour),
      endsAt: new Date(now + hour / 2),
      status: AuctionStatus.ACTIVE,
    },
  });
  await prisma.bid.createMany({
    data: [
      { auctionId: hot.id, userId: alice.id, amount: dec(550), bidAt: new Date(now - 20 * 60_000) },
      { auctionId: hot.id, userId: bob.id, amount: dec(600), bidAt: new Date(now - 5 * 60_000) },
    ],
  });

  // 3) SCHEDULED, starts in the future.
  await prisma.auction.create({
    data: {
      phoneNumberId: phones[2].id,
      floorPrice: dec(1000),
      currentPrice: dec(1000),
      startsAt: new Date(now + hour),
      endsAt: new Date(now + 4 * hour),
      status: AuctionStatus.SCHEDULED,
    },
  });

  // 4) ENDED, with a resolved winner.
  const ended = await prisma.auction.create({
    data: {
      phoneNumberId: phones[3].id,
      floorPrice: dec(200),
      currentPrice: dec(300),
      startsAt: new Date(now - 2 * hour),
      endsAt: new Date(now - hour),
      status: AuctionStatus.ENDED,
    },
  });
  await prisma.bid.create({ data: { auctionId: ended.id, userId: alice.id, amount: dec(250), bidAt: new Date(now - 100 * 60_000) } });
  const winningBid = await prisma.bid.create({ data: { auctionId: ended.id, userId: carol.id, amount: dec(300), bidAt: new Date(now - 70 * 60_000) } });
  await prisma.auction.update({ where: { id: ended.id }, data: { winnerBidId: winningBid.id } });

  // phones[4] intentionally has no auction.

  console.log("Seed complete.\n");
  console.log("Login credentials:");
  console.log(`  ADMIN   admin@bid.local / ${ADMIN_PASSWORD}`);
  console.log(`  MEMBER  alice@bid.local / ${MEMBER_PASSWORD}`);
  console.log(`  MEMBER  bob@bid.local   / ${MEMBER_PASSWORD}`);
  console.log(`  MEMBER  carol@bid.local / ${MEMBER_PASSWORD}`);
  console.log(`\n${phones.length} phone numbers, 4 auctions (active / active+bids / scheduled / ended).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
