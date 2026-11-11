import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

export default defineConfig({
  base: '/07-nasa-space-explorer/',
  plugins: [
    react(),
    {
      name: 'prepare-app-shell',
      apply: 'build',
      closeBundle() {
        cpSync(resolve('js'), resolve('dist/js'), { recursive: true });

        const workerPath = resolve('dist/service-worker.js');
        const worker = readFileSync(workerPath, 'utf8');
        const buildVersion = createHash('sha256')
          .update(worker)
          .update(readFileSync(resolve('dist/index.html')))
          .update(readFileSync(resolve('dist/manifest.json')))
          .digest('hex')
          .slice(0, 12);
        writeFileSync(workerPath, worker.replace('__BUILD_VERSION__', buildVersion));
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
