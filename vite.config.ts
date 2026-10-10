import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: { port: 1420, watch: { ignored: ['**/src-tauri/**','**/.tools/**','**/.reference/**'] } },
  // One local bundle loaded from disk by the desktop shell; splitting would not speed anything up.
  build: { chunkSizeWarningLimit: 800 },
  clearScreen: false
});
