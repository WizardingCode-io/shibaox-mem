import { fileURLToPath } from "node:url";
import ui from "@nuxt/ui/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// The viewer: Vue 3, Tailwind 4 and Nuxt UI, built into one HTML file that the binary
// embeds and serves. In development, `bun run ui:dev` proxies /api and /assets to a
// running `wizardingcode-mem ui`.

const root = fileURLToPath(new URL("./", import.meta.url));

export default defineConfig({
  root,
  base: "./",
  plugins: [
    vue(),
    ui({
      router: false,
      ui: {
        colors: { primary: "violet", neutral: "stone" },
        // Labels speak in the machine's voice: mono, like the design system's Badge.
        badge: { slots: { base: "font-mono tracking-[.02em]" } },
      },
      // The theme is written from the brand's tokens in app.css; nothing is generated here.
      dts: false,
      // Every icon the app and Nuxt UI use travels inside the page: the viewer must work
      // with no network at all, so none is fetched from iconify's API at runtime.
      icon: { clientBundle: { scan: true, sizeLimitKb: 512 } },
    }),
    viteSingleFile({ removeViteModuleLoader: true }),
  ],
  build: {
    outDir: fileURLToPath(new URL("../src/ui/dist", import.meta.url)),
    emptyOutDir: true,
    target: "es2022",
    cssTarget: "chrome120",
    reportCompressedSize: false,
  },
  server: {
    port: 5180,
    // `changeOrigin`: the viewer's server checks the Host header, so the proxied request
    // must carry the server's own host, not localhost:5180.
    proxy: {
      "/api": { target: process.env.WIZARDINGCODE_MEM_UI ?? "http://127.0.0.1:7777", changeOrigin: true },
      "/assets": { target: process.env.WIZARDINGCODE_MEM_UI ?? "http://127.0.0.1:7777", changeOrigin: true },
    },
  },
});
