import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes('node_modules/react') ||
            id.includes('node_modules/react-dom') ||
            id.includes('node_modules/papaparse') ||
            id.includes('node_modules/canvas-confetti') ||
            id.includes('node_modules/lucide-react')
          ) {
            return 'vendor';
          }
        },
      },
    },
  },
});
