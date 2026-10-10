import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: { port: 1420, watch: { ignored: ['**/src-tauri/**','**/.tools/**','**/.reference/**'] } },
  // legacy.html keeps the previous screens reachable for comparison until the migration removes them.
  build: { rollupOptions: { input: { main: 'index.html', legacy: 'legacy.html' } } },
  clearScreen: false
});
