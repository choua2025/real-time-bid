<script setup lang="ts">
const { user, isLoggedIn, isAdmin, logout } = useAuth();

async function onLogout() {
  await logout();
  await navigateTo("/login");
}
</script>

<template>
  <div class="min-h-screen bg-slate-50 text-slate-800">
    <header class="bg-white border-b border-slate-200">
      <div class="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <NuxtLink to="/" class="font-semibold text-lg text-indigo-600">📱 Number Auctions</NuxtLink>
        <nav class="flex items-center gap-4 text-sm">
          <template v-if="isLoggedIn">
            <NuxtLink to="/" class="hover:text-indigo-600">Auctions</NuxtLink>
            <NuxtLink to="/me/bids" class="hover:text-indigo-600">My bids</NuxtLink>
            <NuxtLink v-if="isAdmin" to="/admin" class="hover:text-indigo-600">Admin</NuxtLink>
            <span class="text-slate-400">|</span>
            <span class="text-slate-500">{{ user?.name }}</span>
            <button class="text-rose-600 hover:underline" @click="onLogout">Log out</button>
          </template>
          <template v-else>
            <NuxtLink to="/login" class="hover:text-indigo-600">Log in</NuxtLink>
            <NuxtLink to="/register" class="hover:text-indigo-600">Register</NuxtLink>
          </template>
        </nav>
      </div>
    </header>

    <main class="max-w-5xl mx-auto px-4 py-6">
      <slot />
    </main>
  </div>
</template>
