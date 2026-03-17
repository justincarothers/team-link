import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: 'src/main/index.ts',
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: 'src/preload/index.ts',
      },
    },
  },
  renderer: {
    plugins: [react()],
    root: 'src/renderer',
    css: {
      postcss: {
        plugins: [
          tailwindcss({
            content: [
              './src/renderer/**/*.{ts,tsx,html}',
              '../ui/src/**/*.{ts,tsx}',
            ],
          }),
          autoprefixer(),
        ],
      },
    },
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: 'src/renderer/index.html',
      },
    },
  },
});
