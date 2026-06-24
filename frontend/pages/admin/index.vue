<script setup lang="ts">
import type { AdminAuctionOverview, PhoneNumber } from "~/types/api";

const { api, errorMessage } = useApi();
const { money, dateTime } = useFormat();

const phones = ref<PhoneNumber[]>([]);
const auctions = ref<AdminAuctionOverview[]>([]);
const msg = ref("");
const msgType = ref<"error" | "success">("success");

function flash(text: string, type: "error" | "success") {
  msg.value = text;
  msgType.value = type;
  setTimeout(() => (msg.value = ""), 4000);
}

// --- phone number form ---
const phoneForm = ref({ msisdn: "", type: "PREPAID", category: "GOLD" });

// --- auction form ---
const auctionForm = ref({ phoneNumberId: "", floorPrice: "", startsAt: "", endsAt: "" });

async function loadAll() {
  try {
    [phones.value, auctions.value] = await Promise.all([
      api<PhoneNumber[]>("/phone-numbers"),
      api<AdminAuctionOverview[]>("/auctions/admin/overview"),
    ]);
  } catch (err) {
    flash(errorMessage(err, "Failed to load admin data."), "error");
  }
}

async function createPhone() {
  try {
    await api("/phone-numbers", { method: "POST", body: { ...phoneForm.value } });
    phoneForm.value.msisdn = "";
    flash("Phone number created.", "success");
    await loadAll();
  } catch (err) {
    flash(errorMessage(err, "Could not create phone number."), "error");
  }
}

async function createAuction() {
  try {
    await api("/auctions", {
      method: "POST",
      body: {
        phoneNumberId: auctionForm.value.phoneNumberId,
        floorPrice: auctionForm.value.floorPrice,
        startsAt: new Date(auctionForm.value.startsAt).toISOString(),
        endsAt: new Date(auctionForm.value.endsAt).toISOString(),
      },
    });
    flash("Auction created.", "success");
    auctionForm.value.floorPrice = "";
    await loadAll();
  } catch (err) {
    flash(errorMessage(err, "Could not create auction."), "error");
  }
}

async function cancelAuction(id: string) {
  try {
    await api(`/auctions/${id}/cancel`, { method: "POST" });
    flash("Auction cancelled.", "success");
    await loadAll();
  } catch (err) {
    flash(errorMessage(err, "Could not cancel auction."), "error");
  }
}

onMounted(loadAll);
</script>

<template>
  <div class="space-y-8">
    <h1 class="text-2xl font-semibold">Admin</h1>
    <p v-if="msg" class="text-sm" :class="msgType === 'error' ? 'text-rose-600' : 'text-emerald-600'">{{ msg }}</p>

    <div class="grid gap-6 md:grid-cols-2">
      <!-- Create phone number -->
      <section class="bg-white border border-slate-200 rounded-xl p-5">
        <h2 class="font-semibold mb-3">New phone number</h2>
        <form class="space-y-3" @submit.prevent="createPhone">
          <input v-model="phoneForm.msisdn" placeholder="MSISDN (digits only)" required
            class="w-full border border-slate-300 rounded-lg px-3 py-2" />
          <div class="flex gap-3">
            <select v-model="phoneForm.type" class="flex-1 border border-slate-300 rounded-lg px-3 py-2">
              <option value="PREPAID">PREPAID</option>
              <option value="POSTPAID">POSTPAID</option>
            </select>
            <input v-model="phoneForm.category" placeholder="Category" required
              class="flex-1 border border-slate-300 rounded-lg px-3 py-2" />
          </div>
          <button class="bg-indigo-600 text-white rounded-lg px-4 py-2 font-medium">Create</button>
        </form>
      </section>

      <!-- Create auction -->
      <section class="bg-white border border-slate-200 rounded-xl p-5">
        <h2 class="font-semibold mb-3">New auction</h2>
        <form class="space-y-3" @submit.prevent="createAuction">
          <select v-model="auctionForm.phoneNumberId" required
            class="w-full border border-slate-300 rounded-lg px-3 py-2">
            <option value="" disabled>Select a phone number</option>
            <option v-for="p in phones" :key="p.id" :value="p.id">{{ p.msisdn }} ({{ p.category }})</option>
          </select>
          <input v-model="auctionForm.floorPrice" type="number" step="0.01" min="0.01" placeholder="Floor price" required
            class="w-full border border-slate-300 rounded-lg px-3 py-2" />
          <label class="block text-xs text-slate-500">Starts at
            <input v-model="auctionForm.startsAt" type="datetime-local" required
              class="w-full border border-slate-300 rounded-lg px-3 py-2" />
          </label>
          <label class="block text-xs text-slate-500">Ends at
            <input v-model="auctionForm.endsAt" type="datetime-local" required
              class="w-full border border-slate-300 rounded-lg px-3 py-2" />
          </label>
          <button class="bg-indigo-600 text-white rounded-lg px-4 py-2 font-medium">Create</button>
        </form>
      </section>
    </div>

    <!-- Auctions table -->
    <section class="bg-white border border-slate-200 rounded-xl p-5">
      <h2 class="font-semibold mb-3">Auctions</h2>
      <table class="w-full text-sm">
        <thead class="text-left text-slate-500">
          <tr>
            <th class="py-2">Number</th><th>Status</th><th>Current</th><th>Top bidder</th><th>Ends</th><th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in auctions" :key="a.id" class="border-t border-slate-100">
            <td class="py-2 font-mono">{{ a.phoneNumber.msisdn }}</td>
            <td>{{ a.status }}</td>
            <td>{{ money(a.currentPrice) }}</td>
            <td>
              <span v-if="a.topBidder">{{ a.topBidder.name }} ({{ money(a.topBidder.amount) }})</span>
              <span v-else class="text-slate-400">No bids</span>
            </td>
            <td>{{ dateTime(a.endsAt) }}</td>
            <td class="text-right">
              <button v-if="a.status === 'ACTIVE' || a.status === 'SCHEDULED'"
                class="text-rose-600 hover:underline" @click="cancelAuction(a.id)">Cancel</button>
            </td>
          </tr>
          <tr v-if="!auctions.length"><td colspan="6" class="py-3 text-slate-400">No auctions.</td></tr>
        </tbody>
      </table>
    </section>
  </div>
</template>
