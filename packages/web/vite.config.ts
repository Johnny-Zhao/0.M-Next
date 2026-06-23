import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

const apiTarget = process.env.MNEXT_API ?? "http://localhost:8080";
const apiProxy = { target: apiTarget, changeOrigin: true } as const;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@m-next/domain-interior-design": fileURLToPath(
        new URL("../domains/interior-design/src/index.ts", import.meta.url),
      ),
      "@m-next/views": fileURLToPath(
        new URL("../views/src/index.tsx", import.meta.url),
      ),
    },
  },
  server: {
    proxy: {
      "/workspaces": apiProxy,
      "/views": apiProxy,
      "/meta-commands": apiProxy,
      "/rule-commands": apiProxy,
      "/commands": apiProxy,
    },
  },
});
