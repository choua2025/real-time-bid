// Route guard: unauthenticated users go to /login; non-admins can't reach /admin.
export default defineNuxtRouteMiddleware((to) => {
  // Auth state is restored from localStorage on the client only; on the server
  // we can't know it, so skip — the client runs this guard after hydration.
  if (import.meta.server) return;

  const { isLoggedIn, isAdmin } = useAuth();
  const publicPages = ["/login", "/register"];

  if (publicPages.includes(to.path)) {
    // Already signed in? Skip the auth pages.
    if (isLoggedIn.value) return navigateTo("/");
    return;
  }

  if (!isLoggedIn.value) return navigateTo("/login");
  if (to.path.startsWith("/admin") && !isAdmin.value) return navigateTo("/");
});
