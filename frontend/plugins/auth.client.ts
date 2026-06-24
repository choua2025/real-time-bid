// Restore the persisted session before route middleware runs.
export default defineNuxtPlugin(() => {
  useAuth().hydrate();
});
