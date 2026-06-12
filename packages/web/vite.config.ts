import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@m-next/views": fileURLToPath(
        new URL("../views/src/index.tsx", import.meta.url),
      ),
    },
  },
});
