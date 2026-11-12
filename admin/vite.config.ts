import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

function blockSensitiveFsPlugin(): Plugin {
  const blockedPatterns = [
    /\/private(?:\/|$)/i,
    /\/backend(?:\/|$)/i,
    /\/frontend(?:\/|$)/i,
    /\/\.git(?:\/|$)/i,
    /\/\.env(?:\.|$)/i,
    /\.sqlite(?:$|[-?])/i,
    /\.(?:crt|pem)(?:$|\?)/i,
  ];
  return {
    name: "block-sensitive-fs",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        let pathname = (req.url || "").split("?")[0];
        try {
          pathname = decodeURIComponent(pathname);
        } catch {
          // ignore malformed percent encoding
        }
        if (
          pathname.startsWith("/@fs/") &&
          blockedPatterns.some((re) => re.test(pathname))
        ) {
          res.statusCode = 403;
          res.end("Forbidden");
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [blockSensitiveFsPlugin(), react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: 5174,
    strictPort: true,
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
        "**/frontend/**",
        "**/*.sqlite*",
      ],
    },
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4000",
        changeOrigin: false,
      },
    },
  },
});

