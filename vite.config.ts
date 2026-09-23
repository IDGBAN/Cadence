import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

// IndexedDB is scoped to host:port, so each port is its own copy of your data.
// The built app lives on 5180 (your real habits); the dev server gets 5173 so you can
// hack on the code without touching them. Both ports are fixed on purpose.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 5180, strictPort: true },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
