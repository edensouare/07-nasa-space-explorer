import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cpSync } from 'node:fs';
import { resolve } from 'node:path';

export default defineConfig({
  base: '/07-nasa-space-explorer/',
  plugins: [
    react(),
    {
      name: 'copy-app-shell-scripts',
      apply: 'build',
      closeBundle() {
        cpSync(resolve('js'), resolve('dist/js'), { recursive: true });
      },
    },
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
});
