import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: { port: 1420, watch: { ignored: ['**/src-tauri/**','**/.tools/**','**/.reference/**'] } },
  // spike.html is the React prototype of the today screen; index.html remains the app.
  build: { rollupOptions: { input: { main: 'index.html', spike: 'spike.html' } } },
  clearScreen: false
});
