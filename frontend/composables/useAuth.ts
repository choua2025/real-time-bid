import type { AuthResult, User } from "~/types/api";

const STORAGE_KEY = "rtb.auth";

// Auth state + actions, backed by useState (reactive) and localStorage
// (persistence across reloads). SPA-only, so localStorage is always available.
export function useAuth() {
  const config = useRuntimeConfig();
  const base = config.public.apiBase;

  const user = useState<User | null>("auth.user", () => null);
  const accessToken = useState<string | null>("auth.access", () => null);
  const refreshToken = useState<string | null>("auth.refresh", () => null);

  const isLoggedIn = computed(() => !!accessToken.value);
  const isAdmin = computed(() => user.value?.role === "ADMIN");
  const isMember = computed(() => user.value?.role === "MEMBER");

  function persist() {
    if (!import.meta.client) return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ user: user.value, accessToken: accessToken.value, refreshToken: refreshToken.value }),
    );
  }

  function hydrate() {
    if (!import.meta.client) return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      user.value = data.user ?? null;
      accessToken.value = data.accessToken ?? null;
      refreshToken.value = data.refreshToken ?? null;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  function setSession(result: AuthResult) {
    user.value = result.user;
    accessToken.value = result.tokens.accessToken;
    refreshToken.value = result.tokens.refreshToken;
    persist();
    // Drop any socket from a previous session so it reconnects with this
    // user's token (relevant when a new user logs in without a page refresh).
    if (import.meta.client) resetSocket();
  }

  function clear() {
    user.value = null;
    accessToken.value = null;
    refreshToken.value = null;
    if (import.meta.client) localStorage.removeItem(STORAGE_KEY);
    // Disconnect the old user's authenticated socket on logout.
    if (import.meta.client) resetSocket();
  }

  async function login(email: string, password: string) {
    setSession(await $fetch<AuthResult>(`${base}/auth/login`, { method: "POST", body: { email, password } }));
  }

  async function register(name: string, email: string, password: string) {
    setSession(
      await $fetch<AuthResult>(`${base}/auth/register`, { method: "POST", body: { name, email, password } }),
    );
  }

  async function logout() {
    try {
      if (refreshToken.value) {
        await $fetch(`${base}/auth/logout`, { method: "POST", body: { refreshToken: refreshToken.value } });
      }
    } catch {
      /* ignore — clear locally regardless */
    }
    clear();
  }

  return {
    user,
    accessToken,
    refreshToken,
    isLoggedIn,
    isAdmin,
    isMember,
    hydrate,
    setSession,
    clear,
    login,
    register,
    logout,
  };
}
