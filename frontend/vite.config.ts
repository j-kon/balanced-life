import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    fs: {
      strict: true,
      allow: [
        fileURLToPath(new URL(".", import.meta.url)),
        fileURLToPath(new URL("../node_modules", import.meta.url)),
      ],
      deny: [
        "**/.env",
        "**/.env.*",
        "**/*.{crt,pem}",
        "**/.git/**",
        "**/private/**",
        "**/backend/**",
        "**/*.sqlite*",
      ],
    },
    proxy: { "/api": { target: "http://127.0.0.1:4000", changeOrigin: false } },
  },
});
