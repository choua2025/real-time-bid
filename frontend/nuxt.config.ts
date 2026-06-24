export default defineNuxtConfig({
  // SSR enabled (Nuxt default). Auth lives in localStorage (client-only), so
  // the route guard below short-circuits on the server and pages fetch their
  // data in onMounted — the server render is just a skeleton that hydrates.
  compatibilityDate: "2025-01-01",
  devtools: { enabled: false },

  modules: ["@nuxtjs/tailwindcss"],
  tailwindcss: { cssPath: "~/assets/css/tailwind.css" },

  devServer: { port: 3001 },

  runtimeConfig: {
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || "http://localhost:3000/api",
      socketUrl: process.env.NUXT_PUBLIC_SOCKET_URL || "http://localhost:3000",
    },
  },

  app: {
    head: {
      title: "Phone Number Auctions",
      meta: [{ name: "viewport", content: "width=device-width, initial-scale=1" }],
    },
  },
});
