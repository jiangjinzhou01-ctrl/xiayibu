import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  root: 'web',
  base: '/xiayibu/',
  plugins: [preact()],
  build: { outDir: '../dist', emptyOutDir: true },
});
