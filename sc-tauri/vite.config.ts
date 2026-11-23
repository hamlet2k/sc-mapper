import { defineConfig } from "vite";

// Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`.
export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
