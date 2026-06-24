<script setup lang="ts">
const { login } = useAuth();
const { errorMessage } = useApi();

const email = ref("");
const password = ref("");
const error = ref("");
const loading = ref(false);

async function submit() {
  error.value = "";
  loading.value = true;
  try {
    await login(email.value, password.value);
    await navigateTo("/");
  } catch (err) {
    error.value = errorMessage(err, "Login failed.");
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="max-w-sm mx-auto mt-10 bg-white p-6 rounded-xl border border-slate-200">
    <h1 class="text-xl font-semibold mb-4">Log in</h1>
    <form class="space-y-3" @submit.prevent="submit">
      <input v-model="email" type="email" placeholder="Email" required
        class="w-full border border-slate-300 rounded-lg px-3 py-2" />
      <input v-model="password" type="password" placeholder="Password" required
        class="w-full border border-slate-300 rounded-lg px-3 py-2" />
      <p v-if="error" class="text-sm text-rose-600">{{ error }}</p>
      <button :disabled="loading"
        class="w-full bg-indigo-600 text-white rounded-lg py-2 font-medium disabled:opacity-50">
        {{ loading ? "Signing in…" : "Log in" }}
      </button>
    </form>
    <p class="text-sm text-slate-500 mt-4">
      No account? <NuxtLink to="/register" class="text-indigo-600">Register</NuxtLink>
    </p>
  </div>
</template>
