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
        // The compact scale of WizardingCode's apps (Sales OS DENSITY.md): buttons 28px
        // (sm) and 32px (md), radius 8, 12.5px semibold; fields 32px, 13px; badges 20px mono.
        button: {
          slots: { base: "rounded-lg font-semibold tracking-[-0.005em] py-0" },
          variants: {
            size: {
              xs: { base: "h-6 px-2 text-xs gap-1", leadingIcon: "size-3.5", trailingIcon: "size-3.5" },
              sm: { base: "h-7 px-3 text-[12.5px] leading-4 gap-1.5", leadingIcon: "size-3.5", trailingIcon: "size-3.5" },
              md: { base: "h-8 px-4 text-[13px] leading-4 gap-1.5", leadingIcon: "size-4", trailingIcon: "size-4" },
            },
          },
          defaultVariants: { size: "sm" },
        },
        input: {
          slots: { base: "rounded-lg" },
          variants: { size: { sm: { base: "h-7 text-[12.5px]" }, md: { base: "h-8 text-[13px]" } } },
        },
        selectMenu: {
          slots: { base: "rounded-lg", content: "rounded-[10px]", item: "text-[13px] h-8" },
          variants: { size: { sm: { base: "h-7 text-[12.5px]" }, md: { base: "h-8 text-[13px]" } } },
        },
        textarea: { slots: { base: "rounded-lg text-[13px]" } },
        badge: {
          slots: { base: "font-mono tracking-[.02em] rounded" },
          variants: { size: { sm: { base: "h-5 px-1.5 text-[11px]" } } },
        },
        kbd: { base: "font-mono text-[10.5px]" },
        tooltip: {
          slots: { content: "bg-(--console) text-(--console-ink) ring-0 rounded-md px-2 py-1 text-xs" },
        },
        // Toasts are dark, as in Sales OS STATES.md: console surface, ivory text.
        toast: {
          slots: {
            root: "bg-(--console) ring-0 rounded-[10px] p-3 shadow-lg",
            title: "text-[13px] font-semibold text-(--console-ink)",
            description: "text-xs text-(--console-muted)",
            icon: "size-4",
          },
        },
        slideover: { slots: { content: "bg-(--surface)" } },
        modal: { slots: { content: "rounded-xl ring-(--line)" } },
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
