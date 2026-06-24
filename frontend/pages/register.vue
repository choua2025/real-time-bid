<script setup lang="ts">
const { register } = useAuth();
const { errorMessage } = useApi();

const name = ref("");
const email = ref("");
const password = ref("");
const error = ref("");
const loading = ref(false);

async function submit() {
  error.value = "";
  loading.value = true;
  try {
    await register(name.value, email.value, password.value);
    await navigateTo("/");
  } catch (err) {
    error.value = errorMessage(err, "Registration failed.");
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="max-w-sm mx-auto mt-10 bg-white p-6 rounded-xl border border-slate-200">
    <h1 class="text-xl font-semibold mb-4">Create an account</h1>
    <form class="space-y-3" @submit.prevent="submit">
      <input v-model="name" type="text" placeholder="Full name" required
        class="w-full border border-slate-300 rounded-lg px-3 py-2" />
      <input v-model="email" type="email" placeholder="Email" required
        class="w-full border border-slate-300 rounded-lg px-3 py-2" />
      <input v-model="password" type="password" placeholder="Password (min 8 chars)" required minlength="8"
        class="w-full border border-slate-300 rounded-lg px-3 py-2" />
      <p v-if="error" class="text-sm text-rose-600">{{ error }}</p>
      <button :disabled="loading"
        class="w-full bg-indigo-600 text-white rounded-lg py-2 font-medium disabled:opacity-50">
        {{ loading ? "Creating…" : "Register" }}
      </button>
    </form>
    <p class="text-sm text-slate-500 mt-4">
      Already have an account? <NuxtLink to="/login" class="text-indigo-600">Log in</NuxtLink>
    </p>
  </div>
</template>
