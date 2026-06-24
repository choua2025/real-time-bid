# Project brief — Real-time phone number bidding system

## Overview
A web app where registered members bid on phone numbers in real time.
Admins list numbers with a floor price and auction end time.
The highest bid when the timer expires wins. All price updates broadcast
instantly to every watching browser via WebSocket — no refresh needed.

## Tech stack
- Backend: Express + TypeScript + Prisma
- Database: PostgreSQL
- Auth: JWT (access + refresh) + bcrypt
- Real-time: socket.io (server) + socket.io-client (frontend)
- Frontend: Nuxt 3 + Tailwind CSS

## Core entities
- User (role: ADMIN | MEMBER)
- PhoneNumber (msisdn, type, category)
- Auction (phoneNumberId, floorPrice, currentPrice, startsAt, endsAt, status, winnerBidId)
- Bid (auctionId, userId, amount, bidAt)
- AuctionWatch (auctionId, userId) — maps to a socket.io room

## Auction rules
- Only registered members can bid
- Bid must exceed currentPrice (not just equal it)
- Bid must be >= floorPrice (set by admin)
- Auction auto-closes when endsAt is reached (background job)
- Highest bid at close = winner, stored in auction.winnerBidId

## WebSocket events
- Client → Server: bid-place { auctionId, amount }
- Client → Server: auction-join { auctionId }  (joins the room)
- Client → Server: auction-leave { auctionId }
- Server → Room:   bid-update { auctionId, currentPrice, topBidder, bidCount }
- Server → Room:   auction-ended { auctionId, winnerId, winnerName, finalPrice }
- Server → Client: bid-rejected { reason } (only to the bidder)

## Key business rules
- currentPrice on Auction is updated on every accepted bid (denormalized for speed)
- AuctionWatch maps 1:1 to socket.io rooms — joining the page = joining the room
- Background job runs every 30s to close expired auctions and fire auction-ended
- Money fields use Decimal(14,2) — never Float
- All queries scoped by authenticated userId

## Conventions
- Repository → Service → Controller architecture
- asyncHandler wraps all controllers
- socket.io middleware validates JWT before any socket event is processed