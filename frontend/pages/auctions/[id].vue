<script setup lang="ts">
import type { AuctionDetail, AuctionEnded, BidView, LiveState } from "~/types/api";

const route = useRoute();
const auctionId = route.params.id as string;

const { api, errorMessage } = useApi();
const { user, isMember } = useAuth();
const { money, dateTime, countdown } = useFormat();

const detail = ref<AuctionDetail | null>(null);
const loadError = ref("");

// Live, mutable view of the auction (seeded from REST, updated over the socket).
const currentPrice = ref("0.00");
const bidCount = ref(0);
const topBidder = ref<{ id: string; name: string } | null>(null);
const status = ref("");
const winner = ref<AuctionEnded | null>(null);
const history = ref<BidView[]>([]);
const topBids = ref<BidView[]>([]);

// number input emits a number via v-model; empty string when cleared.
const bidAmount = ref<string | number>("");
const notice = ref("");
const noticeType = ref<"error" | "success">("error");

// Countdown ticking.
const nowMs = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;

const isActive = computed(() => status.value === "ACTIVE");
const timeLeft = computed(() => (detail.value ? countdown(detail.value.endsAt, nowMs.value) : ""));

function applyLive(state: LiveState) {
  currentPrice.value = state.currentPrice;
  bidCount.value = state.bidCount;
  topBidder.value = state.topBidder;
}

function flash(message: string, type: "error" | "success") {
  notice.value = message;
  noticeType.value = type;
  setTimeout(() => (notice.value = ""), 4000);
}

async function loadHistory() {
  try {
    [history.value, topBids.value] = await Promise.all([
      api<BidView[]>(`/auctions/${auctionId}/bids`),
      api<BidView[]>(`/auctions/${auctionId}/bids/top`),
    ]);
  } catch {
    /* non-fatal */
  }
}

function placeBid() {
  notice.value = "";
  // Vue auto-applies the .number modifier on <input type="number">, so
  // bidAmount may be a number; normalize to a trimmed string for the server.
  const amount = String(bidAmount.value ?? "").trim();
  if (!amount) return;
  const socket = useSocket();
  socket.emit("bid-place", { auctionId, amount });
  bidAmount.value = "";
}

let onBidUpdate: (s: LiveState) => void;
let onBidRejected: (p: { reason: string }) => void;
let onEnded: (e: AuctionEnded) => void;

onMounted(async () => {
  try {
    detail.value = await api<AuctionDetail>(`/auctions/${auctionId}`);
  } catch (err) {
    loadError.value = errorMessage(err, "Could not load auction.");
    return;
  }
  // Seed live view from REST.
  currentPrice.value = detail.value.currentPrice;
  bidCount.value = detail.value.bidCount;
  topBidder.value = detail.value.topBidder;
  status.value = detail.value.status;
  await loadHistory();

  timer = setInterval(() => (nowMs.value = Date.now()), 1000);

  const socket = useSocket();
  onBidUpdate = (s) => {
    if (s.auctionId !== auctionId) return;
    applyLive(s);
    loadHistory();
  };
  onBidRejected = (p) => flash(p.reason, "error");
  onEnded = (e) => {
    if (e.auctionId !== auctionId) return;
    status.value = "ENDED";
    winner.value = e;
    currentPrice.value = e.finalPrice;
  };

  socket.on("bid-update", onBidUpdate);
  socket.on("bid-rejected", onBidRejected);
  socket.on("auction-ended", onEnded);

  // Join the room; the ack carries the authoritative current state.
  socket.emit("auction-join", { auctionId }, (res: { ok: boolean; state?: LiveState; error?: string }) => {
    if (res?.ok && res.state) applyLive(res.state);
  });
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
  const socket = useSocket();
  socket.emit("auction-leave", { auctionId });
  if (onBidUpdate) socket.off("bid-update", onBidUpdate);
  if (onBidRejected) socket.off("bid-rejected", onBidRejected);
  if (onEnded) socket.off("auction-ended", onEnded);
});
</script>

<template>
  <div>
    <NuxtLink to="/" class="text-sm text-indigo-600">← Back to auctions</NuxtLink>

    <p v-if="loadError" class="text-rose-600 mt-4">{{ loadError }}</p>

    <div v-else-if="detail" class="mt-4 grid gap-6 md:grid-cols-3">
      <!-- Main panel -->
      <div class="md:col-span-2 bg-white border border-slate-200 rounded-xl p-6">
        <div class="flex items-center justify-between">
          <h1 class="font-mono text-2xl">{{ detail.phoneNumber.msisdn }}</h1>
          <span class="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-600">{{ status }}</span>
        </div>
        <div class="text-sm text-slate-500 mt-1">
          {{ detail.phoneNumber.category }} · {{ detail.phoneNumber.type }}
        </div>

        <div class="mt-6 flex items-end gap-8">
          <div>
            <div class="text-xs text-slate-500">Current price</div>
            <div class="text-4xl font-bold text-indigo-600">{{ money(currentPrice) }}</div>
          </div>
          <div>
            <div class="text-xs text-slate-500">Top bidder</div>
            <div class="font-medium">{{ topBidder?.name ?? "—" }}</div>
          </div>
          <div>
            <div class="text-xs text-slate-500">Bids</div>
            <div class="font-medium">{{ bidCount }}</div>
          </div>
        </div>

        <div class="mt-2 text-sm text-slate-500">
          Floor {{ money(detail.floorPrice) }} ·
          <span v-if="isActive">ends in <span class="font-medium text-slate-700">{{ timeLeft }}</span></span>
          <span v-else>ended {{ dateTime(detail.endsAt) }}</span>
        </div>

        <!-- Winner banner -->
        <div v-if="winner || detail.winner" class="mt-5 rounded-lg bg-emerald-50 border border-emerald-200 p-4">
          <div class="text-sm text-emerald-800">
            🏆 Winner:
            <strong>{{ winner?.winnerName ?? detail.winner?.name ?? "No winner" }}</strong>
            at {{ money(winner?.finalPrice ?? detail.winner?.amount ?? currentPrice) }}
          </div>
        </div>

        <!-- Bid form -->
        <div class="mt-6 border-t border-slate-100 pt-5">
          <template v-if="isActive && isMember">
            <form class="flex gap-2" @submit.prevent="placeBid">
              <input v-model="bidAmount" type="number" step="0.01" min="0"
                :placeholder="`More than ${money(currentPrice)}`"
                class="flex-1 border border-slate-300 rounded-lg px-3 py-2" />
              <button class="bg-indigo-600 text-white rounded-lg px-5 font-medium">Place bid</button>
            </form>
            <p v-if="notice" class="mt-2 text-sm" :class="noticeType === 'error' ? 'text-rose-600' : 'text-emerald-600'">
              {{ notice }}
            </p>
          </template>
          <p v-else-if="isActive && !isMember" class="text-sm text-slate-500">
            Admins can watch but not bid.
          </p>
          <p v-else class="text-sm text-slate-500">Bidding is closed.</p>
        </div>
      </div>

      <!-- Side panels -->
      <div class="space-y-6">
        <!-- Top 10 leaderboard -->
        <div class="bg-white border border-slate-200 rounded-xl p-4">
          <h2 class="font-semibold mb-3">Top 10 bids</h2>
          <ol class="space-y-2 text-sm">
            <li v-for="(b, i) in topBids" :key="b.id" class="flex items-center justify-between">
              <span class="flex items-center gap-2 min-w-0">
                <span class="w-5 text-right text-slate-400 tabular-nums">{{ i + 1 }}</span>
                <span class="truncate" :class="{ 'font-medium': b.userId === user?.id }">
                  {{ b.userName }}<span v-if="b.userId === user?.id" class="text-indigo-600"> (you)</span>
                </span>
              </span>
              <span class="font-medium tabular-nums" :class="{ 'text-amber-600': i === 0 }">
                {{ money(b.amount) }}
              </span>
            </li>
            <li v-if="!topBids.length" class="text-slate-400">No bids yet.</li>
          </ol>
        </div>

        <!-- Bid history -->
        <div class="bg-white border border-slate-200 rounded-xl p-4">
          <h2 class="font-semibold mb-3">Bid history</h2>
          <ul class="space-y-2 text-sm">
            <li v-for="b in history" :key="b.id" class="flex justify-between">
              <span :class="{ 'font-medium': b.userId === user?.id }">
                {{ b.userName }}<span v-if="b.userId === user?.id" class="text-indigo-600"> (you)</span>
              </span>
              <span>{{ money(b.amount) }}</span>
            </li>
            <li v-if="!history.length" class="text-slate-400">No bids yet.</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>
