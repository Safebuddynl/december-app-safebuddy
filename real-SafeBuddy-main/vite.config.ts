import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react()],
  resolve: {
    alias: {
      // "@/..." resolves to "src/...". Keep this in sync with tsconfig paths.
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Mapbox GL is the largest dependency by far. Splitting it off keeps
        // the initial app bundle small and lets the browser cache it
        // separately from application code.
        manualChunks: {
          mapbox: ["mapbox-gl"],
          react: ["react", "react-dom", "react-router-dom"],
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
  },
});
