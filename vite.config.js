import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

// The Cloudflare plugin runs worker/ in workerd next to the React dev server,
// so /api and /bot work locally exactly as on workers.dev.
export default defineConfig({
  plugins: [react(), cloudflare()],
});
