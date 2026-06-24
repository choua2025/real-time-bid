<script setup lang="ts">
import type { AuctionStatus, AuctionSummary } from "~/types/api";

const { api, errorMessage } = useApi();
const { money, dateTime } = useFormat();

const auctions = ref<AuctionSummary[]>([]);
const loading = ref(true);
const error = ref("");
const statusFilter = ref<AuctionStatus | "">("");

const statusClass: Record<AuctionStatus, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700",
  SCHEDULED: "bg-amber-100 text-amber-700",
  ENDED: "bg-slate-200 text-slate-600",
  CANCELLED: "bg-rose-100 text-rose-700",
};

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const query = statusFilter.value ? `?status=${statusFilter.value}` : "";
    auctions.value = await api<AuctionSummary[]>(`/auctions${query}`);
  } catch (err) {
    error.value = errorMessage(err, "Could not load auctions.");
  } finally {
    loading.value = false;
  }
}

watch(statusFilter, load);
onMounted(load);
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-2xl font-semibold">Auctions</h1>
      <select v-model="statusFilter" class="border border-slate-300 rounded-lg px-3 py-1.5 text-sm">
        <option value="">All statuses</option>
        <option value="ACTIVE">Active</option>
        <option value="SCHEDULED">Scheduled</option>
        <option value="ENDED">Ended</option>
        <option value="CANCELLED">Cancelled</option>
      </select>
    </div>

    <p v-if="loading" class="text-slate-500">Loading…</p>
    <p v-else-if="error" class="text-rose-600">{{ error }}</p>
    <p v-else-if="!auctions.length" class="text-slate-500">No auctions found.</p>

    <div v-else class="grid gap-4 sm:grid-cols-2">
      <NuxtLink v-for="a in auctions" :key="a.id" :to="`/auctions/${a.id}`"
        class="bg-white border border-slate-200 rounded-xl p-4 hover:border-indigo-400 transition">
        <div class="flex items-center justify-between">
          <span class="font-mono text-lg">{{ a.phoneNumber.msisdn }}</span>
          <span class="text-xs px-2 py-0.5 rounded-full" :class="statusClass[a.status]">{{ a.status }}</span>
        </div>
        <div class="text-xs text-slate-500 mt-1">{{ a.phoneNumber.category }} · {{ a.phoneNumber.type }}</div>
        <div class="mt-3 flex items-end justify-between">
          <div>
            <div class="text-xs text-slate-500">Current price</div>
            <div class="text-xl font-semibold text-indigo-600">{{ money(a.currentPrice) }}</div>
          </div>
          <div class="text-right text-xs text-slate-500">
            <div>{{ a.bidCount }} bid(s)</div>
            <div>ends {{ dateTime(a.endsAt) }}</div>
          </div>
        </div>
      </NuxtLink>
    </div>
  </div>
</template>
