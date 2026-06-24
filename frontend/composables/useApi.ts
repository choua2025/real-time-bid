// Authenticated fetch wrapper. Injects the Bearer token and, on a 401,
// transparently refreshes the token once and retries.
export function useApi() {
  const config = useRuntimeConfig();
  const base = config.public.apiBase;
  const { accessToken, refreshToken, setSession, clear } = useAuth();

  async function doRefresh(): Promise<boolean> {
    if (!refreshToken.value) return false;
    try {
      const result = await $fetch<any>(`${base}/auth/refresh`, {
        method: "POST",
        body: { refreshToken: refreshToken.value },
      });
      setSession(result);
      return true;
    } catch {
      clear();
      return false;
    }
  }

  function authHeaders(): Record<string, string> {
    return accessToken.value ? { Authorization: `Bearer ${accessToken.value}` } : {};
  }

  async function api<T>(path: string, opts: any = {}): Promise<T> {
    try {
      return await $fetch<T>(`${base}${path}`, { ...opts, headers: { ...(opts.headers || {}), ...authHeaders() } });
    } catch (err: any) {
      const status = err?.statusCode ?? err?.response?.status;
      if (status === 401 && (await doRefresh())) {
        return await $fetch<T>(`${base}${path}`, { ...opts, headers: { ...(opts.headers || {}), ...authHeaders() } });
      }
      throw err;
    }
  }

  // Pull a human-readable message out of an ofetch error.
  function errorMessage(err: any, fallback = "Something went wrong."): string {
    return err?.data?.error || err?.data?.message || err?.message || fallback;
  }

  return { api, errorMessage };
}
