<script setup lang="ts">
import type { BidView } from "~/types/api";

const { api, errorMessage } = useApi();
const { money, dateTime } = useFormat();

const bids = ref<BidView[]>([]);
const loading = ref(true);
const error = ref("");

onMounted(async () => {
  try {
    bids.value = await api<BidView[]>("/me/bids");
  } catch (err) {
    error.value = errorMessage(err, "Could not load your bids.");
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div>
    <h1 class="text-2xl font-semibold mb-4">My bids</h1>
    <p v-if="loading" class="text-slate-500">Loading…</p>
    <p v-else-if="error" class="text-rose-600">{{ error }}</p>
    <p v-else-if="!bids.length" class="text-slate-500">You haven't placed any bids yet.</p>

    <div v-else class="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
      <NuxtLink v-for="b in bids" :key="b.id" :to="`/auctions/${b.auctionId}`"
        class="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
        <span class="text-sm text-slate-500">{{ dateTime(b.bidAt) }}</span>
        <span class="font-medium text-indigo-600">{{ money(b.amount) }}</span>
      </NuxtLink>
    </div>
  </div>
</template>
