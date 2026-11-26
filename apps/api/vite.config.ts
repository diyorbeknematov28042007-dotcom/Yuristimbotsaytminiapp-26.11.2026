import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
export default defineConfig({
  plugins: [cloudflare({ viteEnvironment: { name: "worker" } })],
  server: { allowedHosts: ["api.internal"] },
});
