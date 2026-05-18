import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Standalone dev preview for the toolkit dashboard component. Points the
// alias at the in-tree source so iteration on the dashboard component
// reflects immediately. Run with: npm run dev (from preview/dashboard/).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5190,
    strictPort: true,
  },
  resolve: {
    alias: {
      "@chamber-19/desktop-toolkit/dashboard": path.resolve(
        __dirname,
        "../../js/packages/desktop-toolkit/src/dashboard/index.js",
      ),
    },
  },
});