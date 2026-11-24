import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // In dev, forward all /api calls to the FastAPI backend
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    // Output to frontend/dist — already wired into main.py StaticFiles mount
    outDir: "dist",
  },
});
